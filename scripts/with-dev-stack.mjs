import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const VITE_BIN = path.join(ROOT_DIR, "node_modules", "vite", "bin", "vite.js");
const API_HOST = process.env.SMOKE_DEV_HOST ?? "127.0.0.1";
const API_PORT = Number(process.env.SMOKE_DEV_API_PORT ?? 0) || 4300 + Math.floor(Math.random() * 1000);
const VITE_PORT = Number(process.env.SMOKE_DEV_VITE_PORT ?? 0) || 5300 + Math.floor(Math.random() * 1000);
const TIMEOUT_MS = Number(process.env.SMOKE_DEV_TIMEOUT_MS ?? 300_000);
const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;
const APP_URL = `http://${API_HOST}:${VITE_PORT}/`;
const APP_ORIGIN = `http://${API_HOST}:${VITE_PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCommand() {
  const args = process.argv.slice(2);
  const separator = args.indexOf("--");
  const commandArgs = separator >= 0 ? args.slice(separator + 1) : args;
  assert(commandArgs.length > 0, "with-dev-stack requires a command after `--`.");
  return {
    command: commandArgs[0] === "node" ? process.execPath : commandArgs[0],
    args: commandArgs.slice(1),
  };
}

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function writeJson(url, body) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function createSmokeSeedState() {
  return {
    users: [
      {
        id: "u_admin",
        loginId: "nosu",
        password: "demo",
        authProvider: "local",
        phone: "010-0000-2026",
        phoneVerified: true,
        displayName: "운영자",
        title: "노수베스트 운영팀",
        bio: "관리형 smoke 검증용 관리자 계정",
        photoUrl: "",
        role: "admin",
        coins: 1200,
        claims: [],
        stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
      },
    ],
    rooms: [
      {
        id: "r_smoke",
        title: "Smoke Room",
        topic: "Managed smoke should expose a valid room",
        createdBy: "u_admin",
        createdAt: "06.21 00:00",
      },
    ],
    channels: [
      {
        id: "d_smoke",
        roomId: "r_smoke",
        title: "Smoke Debate",
        visibility: "public",
        inviteCode: "",
        format: "text",
        status: "waiting",
        phase: "ready",
        createdBy: "u_admin",
        participantIds: [],
        spectatorIds: [],
        participantSnapshots: {},
        stanceByUser: {},
        readyUserIds: [],
        remainingSecondsByUser: {},
        debateMessages: [],
        spectatorMessages: [],
        votes: [],
        reactions: [],
        reports: [],
        coinStake: 0,
        participantLimit: 2,
        createdAt: "06.21 00:01",
      },
    ],
    ledger: [],
    reports: [],
    sanctions: [],
    notifications: [],
    auditLogs: [],
    currentUserId: null,
  };
}

async function ensureSeedState() {
  const { payload } = await readJson(`${API_BASE_URL}/api/state`);
  if (payload?.state) return false;
  const seeded = await writeJson(`${API_BASE_URL}/api/state`, { state: createSmokeSeedState() });
  assert(seeded.response.ok, `failed to seed managed smoke state: ${seeded.response.status}`);
  return true;
}

async function waitForHealth(url, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const { response, payload } = await readJson(url);
      if (response.ok && payload.ok === true) return payload;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(350);
  }
  throw lastError ?? new Error(`${url} did not become healthy in time`);
}

function collectLogs(processName, child, logs) {
  child.stdout?.on("data", (chunk) => logs.push(`[${processName}] ${String(chunk).trim()}`));
  child.stderr?.on("data", (chunk) => logs.push(`[${processName}] ${String(chunk).trim()}`));
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill();
    setTimeout(resolve, 2500).unref();
  });
}

function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  assert(existsSync(VITE_BIN), "Vite binary is missing. Run `npm install` before smoke checks.");
  const { command, args } = parseCommand();
  const dataDir = await mkdtemp(path.join(tmpdir(), "nosu-dev-stack-"));
  const logs = [];
  const stackEnv = {
    ...process.env,
    NODE_ENV: "development",
    API_HOST,
    API_PORT: String(API_PORT),
    ALLOWED_ORIGINS: APP_ORIGIN,
    DATA_DIR: dataDir,
    SUPABASE_URL: "https://your-project-ref.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "your-service-role-or-secret-key",
    SUPABASE_SECRET_KEY: "your-service-role-or-secret-key",
    SUPABASE_ANON_KEY: "your-supabase-anon-key",
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_ANON_KEY: "",
    ENABLE_DEMO_AUTH: "true",
    ENABLE_OPEN_STATE_WRITE: "true",
    AI_JUDGE_FORCE_LOCAL: "true",
  };

  const api = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT_DIR,
    env: stackEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const vite = spawn(process.execPath, [VITE_BIN, "--host", API_HOST, "--port", String(VITE_PORT), "--strictPort"], {
    cwd: ROOT_DIR,
    env: stackEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  collectLogs("api", api, logs);
  collectLogs("vite", vite, logs);

  try {
    const deadline = Date.now() + TIMEOUT_MS;
    await waitForHealth(`${API_BASE_URL}/api/health`, deadline);
    const seeded = await ensureSeedState();
    await waitForHealth(`${APP_URL}api/health`, deadline);
    console.log("Managed dev stack ready", {
      api: API_BASE_URL,
      app: APP_URL,
      dataDir,
      seeded,
    });

    const result = await runCommand(command, args, {
      ...stackEnv,
      SMOKE_API_HEALTH_URL: `${API_BASE_URL}/api/health`,
      SMOKE_API_STATE_URL: `${API_BASE_URL}/api/state`,
      SMOKE_API_AUTH_DEMO_URL: `${API_BASE_URL}/api/auth/select-demo`,
      SMOKE_API_ADMIN_READINESS_URL: `${API_BASE_URL}/api/admin/readiness`,
      SMOKE_API_ADMIN_STORAGE_CHECK_URL: `${API_BASE_URL}/api/admin/storage-check`,
      SMOKE_API_ADMIN_SYNC_NORMALIZED_URL: `${API_BASE_URL}/api/admin/sync-normalized`,
      SMOKE_VITE_HEALTH_URL: `${APP_URL}api/health`,
      SMOKE_APP_URL: APP_URL,
      SMOKE_ORIGIN: APP_ORIGIN,
    });
    if (result.code !== 0) {
      process.exitCode = result.code ?? 1;
    }
  } catch (error) {
    console.error("Managed dev stack failed:", error.message);
    if (logs.length) console.error(logs.slice(-80).join("\n"));
    process.exitCode = 1;
  } finally {
    await Promise.all([stopProcess(vite), stopProcess(api)]);
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Managed dev stack failed:", error.message);
  process.exitCode = 1;
});
