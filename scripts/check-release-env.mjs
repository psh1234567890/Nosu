import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ENV_PATH = path.join(process.cwd(), "deploy", ".env.production");
const args = process.argv.slice(2);
const shouldJson = args.includes("--json") || process.env.RELEASE_ENV_JSON === "true";
const envArg = args.find((arg) => !arg.startsWith("--"));
const envPath = path.resolve(process.env.RELEASE_ENV_PATH ?? envArg ?? DEFAULT_ENV_PATH);

const requiredKeys = [
  "NODE_ENV",
  "API_PORT",
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

const exactValues = {
  NODE_ENV: "production",
  API_HOST: "0.0.0.0",
  SERVE_STATIC_APP: "true",
  RELEASE_CHANNEL: "production",
  ENABLE_DEMO_AUTH: "false",
  ENABLE_OPEN_STATE_WRITE: "false",
  PHONE_CODE_HIDE_DEBUG: "true",
  SMS_PROVIDER: "solapi",
  SUPABASE_STORAGE_MODE: "normalized",
};

const integerRules = {
  API_PORT: { min: 1, max: 65535 },
  SHUTDOWN_GRACE_MS: { min: 1000, max: 120000 },
  DEBATE_CLOCK_TICK_MS: { min: 250, max: 60000 },
  RATE_LIMIT_AUTH_WINDOW_SECONDS: { min: 1, max: 86400 },
  RATE_LIMIT_LOGIN_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_SIGNUP_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_SOCIAL_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_DEMO_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_PHONE_REQUEST_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_PHONE_VERIFY_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_PASSWORD_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_WRITE_WINDOW_SECONDS: { min: 1, max: 86400 },
  RATE_LIMIT_MESSAGE_MAX: { min: 1, max: 100000 },
  RATE_LIMIT_REPORT_MAX: { min: 1, max: 100000 },
  MAX_AUDIT_LOGS: { min: 50, max: 100000 },
  PHONE_CODE_TTL_SECONDS: { min: 60, max: 1800 },
  PHONE_CODE_RESEND_SECONDS: { min: 1, max: 600 },
  PHONE_CODE_MAX_ATTEMPTS: { min: 1, max: 20 },
};

function isBlank(value) {
  return value === undefined || String(value).trim() === "";
}

function isPlaceholder(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "" ||
    normalized.includes("your-") ||
    normalized.includes("replace-with") ||
    normalized.includes("example.com") ||
    normalized.includes("example.test") ||
    normalized.includes("your_project") ||
    normalized.includes("your-project") ||
    normalized.includes("placeholder")
  );
}

function parseOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseInteger(value) {
  const trimmed = String(value ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function addIntegerChecks(env, errors) {
  const parsed = {};
  for (const [key, rule] of Object.entries(integerRules)) {
    if (isBlank(env[key])) continue;
    const value = parseInteger(env[key]);
    parsed[key] = value;
    if (value === null || value < rule.min || value > rule.max) {
      errors.push(`${key} must be an integer between ${rule.min} and ${rule.max}.`);
    }
  }

  const ttl = parsed.PHONE_CODE_TTL_SECONDS;
  const resend = parsed.PHONE_CODE_RESEND_SECONDS;
  if (ttl !== null && resend !== null && Number.isFinite(ttl) && Number.isFinite(resend) && resend >= ttl) {
    errors.push("PHONE_CODE_RESEND_SECONDS must be shorter than PHONE_CODE_TTL_SECONDS.");
  }
}

function addReleaseIdentityChecks(env, errors, warnings) {
  const version = String(env.RELEASE_VERSION ?? "").trim();
  const commit = String(env.RELEASE_COMMIT ?? "").trim();
  const buildTime = String(env.RELEASE_BUILD_TIME ?? "").trim();
  if (version && !/^[0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    warnings.push("RELEASE_VERSION should be a semver-like version such as 1.0.0 or 1.0.0-rc.1.");
  }
  if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) {
    errors.push("RELEASE_COMMIT must be a git commit SHA between 7 and 40 hex characters.");
  }
  const parsedBuildTime = new Date(buildTime);
  if (buildTime && Number.isNaN(parsedBuildTime.getTime())) {
    errors.push("RELEASE_BUILD_TIME must be a valid ISO timestamp.");
  }
}

function displayPath(filePath) {
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : filePath;
}

function addOriginChecks(env, errors, warnings) {
  const origins = parseOrigins(env.ALLOWED_ORIGINS);
  if (!origins.length) {
    errors.push("ALLOWED_ORIGINS must include at least one HTTPS production origin.");
    return;
  }
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      errors.push(`ALLOWED_ORIGINS contains an invalid URL: ${origin}`);
      continue;
    }
    if (parsed.protocol !== "https:") {
      errors.push(`ALLOWED_ORIGINS must use HTTPS in production: ${origin}`);
    }
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
      errors.push(`ALLOWED_ORIGINS must not include local development hosts: ${origin}`);
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      warnings.push(`ALLOWED_ORIGINS should usually be bare origins without path/query/hash: ${origin}`);
    }
  }
}

function validateEnv(env) {
  const errors = [];
  const warnings = [];
  const missingKeys = [];
  const placeholderKeys = [];
  const wrongValues = [];

  for (const key of requiredKeys) {
    if (isBlank(env[key])) {
      missingKeys.push(key);
      errors.push(`${key} is required for release readiness.`);
    }
  }

  for (const [key, expected] of Object.entries(exactValues)) {
    if (!isBlank(env[key]) && String(env[key]).trim().toLowerCase() !== expected) {
      wrongValues.push({ key, expected, actual: String(env[key]).trim() });
      errors.push(`${key} must be ${expected} for production release checks.`);
    }
  }

  for (const key of requiredKeys) {
    if (!isBlank(env[key]) && isPlaceholder(env[key])) {
      placeholderKeys.push(key);
      errors.push(`${key} still looks like a placeholder value.`);
    }
  }

  addOriginChecks(env, errors, warnings);
  addIntegerChecks(env, errors);
  addReleaseIdentityChecks(env, errors, warnings);

  if (!String(env.SUPABASE_URL ?? "").startsWith("https://")) {
    errors.push("SUPABASE_URL must be a real https:// Supabase project URL.");
  }
  if (env.VITE_SUPABASE_URL && env.SUPABASE_URL && env.VITE_SUPABASE_URL !== env.SUPABASE_URL) {
    errors.push("VITE_SUPABASE_URL should match SUPABASE_URL for the same project.");
  }
  if (String(env.OPENAI_API_KEY ?? "").length < 20) {
    errors.push("OPENAI_API_KEY is too short to be a real release key.");
  }
  if (String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").length < 20) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is too short to be a real service role key.");
  }
  if (String(env.SUPABASE_ANON_KEY ?? "").length < 20) {
    errors.push("SUPABASE_ANON_KEY is too short to be a real anon key.");
  }
  if (String(env.VITE_SUPABASE_ANON_KEY ?? "").length < 20) {
    errors.push("VITE_SUPABASE_ANON_KEY is too short to be a real anon key.");
  }
  if (String(env.SOLAPI_SENDER_NUMBER ?? "").replace(/\D/g, "").length < 8) {
    errors.push("SOLAPI_SENDER_NUMBER must include a registered sender phone number.");
  }
  if (!isBlank(env.SESSION_SECRET) && String(env.SESSION_SECRET).length < 32) {
    errors.push("SESSION_SECRET must be at least 32 characters for stable release sessions.");
  }

  return { errors, warnings, origins: parseOrigins(env.ALLOWED_ORIGINS), missingKeys, placeholderKeys, wrongValues };
}

function isConfiguredSecret(value) {
  return !isBlank(value) && !isPlaceholder(value) && String(value).trim().length >= 20;
}

function buildSafeSummary(env, result) {
  return {
    nodeEnv: env.NODE_ENV ?? null,
    apiHost: env.API_HOST ?? null,
    apiPort: env.API_PORT ?? "4000",
    staticApp: env.SERVE_STATIC_APP ?? null,
    release: {
      version: env.RELEASE_VERSION ?? null,
      commitShort: env.RELEASE_COMMIT ? String(env.RELEASE_COMMIT).slice(0, 12) : null,
      channel: env.RELEASE_CHANNEL ?? null,
      buildTime: env.RELEASE_BUILD_TIME ?? null,
    },
    demoAuth: env.ENABLE_DEMO_AUTH ?? null,
    openStateWrite: env.ENABLE_OPEN_STATE_WRITE ?? null,
    phoneDebugHidden: env.PHONE_CODE_HIDE_DEBUG ?? null,
    smsProvider: env.SMS_PROVIDER ?? null,
    storageMode: env.SUPABASE_STORAGE_MODE ?? null,
    shutdownGraceMs: parseInteger(env.SHUTDOWN_GRACE_MS),
    origins: result.origins.length,
    rateLimits: {
      authWindowSeconds: parseInteger(env.RATE_LIMIT_AUTH_WINDOW_SECONDS),
      writeWindowSeconds: parseInteger(env.RATE_LIMIT_WRITE_WINDOW_SECONDS),
      loginMax: parseInteger(env.RATE_LIMIT_LOGIN_MAX),
      signupMax: parseInteger(env.RATE_LIMIT_SIGNUP_MAX),
      phoneRequestMax: parseInteger(env.RATE_LIMIT_PHONE_REQUEST_MAX),
      phoneVerifyMax: parseInteger(env.RATE_LIMIT_PHONE_VERIFY_MAX),
      messageMax: parseInteger(env.RATE_LIMIT_MESSAGE_MAX),
      reportMax: parseInteger(env.RATE_LIMIT_REPORT_MAX),
    },
    phoneCode: {
      ttlSeconds: parseInteger(env.PHONE_CODE_TTL_SECONDS),
      resendSeconds: parseInteger(env.PHONE_CODE_RESEND_SECONDS),
      maxAttempts: parseInteger(env.PHONE_CODE_MAX_ATTEMPTS),
    },
    maxAuditLogs: parseInteger(env.MAX_AUDIT_LOGS),
    supabaseConfigured:
      String(env.SUPABASE_URL ?? "").startsWith("https://") && isConfiguredSecret(env.SUPABASE_SERVICE_ROLE_KEY),
    oauthClientConfigured: isConfiguredSecret(env.VITE_SUPABASE_ANON_KEY),
    aiJudgeConfigured: isConfiguredSecret(env.OPENAI_API_KEY),
    smsConfigured:
      String(env.SMS_PROVIDER ?? "").trim().toLowerCase() === "solapi" &&
      !isBlank(env.SOLAPI_API_KEY) &&
      !isPlaceholder(env.SOLAPI_API_KEY) &&
      !isBlank(env.SOLAPI_API_SECRET) &&
      !isPlaceholder(env.SOLAPI_API_SECRET) &&
      String(env.SOLAPI_SENDER_NUMBER ?? "").replace(/\D/g, "").length >= 8,
    sessionSecretConfigured: !isBlank(env.SESSION_SECRET) && String(env.SESSION_SECRET).length >= 32,
  };
}

function buildReport(env, result) {
  const ok = result.errors.length === 0;
  return {
    ok,
    status: ok ? (result.warnings.length ? "warning" : "ready") : "blocked",
    checkedAt: new Date().toISOString(),
    path: displayPath(envPath),
    summary: buildSafeSummary(env, result),
    counts: {
      errors: result.errors.length,
      warnings: result.warnings.length,
      origins: result.origins.length,
      missingKeys: result.missingKeys.length,
      placeholderKeys: result.placeholderKeys.length,
      wrongValues: result.wrongValues.length,
    },
    errors: result.errors,
    warnings: result.warnings,
    missingKeys: result.missingKeys,
    placeholderKeys: result.placeholderKeys,
    wrongValues: result.wrongValues,
    origins: result.origins,
  };
}

function emitJson(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (!existsSync(envPath)) {
  const result = {
    errors: [`Release env file does not exist: ${displayPath(envPath)}`],
    warnings: [],
    origins: [],
    missingKeys: requiredKeys,
    placeholderKeys: [],
    wrongValues: [],
  };
  if (shouldJson) {
    emitJson(buildReport({}, result));
    process.exit(1);
  }
  console.error(`Release env check failed: ${displayPath(envPath)} does not exist.`);
  console.error("Create .env.production or set RELEASE_ENV_PATH to the target env file.");
  process.exit(1);
}

const raw = await readFile(envPath, "utf8");
const env = dotenv.parse(raw);
const result = validateEnv(env);
const report = buildReport(env, result);

if (shouldJson) {
  emitJson(report);
  process.exit(report.ok ? 0 : 1);
}

if (result.errors.length) {
  console.error("Release env check failed", {
    path: report.path,
    errors: result.errors,
    warnings: result.warnings,
  });
  process.exit(1);
}

console.log("Release env check passed", {
  path: report.path,
  origins: result.origins.length,
  storageMode: env.SUPABASE_STORAGE_MODE,
  smsProvider: env.SMS_PROVIDER,
  warnings: result.warnings,
});
