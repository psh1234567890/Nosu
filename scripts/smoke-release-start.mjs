import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const START_SCRIPT = path.join(process.cwd(), "scripts", "start-release.mjs");

function validReleaseEnv() {
  const long = "abcdefghijklmnopqrstuvwxyz1234567890";
  return [
    "NODE_ENV=production",
    "API_PORT=4000",
    "API_HOST=0.0.0.0",
    "ALLOWED_ORIGINS=https://nosu-best.kr,https://www.nosu-best.kr",
    "SERVE_STATIC_APP=true",
    "RELEASE_VERSION=0.1.0",
    "RELEASE_COMMIT=0123456789abcdef0123456789abcdef01234567",
    "RELEASE_CHANNEL=production",
    "RELEASE_BUILD_TIME=2026-06-22T00:00:00.000Z",
    `SESSION_SECRET=session-secret-${long}`,
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
    "SUPABASE_URL=https://nosubestprod.supabase.co",
    `SUPABASE_SERVICE_ROLE_KEY=service-role-${long}`,
    `SUPABASE_ANON_KEY=anon-${long}`,
    "VITE_SUPABASE_URL=https://nosubestprod.supabase.co",
    `VITE_SUPABASE_ANON_KEY=anon-${long}`,
    "SUPABASE_TABLE_PREFIX=nb_",
    "SUPABASE_STORAGE_MODE=normalized",
    "",
  ].join("\n");
}

function invalidReleaseEnv() {
  return [
    "NODE_ENV=production",
    "API_HOST=0.0.0.0",
    "ALLOWED_ORIGINS=http://127.0.0.1:5173",
    "SERVE_STATIC_APP=true",
    "RELEASE_VERSION=replace-with-version",
    "RELEASE_COMMIT=not-a-sha",
    "RELEASE_CHANNEL=development",
    "RELEASE_BUILD_TIME=not-a-date",
    "SESSION_SECRET=short",
    "SHUTDOWN_GRACE_MS=0",
    "DEBATE_CLOCK_TICK_MS=100",
    "ENABLE_DEMO_AUTH=false",
    "ENABLE_OPEN_STATE_WRITE=false",
    "PHONE_CODE_HIDE_DEBUG=true",
    "RATE_LIMIT_AUTH_WINDOW_SECONDS=0",
    "RATE_LIMIT_LOGIN_MAX=0",
    "RATE_LIMIT_SIGNUP_MAX=0",
    "RATE_LIMIT_SOCIAL_MAX=0",
    "RATE_LIMIT_DEMO_MAX=0",
    "RATE_LIMIT_PHONE_REQUEST_MAX=0",
    "RATE_LIMIT_PHONE_VERIFY_MAX=0",
    "RATE_LIMIT_PASSWORD_MAX=0",
    "RATE_LIMIT_WRITE_WINDOW_SECONDS=0",
    "RATE_LIMIT_MESSAGE_MAX=0",
    "RATE_LIMIT_REPORT_MAX=0",
    "MAX_AUDIT_LOGS=10",
    "PHONE_CODE_TTL_SECONDS=30",
    "PHONE_CODE_RESEND_SECONDS=30",
    "PHONE_CODE_MAX_ATTEMPTS=0",
    "SMS_PROVIDER=solapi",
    "SOLAPI_API_KEY=replace-with-solapi-api-key",
    "SOLAPI_API_SECRET=replace-with-solapi-api-secret",
    "SOLAPI_SENDER_NUMBER=01012345678",
    "OPENAI_API_KEY=replace-with-openai-api-key",
    "SUPABASE_URL=https://your-project-ref.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
    "SUPABASE_ANON_KEY=replace-with-anon-key",
    "VITE_SUPABASE_URL=https://your-project-ref.supabase.co",
    "VITE_SUPABASE_ANON_KEY=replace-with-anon-key",
    "SUPABASE_STORAGE_MODE=normalized",
    "",
  ].join("\n");
}

function runStart(envPath, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [START_SCRIPT, envPath, ...args], {
      cwd: process.cwd(),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nosu-release-start-"));
  const validPath = path.join(tempDir, ".env.production.valid");
  const invalidPath = path.join(tempDir, ".env.production.invalid");

  try {
    await writeFile(validPath, validReleaseEnv(), "utf8");
    await writeFile(invalidPath, invalidReleaseEnv(), "utf8");

    const valid = await runStart(validPath, ["--dry-run"]);
    if (valid.code !== 0) {
      throw new Error(`release start dry run should pass: ${valid.stderr || valid.stdout}`);
    }
    if (!valid.stdout.includes("Release env check passed") || !valid.stdout.includes("Release start dry run passed")) {
      throw new Error(`release start dry run did not run the full guard: ${valid.stdout}`);
    }
    if (!valid.stdout.includes("node server/index.js") || !valid.stdout.includes("origins: 2")) {
      throw new Error(`release start dry run did not expose safe startup summary: ${valid.stdout}`);
    }

    const invalid = await runStart(invalidPath, ["--dry-run"]);
    if (invalid.code === 0) {
      throw new Error(`invalid release start should fail before server startup: ${invalid.stdout}`);
    }
    if (!invalid.stderr.includes("Release env check failed") || !invalid.stderr.includes("Release start aborted")) {
      throw new Error(`invalid release start did not expose the expected guard failure: ${invalid.stderr || invalid.stdout}`);
    }

    console.log("Release start smoke passed", {
      dryRun: "valid env passed",
      guard: "invalid env blocked before server start",
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("Release start smoke failed:", error.message);
  process.exitCode = 1;
});
