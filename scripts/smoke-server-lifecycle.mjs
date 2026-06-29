import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT_DIR = process.cwd();
const API_HOST = "127.0.0.1";
const API_PORT = Number(process.env.SMOKE_LIFECYCLE_PORT ?? 0) || 7800 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const TIMEOUT_MS = Number(process.env.SMOKE_LIFECYCLE_TIMEOUT_MS ?? 20_000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function waitForHealth(deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const { response, payload } = await readJson(`${BASE_URL}/api/health`);
      if (response.ok && payload.ok === true) return payload;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(300);
  }
  throw lastError ?? new Error("server did not become healthy");
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ timedOut: true, code: null, signal: "SIGKILL" });
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timedOut: false, code, signal });
    });
  });
}

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "nosu-lifecycle-smoke-"));
  let stdout = "";
  let stderr = "";
  const child = fork("server/index.js", [], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      API_HOST,
      API_PORT: String(API_PORT),
      ALLOWED_ORIGINS: "http://127.0.0.1:5173",
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
      SHUTDOWN_GRACE_MS: "4000",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const health = await waitForHealth(Date.now() + TIMEOUT_MS);
    assert(health.runtime?.process && typeof health.runtime.process === "object", "health should expose runtime.process");
    assert(health.runtime.process.pid === child.pid, "runtime.process.pid should match the server pid");
    assert(health.runtime.process.shuttingDown === false, "fresh server should not be shutting down");
    assert(health.runtime.process.shutdownGraceMs === 4000, "runtime should expose shutdown grace");
    assert(Number.isFinite(health.runtime.process.uptimeSeconds), "runtime should expose uptime seconds");

    child.send({ type: "shutdown" });
    const exit = await waitForExit(child, TIMEOUT_MS);
    assert(!exit.timedOut, "server should exit before lifecycle smoke timeout");
    assert(exit.code === 0, `server should exit cleanly after shutdown request: code=${exit.code} signal=${exit.signal}`);
    assert(stdout.includes("shutdown requested"), "server should log shutdown request");
    assert(stdout.includes("shutdown complete"), "server should log shutdown completion");
    console.log("Server lifecycle smoke passed", {
      api: BASE_URL,
      pid: child.pid,
      shutdown: "ipc",
    });
  } finally {
    if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    if (process.exitCode) {
      console.error(stdout.slice(-2000));
      console.error(stderr.slice(-2000));
    }
  }
}

main().catch((error) => {
  console.error("Server lifecycle smoke failed:", error.message);
  process.exitCode = 1;
});
