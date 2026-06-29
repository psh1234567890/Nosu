import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENV_PATH = path.join(process.cwd(), "deploy", ".env.production");
const CHECK_SCRIPT = path.join(process.cwd(), "scripts", "check-release-env.mjs");
const SERVER_ENTRY = path.join(process.cwd(), "server", "index.js");
const args = process.argv.slice(2);
const envArg = args.find((arg) => !arg.startsWith("--"));
const envPath = path.resolve(process.env.RELEASE_ENV_PATH ?? envArg ?? DEFAULT_ENV_PATH);
const shouldDryRun = args.includes("--dry-run") || process.env.RELEASE_ENV_DRY_RUN === "true";

function displayPath(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : filePath;
}

function parseOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function runReleaseEnvCheck() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK_SCRIPT], {
      cwd: process.cwd(),
      env: { ...process.env, RELEASE_ENV_PATH: envPath },
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", (error) => {
      console.error("Release env check could not start:", error.message);
      resolve(1);
    });
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

function buildSafeSummary(env) {
  const origins = parseOrigins(env.ALLOWED_ORIGINS);
  return {
    env: displayPath(envPath),
    command: "node server/index.js",
    nodeEnv: env.NODE_ENV,
    apiHost: env.API_HOST,
    apiPort: env.API_PORT ?? "4000",
    release: {
      version: env.RELEASE_VERSION,
      commit: env.RELEASE_COMMIT ? String(env.RELEASE_COMMIT).slice(0, 12) : undefined,
      channel: env.RELEASE_CHANNEL,
      buildTime: env.RELEASE_BUILD_TIME,
    },
    shutdownGraceMs: env.SHUTDOWN_GRACE_MS ?? "8000",
    staticApp: env.SERVE_STATIC_APP,
    demoAuth: env.ENABLE_DEMO_AUTH,
    openStateWrite: env.ENABLE_OPEN_STATE_WRITE,
    storageMode: env.SUPABASE_STORAGE_MODE,
    smsProvider: env.SMS_PROVIDER,
    origins: origins.length,
  };
}

if (!existsSync(envPath)) {
  console.error(`Release start failed: ${displayPath(envPath)} does not exist.`);
  console.error("Run npm run init:release-env first, or set RELEASE_ENV_PATH to the release env file.");
  process.exit(1);
}

const checkCode = await runReleaseEnvCheck();
if (checkCode !== 0) {
  console.error("Release start aborted because the release env check failed.");
  process.exit(checkCode);
}

const rawEnv = await readFile(envPath, "utf8");
const releaseEnv = {
  ...process.env,
  ...dotenv.parse(rawEnv),
  RELEASE_ENV_PATH: envPath,
};
const summary = buildSafeSummary(releaseEnv);

if (shouldDryRun) {
  console.log("Release start dry run passed", summary);
  process.exit(0);
}

console.log("Starting Nosu Best release server", summary);

const child = spawn(process.execPath, [SERVER_ENTRY], {
  cwd: process.cwd(),
  env: releaseEnv,
  stdio: "inherit",
  windowsHide: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error("Release server failed to start:", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
