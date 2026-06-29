import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHECK_SCRIPT = path.join(process.cwd(), "scripts", "check-release-env.mjs");
const INIT_SCRIPT = path.join(process.cwd(), "scripts", "init-release-env.mjs");

const draftRequiredKeys = [
  "NODE_ENV",
  "API_HOST",
  "ALLOWED_ORIGINS",
  "SERVE_STATIC_APP",
  "RELEASE_VERSION",
  "RELEASE_COMMIT",
  "RELEASE_CHANNEL",
  "RELEASE_BUILD_TIME",
  "SESSION_SECRET",
  "SHUTDOWN_GRACE_MS",
  "DEBATE_CLOCK_TICK_MS",
  "ENABLE_DEMO_AUTH",
  "ENABLE_OPEN_STATE_WRITE",
  "PHONE_CODE_HIDE_DEBUG",
  "RATE_LIMIT_AUTH_WINDOW_SECONDS",
  "RATE_LIMIT_LOGIN_MAX",
  "RATE_LIMIT_SIGNUP_MAX",
  "RATE_LIMIT_SOCIAL_MAX",
  "RATE_LIMIT_DEMO_MAX",
  "RATE_LIMIT_PHONE_REQUEST_MAX",
  "RATE_LIMIT_PHONE_VERIFY_MAX",
  "RATE_LIMIT_PASSWORD_MAX",
  "RATE_LIMIT_WRITE_WINDOW_SECONDS",
  "RATE_LIMIT_MESSAGE_MAX",
  "RATE_LIMIT_REPORT_MAX",
  "MAX_AUDIT_LOGS",
  "PHONE_CODE_TTL_SECONDS",
  "PHONE_CODE_RESEND_SECONDS",
  "PHONE_CODE_MAX_ATTEMPTS",
  "SMS_PROVIDER",
  "SOLAPI_API_KEY",
  "SOLAPI_API_SECRET",
  "SOLAPI_SENDER_NUMBER",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_STORAGE_MODE",
];

function runCheck(envPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK_SCRIPT], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_ENV_PATH: envPath,
      },
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
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runCheckJson(envPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CHECK_SCRIPT, "--json"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELEASE_ENV_PATH: envPath,
      },
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
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runInit(envPath, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INIT_SCRIPT, envPath, ...args], {
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
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

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
    "NODE_ENV=development",
    "API_HOST=127.0.0.1",
    "ALLOWED_ORIGINS=http://127.0.0.1:5173,https://your-service.example.com",
    "SERVE_STATIC_APP=false",
    "RELEASE_VERSION=replace-with-version",
    "RELEASE_COMMIT=not-a-sha",
    "RELEASE_CHANNEL=development",
    "RELEASE_BUILD_TIME=not-a-date",
    "SESSION_SECRET=short",
    "SHUTDOWN_GRACE_MS=0",
    "DEBATE_CLOCK_TICK_MS=100",
    "ENABLE_DEMO_AUTH=true",
    "ENABLE_OPEN_STATE_WRITE=true",
    "PHONE_CODE_HIDE_DEBUG=false",
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
    "SMS_PROVIDER=dev",
    "OPENAI_API_KEY=your-openai-api-key",
    "SUPABASE_URL=https://your-project-ref.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=your-service-role-or-secret-key",
    "VITE_SUPABASE_URL=https://your-project-ref.supabase.co",
    "VITE_SUPABASE_ANON_KEY=your-supabase-anon-key",
    "SUPABASE_STORAGE_MODE=snapshot",
    "",
  ].join("\n");
}

function parseJsonReport(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} should emit valid JSON: ${error.message}; stdout=${result.stdout}; stderr=${result.stderr}`);
  }
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nosu-release-env-"));
  const draftPath = path.join(tempDir, ".env.production.draft");
  const validPath = path.join(tempDir, ".env.production.valid");
  const invalidPath = path.join(tempDir, ".env.production.invalid");
  try {
    const init = await runInit(draftPath);
    if (init.code !== 0) {
      throw new Error(`release env draft generation should pass: ${init.stderr || init.stdout}`);
    }
    const draft = await readFile(draftPath, "utf8");
    for (const key of draftRequiredKeys) {
      if (!draft.includes(`${key}=`)) {
        throw new Error(`release env draft should include ${key}`);
      }
    }
    const initAgain = await runInit(draftPath);
    if (initAgain.code !== 0 || !initAgain.stdout.includes("already exists")) {
      throw new Error(`release env draft should not be overwritten by default: ${initAgain.stderr || initAgain.stdout}`);
    }
    const draftCheck = await runCheck(draftPath);
    if (draftCheck.code === 0 || !draftCheck.stderr.includes("placeholder")) {
      throw new Error(`draft release env should fail until placeholders are replaced: ${draftCheck.stdout || draftCheck.stderr}`);
    }
    const draftJson = await runCheckJson(draftPath);
    const draftJsonReport = parseJsonReport(draftJson, "draft release env JSON check");
    if (draftJson.code === 0 || draftJsonReport.ok !== false || draftJsonReport.status !== "blocked") {
      throw new Error(`draft release env JSON should fail with blocked status: ${draftJson.stdout || draftJson.stderr}`);
    }
    if (!draftJsonReport.placeholderKeys?.includes("ALLOWED_ORIGINS") || !draftJsonReport.errors?.some((item) => item.includes("placeholder"))) {
      throw new Error(`draft release env JSON should expose placeholder keys and errors: ${draftJson.stdout}`);
    }

    await writeFile(validPath, validReleaseEnv(), "utf8");
    await writeFile(invalidPath, invalidReleaseEnv(), "utf8");

    const valid = await runCheck(validPath);
    if (valid.code !== 0) {
      throw new Error(`valid release env should pass: ${valid.stderr || valid.stdout}`);
    }
    const validJson = await runCheckJson(validPath);
    const validJsonReport = parseJsonReport(validJson, "valid release env JSON check");
    if (validJson.code !== 0 || validJsonReport.ok !== true || validJsonReport.status !== "ready") {
      throw new Error(`valid release env JSON should pass with ready status: ${validJson.stdout || validJson.stderr}`);
    }
    if (
      validJsonReport.counts?.errors !== 0 ||
      validJsonReport.summary?.origins !== 2 ||
      validJsonReport.summary?.storageMode !== "normalized" ||
      validJsonReport.summary?.smsProvider !== "solapi" ||
      validJsonReport.summary?.release?.version !== "0.1.0" ||
      validJsonReport.summary?.release?.commitShort !== "0123456789ab" ||
      validJsonReport.summary?.release?.channel !== "production" ||
      validJsonReport.summary?.aiJudgeConfigured !== true ||
      validJsonReport.summary?.shutdownGraceMs !== 8000 ||
      validJsonReport.summary?.rateLimits?.loginMax !== 8 ||
      validJsonReport.summary?.phoneCode?.ttlSeconds !== 300
    ) {
      throw new Error(`valid release env JSON should expose safe readiness summary: ${validJson.stdout}`);
    }

    const invalid = await runCheck(invalidPath);
    if (invalid.code === 0) {
      throw new Error(`invalid release env should fail: ${invalid.stdout}`);
    }
    if (!invalid.stderr.includes("ALLOWED_ORIGINS") || !invalid.stderr.includes("ENABLE_DEMO_AUTH")) {
      throw new Error(`invalid release env did not expose expected failures: ${invalid.stderr}`);
    }
    const invalidJson = await runCheckJson(invalidPath);
    const invalidJsonReport = parseJsonReport(invalidJson, "invalid release env JSON check");
    if (invalidJson.code === 0 || invalidJsonReport.ok !== false || invalidJsonReport.counts?.errors < 1) {
      throw new Error(`invalid release env JSON should fail with errors: ${invalidJson.stdout || invalidJson.stderr}`);
    }
    if (!invalidJsonReport.wrongValues?.some((item) => item.key === "ENABLE_DEMO_AUTH")) {
      throw new Error(`invalid release env JSON should expose wrong production switch values: ${invalidJson.stdout}`);
    }
    if (
      !invalidJsonReport.errors?.some((item) => item.includes("SHUTDOWN_GRACE_MS")) ||
      !invalidJsonReport.errors?.some((item) => item.includes("RELEASE_COMMIT")) ||
      !invalidJsonReport.errors?.some((item) => item.includes("RELEASE_BUILD_TIME")) ||
      !invalidJsonReport.errors?.some((item) => item.includes("SESSION_SECRET")) ||
      !invalidJsonReport.errors?.some((item) => item.includes("PHONE_CODE_RESEND_SECONDS"))
    ) {
      throw new Error(`invalid release env JSON should expose lifecycle, session, and phone code guard errors: ${invalidJson.stdout}`);
    }

    console.log("Release env smoke passed", {
      draft: "generated and guarded",
      valid: "passed",
      invalid: "failed as expected",
      json: "safe diagnostics verified",
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("Release env smoke failed:", error.message);
  process.exitCode = 1;
});
