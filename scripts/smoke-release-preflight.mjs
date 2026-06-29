import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT_DIR = process.cwd();
const START_SCRIPT = path.join(ROOT_DIR, "scripts", "start-release.mjs");
const DIST_INDEX = path.join(ROOT_DIR, "dist", "index.html");
const API_PORT = Number(process.env.SMOKE_RELEASE_PREFLIGHT_PORT ?? 0) || 7300 + Math.floor(Math.random() * 1000);
const API_HOST = "127.0.0.1";
const BIND_HOST = "0.0.0.0";
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const PUBLIC_ORIGIN = process.env.SMOKE_RELEASE_PREFLIGHT_ORIGIN ?? "https://nosu-best.kr";
const BLOCKED_ORIGIN = process.env.SMOKE_RELEASE_PREFLIGHT_BLOCKED_ORIGIN ?? "https://blocked.example.test";
const TIMEOUT_MS = Number(process.env.SMOKE_RELEASE_PREFLIGHT_TIMEOUT_MS ?? 30_000);
const REPORT_PATH =
  process.env.SMOKE_RELEASE_PREFLIGHT_REPORT_PATH ??
  path.join(ROOT_DIR, "output", "release-preflight-report.json");
const MARKDOWN_REPORT_PATH =
  process.env.SMOKE_RELEASE_PREFLIGHT_MARKDOWN_PATH ??
  path.join(ROOT_DIR, "output", "release-preflight-report.md");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativePath(filePath) {
  return path.relative(ROOT_DIR, filePath) || path.basename(filePath);
}

function assertReleaseProviderDiagnostics(health) {
  const providers = health.runtime?.providerDiagnostics;
  assert(providers && typeof providers === "object", "release preflight should expose provider diagnostics");
  assert(providers.sms?.productionReady === true, "release preflight should mark SMS provider production-ready");
  assert(providers.sms.provider === "solapi", "release preflight should use SOLAPI SMS");
  assert(providers.sms.debugCodeExposed === false, "release preflight should hide SMS debug codes");
  assert(providers.oauth?.productionReady === true, "release preflight should mark OAuth production-ready");
  assert(providers.ai?.productionReady === true, "release preflight should mark AI judge production-ready");
  assert(providers.ai.forceLocal === false, "release preflight should not force local AI judge");
  assert(providers.storage?.productionReady === true, "release preflight should mark normalized storage production-ready");
  return {
    sms: {
      status: providers.sms.productionReady ? "ready" : "blocked",
      provider: providers.sms.provider,
      configured: providers.sms.configured,
      debugCodeExposed: providers.sms.debugCodeExposed,
    },
    oauth: {
      status: providers.oauth.productionReady ? "ready" : "blocked",
      serverConfigured: providers.oauth.serverConfigured,
      clientConfigured: providers.oauth.clientConfigured,
      anonKeyPresent: providers.oauth.anonKeyPresent,
    },
    ai: {
      status: providers.ai.productionReady ? "ready" : "blocked",
      configured: providers.ai.configured,
      model: providers.ai.model,
      forceLocal: providers.ai.forceLocal,
    },
    storage: {
      status: providers.storage.productionReady ? "ready" : "blocked",
      storage: providers.storage.storage,
      storageMode: providers.storage.storageMode,
      supabaseConfigured: providers.storage.supabaseConfigured,
      normalized: providers.storage.normalized,
    },
  };
}

function buildReleaseEnv(tempDir) {
  const long = "abcdefghijklmnopqrstuvwxyz1234567890";
  return [
    "NODE_ENV=production",
    `API_PORT=${API_PORT}`,
    `API_HOST=${BIND_HOST}`,
    `ALLOWED_ORIGINS=${PUBLIC_ORIGIN}`,
    "SERVE_STATIC_APP=true",
    "RELEASE_VERSION=0.1.0",
    "RELEASE_COMMIT=0123456789abcdef0123456789abcdef01234567",
    "RELEASE_CHANNEL=production",
    "RELEASE_BUILD_TIME=2026-06-22T00:00:00.000Z",
    `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    "SHUTDOWN_GRACE_MS=8000",
    "DEBATE_CLOCK_TICK_MS=1000",
    "ENABLE_DEMO_AUTH=false",
    "ENABLE_OPEN_STATE_WRITE=false",
    "PHONE_CODE_HIDE_DEBUG=true",
    "RATE_LIMIT_AUTH_WINDOW_SECONDS=600",
    "RATE_LIMIT_LOGIN_MAX=8",
    "RATE_LIMIT_SIGNUP_MAX=5",
    "RATE_LIMIT_SOCIAL_MAX=12",
    "RATE_LIMIT_DEMO_MAX=40",
    "RATE_LIMIT_PHONE_REQUEST_MAX=5",
    "RATE_LIMIT_PHONE_VERIFY_MAX=10",
    "RATE_LIMIT_PASSWORD_MAX=6",
    "RATE_LIMIT_WRITE_WINDOW_SECONDS=60",
    "RATE_LIMIT_MESSAGE_MAX=30",
    "RATE_LIMIT_REPORT_MAX=10",
    "MAX_AUDIT_LOGS=300",
    "PHONE_CODE_TTL_SECONDS=300",
    "PHONE_CODE_RESEND_SECONDS=30",
    "PHONE_CODE_MAX_ATTEMPTS=5",
    "SMS_PROVIDER=solapi",
    "SOLAPI_API_KEY=solapi_live_key_abcdef123456",
    "SOLAPI_API_SECRET=solapi_live_secret_abcdef123456",
    "SOLAPI_SENDER_NUMBER=01012345678",
    `OPENAI_API_KEY=sk-live-${long}`,
    "OPENAI_JUDGE_MODEL=gpt-4o-mini",
    "AI_JUDGE_FORCE_LOCAL=false",
    "SUPABASE_URL=https://nosubestprod.supabase.co",
    `SUPABASE_SERVICE_ROLE_KEY=service-role-${long}`,
    `SUPABASE_ANON_KEY=anon-${long}`,
    "VITE_SUPABASE_URL=https://nosubestprod.supabase.co",
    `VITE_SUPABASE_ANON_KEY=anon-${long}`,
    "SUPABASE_TABLE_PREFIX=nb_",
    "SUPABASE_PROFILE_PHOTO_BUCKET=profile-photos",
    "SUPABASE_STORAGE_MODE=normalized",
    `DATA_DIR=${path.join(tempDir, "data").replaceAll("\\", "\\\\")}`,
    "",
  ].join("\n");
}

async function readJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function readText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function writeJson(url, body = {}, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
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

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 2500).unref();
  });
}

function spawnReleaseServer(envPath, logs) {
  const child = spawn(process.execPath, [START_SCRIPT, envPath], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => logs.stdout.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.stderr.push(String(chunk)));
  return child;
}

function renderMarkdown(report) {
  const providerRows = Object.entries(report.providerDiagnostics ?? {}).map(
    ([key, value]) => `| ${key} | ${value.status} | ${Object.entries(value)
      .filter(([itemKey]) => itemKey !== "status")
      .map(([itemKey, itemValue]) => `${itemKey}=${itemValue}`)
      .join(", ")} |`,
  );
  return [
    "# Nosu Best Release Preflight Report",
    "",
    `- Status: ${report.status.toUpperCase()}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Elapsed: ${report.elapsed}`,
    `- Origin: ${report.origin}`,
    `- URL: ${report.baseUrl}`,
    `- JSON artifact: ${report.artifacts.json}`,
    `- Markdown artifact: ${report.artifacts.markdown}`,
    "",
    "## Checks",
    "",
    `- Env guard: ${report.checks.envGuard}`,
    `- Health: ${report.checks.health}`,
    `- Static app: ${report.checks.staticApp}`,
    `- Demo auth disabled: ${report.checks.demoAuthDisabled}`,
    `- CORS blocked origin: ${report.checks.blockedOrigin}`,
    `- Provider diagnostics: ${report.checks.providerDiagnostics}`,
    "",
    "## Runtime Snapshot",
    "",
    `- Release: ${report.runtime.release?.version ?? "unknown"} (${report.runtime.release?.commitShort ?? "unknown"})`,
    `- Release channel: ${report.runtime.release?.channel ?? "unknown"}`,
    `- Build time: ${report.runtime.release?.buildTime ?? "unknown"}`,
    `- API host: ${report.runtime.apiHost}`,
    `- Static app: ${report.runtime.staticAppEnabled ? "enabled" : "disabled"} (${report.runtime.staticAppAvailable ? "built" : "missing"})`,
    `- Demo auth: ${report.runtime.demoAuthEnabled ? "enabled" : "disabled"}`,
    `- Open state write: ${report.runtime.openStateWriteEnabled ? "enabled" : "disabled"}`,
    `- Phone debug code: ${report.runtime.phoneDebugCodeExposed ? "exposed" : "hidden"}`,
    `- Allowed origins: ${report.runtime.allowedOrigins}`,
    "",
    "## Provider Diagnostics",
    "",
    "| Provider | Status | Details |",
    "| --- | --- | --- |",
    ...(providerRows.length ? providerRows : ["| none | unknown | no provider diagnostics captured |"]),
    "",
    "## Next Action",
    "",
    "- Store this report with release env diagnostics and full release smoke output before promoting the deployment.",
    "",
  ].join("\n");
}

async function writeReports(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await mkdir(path.dirname(MARKDOWN_REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_REPORT_PATH, renderMarkdown(report), "utf8");
}

async function main() {
  assert(existsSync(DIST_INDEX), "dist/index.html is missing. Run `npm run build` before release preflight.");

  const startedAt = Date.now();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nosu-release-preflight-"));
  const envPath = path.join(tempDir, ".env.production");
  const logs = { stdout: [], stderr: [] };
  let server = null;
  let report = null;

  try {
    await writeFile(envPath, buildReleaseEnv(tempDir), "utf8");
    server = spawnReleaseServer(envPath, logs);
    server.on("exit", (code) => {
      if (code !== null && code !== 0) logs.stderr.push(`Release server exited with code ${code}\n`);
    });

    const deadline = Date.now() + TIMEOUT_MS;
    const health = await waitForHealth(`${BASE_URL}/api/health`, deadline);
    const startupStdout = logs.stdout.join("");
    assert(startupStdout.includes("Release env check passed"), "start:release should run the release env guard before serving");
    assert(startupStdout.includes("Starting Nosu Best release server"), "start:release should expose the startup summary");
    assert(health.runtime?.production === true, "release preflight should run production runtime");
    assert(health.runtime?.staticAppEnabled === true, "release preflight should enable static serving");
    assert(health.runtime?.staticAppAvailable === true, "release preflight should serve an existing dist build");
    assert(health.runtime?.release?.configured === true, "release preflight should expose configured release identity");
    assert(health.runtime.release.version === "0.1.0", "release preflight should expose release version");
    assert(health.runtime.release.commitShort === "0123456789ab", "release preflight should expose release commit");
    assert(health.runtime.release.channel === "production", "release preflight should expose production release channel");
    assert(health.runtime?.demoAuthEnabled === false, "release preflight should disable demo auth");
    assert(health.runtime?.openStateWriteEnabled === false, "release preflight should disable unauthenticated state writes");
    assert(health.runtime?.phoneDebugCodeExposed === false, "release preflight should hide phone debug codes");
    assert(health.runtime?.allowedOrigins?.includes(PUBLIC_ORIGIN), "release preflight should use the configured public origin");
    assert(health.storage === "supabase", "release preflight should run with Supabase storage configured");
    assert(health.storageMode === "normalized", "release preflight should target normalized Supabase storage");
    assert(health.smsProvider === "solapi" && health.smsConfigured === true, "release preflight should configure SOLAPI SMS");
    const providerDiagnostics = assertReleaseProviderDiagnostics(health);

    const home = await readText(`${BASE_URL}/`);
    assert(home.response.ok, "release preflight root should return the built app");
    assert(home.text.includes('id="root"') && home.text.includes("/assets/"), "release preflight should serve Vite assets");
    const blocked = await readJson(`${BASE_URL}/api/health`, { origin: BLOCKED_ORIGIN });
    assert(blocked.response.headers.get("access-control-allow-origin") !== BLOCKED_ORIGIN, "blocked origin should not be allowed");
    const demoAuth = await writeJson(`${BASE_URL}/api/auth/select-demo`, { userId: "u_admin" });
    assert(demoAuth.response.status === 403, "release preflight should reject demo auth switching");
    assert(demoAuth.payload.error === "demo_auth_disabled", "demo auth guard should return demo_auth_disabled");

    const finishedAt = Date.now();
    report = {
      ok: true,
      status: "passed",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      elapsedMs: finishedAt - startedAt,
      elapsed: formatElapsed(finishedAt - startedAt),
      baseUrl: BASE_URL,
      origin: PUBLIC_ORIGIN,
      artifacts: {
        json: relativePath(REPORT_PATH),
        markdown: relativePath(MARKDOWN_REPORT_PATH),
      },
      checks: {
        envGuard: "passed",
        health: "passed",
        staticApp: "passed",
        demoAuthDisabled: "passed",
        blockedOrigin: "passed",
        providerDiagnostics: "passed",
      },
      runtime: {
        production: health.runtime.production,
        apiHost: health.runtime.apiHost,
        staticAppEnabled: health.runtime.staticAppEnabled,
        staticAppAvailable: health.runtime.staticAppAvailable,
        release: health.runtime.release,
        demoAuthEnabled: health.runtime.demoAuthEnabled,
        openStateWriteEnabled: health.runtime.openStateWriteEnabled,
        phoneDebugCodeExposed: health.runtime.phoneDebugCodeExposed,
        allowedOrigins: health.runtime.allowedOrigins.length,
      },
      service: {
        storage: health.storage,
        storageMode: health.storageMode,
        smsProvider: health.smsProvider,
        smsConfigured: health.smsConfigured,
        aiJudgeConfigured: health.aiJudgeConfigured,
      },
      providerDiagnostics,
    };
    await writeReports(report);
    console.log("Release preflight smoke passed", {
      app: BASE_URL,
      origin: PUBLIC_ORIGIN,
      storage: health.storage,
      storageMode: health.storageMode,
      smsProvider: health.smsProvider,
      report: relativePath(REPORT_PATH),
      markdown: relativePath(MARKDOWN_REPORT_PATH),
    });
  } catch (error) {
    const finishedAt = Date.now();
    report = {
      ok: false,
      status: "failed",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      elapsedMs: finishedAt - startedAt,
      elapsed: formatElapsed(finishedAt - startedAt),
      baseUrl: BASE_URL,
      origin: PUBLIC_ORIGIN,
      error: error.message,
      logs: {
        stdoutTail: logs.stdout.join("").slice(-2000),
        stderrTail: logs.stderr.join("").slice(-2000),
      },
      artifacts: {
        json: relativePath(REPORT_PATH),
        markdown: relativePath(MARKDOWN_REPORT_PATH),
      },
      checks: {
        envGuard: logs.stdout.join("").includes("Release env check passed") ? "passed" : "unknown",
        health: "failed",
        staticApp: "unknown",
        demoAuthDisabled: "unknown",
        blockedOrigin: "unknown",
        providerDiagnostics: "unknown",
      },
    };
    await writeReports(report).catch(() => {});
    console.error("Release preflight smoke failed:", error.message);
    if (logs.stderr.length) console.error(logs.stderr.join("").slice(-2000));
    process.exitCode = 1;
  } finally {
    await stopProcess(server);
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("Release preflight smoke failed:", error.message);
  process.exitCode = 1;
});
