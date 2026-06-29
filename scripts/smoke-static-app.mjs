import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_INDEX = path.join(ROOT_DIR, "dist", "index.html");
const API_PORT = Number(process.env.SMOKE_STATIC_PORT ?? 0) || 4100 + Math.floor(Math.random() * 1000);
const API_HOST = process.env.SMOKE_STATIC_HOST ?? "127.0.0.1";
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const TIMEOUT_MS = Number(process.env.SMOKE_STATIC_TIMEOUT_MS ?? 30_000);
const PUBLIC_ORIGIN = process.env.SMOKE_STATIC_PUBLIC_ORIGIN ?? "https://nosu-best.example.com";
const BLOCKED_ORIGIN = process.env.SMOKE_STATIC_BLOCKED_ORIGIN ?? "https://blocked.example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { response, text };
}

async function readJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
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

async function readCorsHeaders(url, origin) {
  const { response } = await readJson(url, { origin });
  return {
    status: response.status,
    allowOrigin: response.headers.get("access-control-allow-origin"),
    allowCredentials: response.headers.get("access-control-allow-credentials"),
    contentTypeOptions: response.headers.get("x-content-type-options"),
    frameOptions: response.headers.get("x-frame-options"),
    referrerPolicy: response.headers.get("referrer-policy"),
    permissionsPolicy: response.headers.get("permissions-policy"),
    poweredBy: response.headers.get("x-powered-by"),
  };
}

async function readCorsPreflightHeaders(url, origin, requestMethod = "POST") {
  const response = await fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": requestMethod,
      "access-control-request-headers": "content-type,x-csrf-token",
    },
  });
  return {
    status: response.status,
    allowOrigin: response.headers.get("access-control-allow-origin"),
    allowCredentials: response.headers.get("access-control-allow-credentials"),
    allowMethods: response.headers.get("access-control-allow-methods"),
    allowHeaders: response.headers.get("access-control-allow-headers"),
  };
}

async function createProductionAdminSession() {
  const { response, payload } = await writeJson(`${BASE_URL}/api/auth/login`, {
    loginId: "nosu",
    password: "demo",
  });
  assert(response.ok, "production admin login should succeed with the seeded local admin");
  assert(payload.ok === true && payload.userId === "u_admin", "production admin login should return u_admin");
  assert(typeof payload.csrfToken === "string" && payload.csrfToken.length > 0, "production admin login should return csrfToken");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.includes("nb_session="), "production admin login should set an auth session cookie");
  return cookie.split(";")[0];
}

function assertReadinessReady(readiness, id) {
  const item = readiness.checks?.find((check) => check.id === id);
  assert(item, `readiness should include ${id}`);
  assert(item.status === "ready", `readiness check ${id} should be ready in production static smoke`);
  assert(item.required === true, `readiness check ${id} should remain a required launch gate`);
  return item;
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

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || server.killed) {
      resolve();
      return;
    }
    server.once("exit", () => resolve());
    server.kill();
    setTimeout(resolve, 2500).unref();
  });
}

async function main() {
  assert(existsSync(DIST_INDEX), "dist/index.html is missing. Run `npm run build` before `npm run smoke:static`.");

  const logs = [];
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      API_HOST,
      API_PORT: String(API_PORT),
      ALLOWED_ORIGINS: PUBLIC_ORIGIN,
      SERVE_STATIC_APP: "true",
      ENABLE_DEMO_AUTH: "false",
      ENABLE_OPEN_STATE_WRITE: "false",
      PHONE_CODE_HIDE_DEBUG: "true",
      AI_JUDGE_FORCE_LOCAL: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  server.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
  server.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));

  try {
    const deadline = Date.now() + TIMEOUT_MS;
    const health = await waitForHealth(`${BASE_URL}/api/health`, deadline);
    assert(health.runtime?.staticAppEnabled === true, "health.runtime.staticAppEnabled should be true");
    assert(health.runtime?.staticAppAvailable === true, "health.runtime.staticAppAvailable should be true");
    assert(health.runtime?.production === true, "static smoke should run with production runtime");
    assert(health.runtime?.demoAuthEnabled === false, "production static smoke should disable demo auth");
    assert(health.runtime?.openStateWriteEnabled === false, "production static smoke should disable unauthenticated state writes");
    assert(health.runtime?.phoneDebugCodeExposed === false, "production static smoke should hide phone debug codes");
    assert(health.runtime?.allowedOrigins?.includes(PUBLIC_ORIGIN), "production runtime should include the public allowed origin");
    assert(
      !health.runtime?.allowedOrigins?.some((origin) => /localhost|127\.0\.0\.1/i.test(origin)),
      "production runtime should not allow localhost origins",
    );

    const corsHeaders = await readCorsHeaders(`${BASE_URL}/api/health`, PUBLIC_ORIGIN);
    assert(corsHeaders.status === 200, "allowed public origin health request should succeed");
    assert(corsHeaders.allowOrigin === PUBLIC_ORIGIN, `CORS should echo allowed public origin ${PUBLIC_ORIGIN}`);
    assert(corsHeaders.allowCredentials === "true", "CORS should allow credentials for session cookies");
    assert(corsHeaders.contentTypeOptions === "nosniff", "X-Content-Type-Options must be nosniff");
    assert(corsHeaders.frameOptions === "DENY", "X-Frame-Options must be DENY");
    assert(corsHeaders.referrerPolicy === "no-referrer", "Referrer-Policy must be no-referrer");
    assert(corsHeaders.permissionsPolicy?.includes("microphone=(self)"), "Permissions-Policy should allow microphone");
    assert(corsHeaders.poweredBy === null, "X-Powered-By should not expose Express");
    const blockedCorsHeaders = await readCorsHeaders(`${BASE_URL}/api/health`, BLOCKED_ORIGIN);
    assert(
      blockedCorsHeaders.allowOrigin !== BLOCKED_ORIGIN,
      `CORS should not allow unlisted origin ${BLOCKED_ORIGIN}`,
    );
    const preflightHeaders = await readCorsPreflightHeaders(`${BASE_URL}/api/admin/sync-normalized`, PUBLIC_ORIGIN);
    assert([200, 204].includes(preflightHeaders.status), "allowed public origin preflight should succeed");
    assert(preflightHeaders.allowOrigin === PUBLIC_ORIGIN, "allowed public origin preflight should echo the origin");
    assert(preflightHeaders.allowCredentials === "true", "allowed public origin preflight should allow credentials");
    assert(preflightHeaders.allowMethods?.includes("POST"), "allowed public origin preflight should allow POST");
    assert(
      preflightHeaders.allowHeaders?.toLowerCase().includes("content-type"),
      "allowed public origin preflight should allow content-type",
    );

    const home = await readText(`${BASE_URL}/`);
    assert(home.response.ok, "root route should return built app HTML");
    assert(home.text.includes('id="root"'), "root route should include React root");
    assert(home.text.includes("/assets/"), "root route should reference built Vite assets");
    const permissionsPolicy = home.response.headers.get("permissions-policy") ?? "";
    assert(
      permissionsPolicy.includes("microphone=(self)"),
      "static app document should allow same-origin microphone for voice debates",
    );
    assert(
      permissionsPolicy.includes("camera=()") && permissionsPolicy.includes("geolocation=()"),
      "static app document should still disable camera and geolocation",
    );

    const deepLink = await readText(`${BASE_URL}/arena/rooms/r_ai_labor?from=static-smoke`);
    assert(deepLink.response.ok, "deep link route should return built app HTML");
    assert(deepLink.text.includes('id="root"'), "deep link route should fall back to React app");

    const assetPath = home.text.match(/(?:src|href)="([^"]*\/assets\/[^"]+)"/)?.[1];
    assert(assetPath, "built app HTML should include at least one asset path");
    const asset = await fetch(new URL(assetPath, BASE_URL));
    assert(asset.ok, `built asset ${assetPath} should be served`);

    const missingApi = await readJson(`${BASE_URL}/api/static-smoke-missing`);
    assert(missingApi.response.status === 404, "unknown API route should return JSON 404");
    assert(missingApi.payload.error === "not_found", "unknown API route should not fall back to app HTML");

    const demoAuth = await writeJson(`${BASE_URL}/api/auth/select-demo`, { userId: "u_admin" });
    assert(demoAuth.response.status === 403, "production static smoke should reject demo auth switching");
    assert(demoAuth.payload.error === "demo_auth_disabled", "disabled demo auth should return demo_auth_disabled");

    const adminCookie = await createProductionAdminSession();
    const { response: readinessResponse, payload: readiness } = await readJson(`${BASE_URL}/api/admin/readiness`, {
      cookie: adminCookie,
    });
    assert(readinessResponse.ok, "authenticated production admin should access readiness");
    assert(readiness?.ok === true, "production readiness should return ok=true");
    assert(Array.isArray(readiness.checks), "production readiness should include checks");
    assert(readiness.launch && typeof readiness.launch === "object", "production readiness should include launch summary");
    for (const id of ["security", "static_app", "origins", "voice_permissions"]) {
      assertReadinessReady(readiness, id);
    }
    const requiredOpenIds = new Set((readiness.launch.requiredOpen ?? []).map((item) => item.id));
    for (const id of ["security", "static_app", "origins", "voice_permissions"]) {
      assert(!requiredOpenIds.has(id), `launch.requiredOpen should not include satisfied deploy gate ${id}`);
    }
    const phaseSummary = readiness.launch.phaseSummary ?? [];
    const deployPhase = phaseSummary.find((phase) => phase.phase === "deploy");
    assert(deployPhase, "deploy phase summary should be present");
    assert(phaseSummary.some((phase) => phase.phase === "safety" && phase.requiredOpen === 0), "safety phase should have no required open items");

    console.log("Static app smoke passed", {
      app: BASE_URL,
      api: `${BASE_URL}/api/health`,
      publicOrigin: PUBLIC_ORIGIN,
      deepLink: "/arena/rooms/r_ai_labor?from=static-smoke",
      asset: assetPath,
      permissionsPolicy,
      readinessLaunch: readiness.launch.status,
      readinessRequiredOpen: readiness.launch.requiredOpen.length,
      deployRequiredOpen: deployPhase.requiredOpen,
      safetyRequiredOpen: phaseSummary.find((phase) => phase.phase === "safety")?.requiredOpen ?? null,
      staticAppEnabled: health.runtime.staticAppEnabled,
      staticAppAvailable: health.runtime.staticAppAvailable,
    });
  } catch (error) {
    console.error("Static app smoke failed:", error.message);
    if (logs.length) console.error(logs.join("\n"));
    process.exitCode = 1;
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error("Static app smoke failed:", error.message);
  process.exitCode = 1;
});
