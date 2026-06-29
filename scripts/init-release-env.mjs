import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const DEFAULT_ENV_PATH = path.join(process.cwd(), "deploy", ".env.production");
const targetPath = path.resolve(process.env.RELEASE_ENV_PATH ?? process.argv[2] ?? DEFAULT_ENV_PATH);
const shouldForce = process.argv.includes("--force") || process.env.RELEASE_ENV_FORCE === "true";
const shouldPrint = process.argv.includes("--print");

function buildReleaseEnvDraft() {
  const sessionSecret = randomBytes(32).toString("hex");
  return [
    "# Nosu Best production env draft",
    "# Replace every replace-with-* value before running npm run check:release-env.",
    "",
    "# Runtime",
    "NODE_ENV=production",
    "API_PORT=4000",
    "API_HOST=0.0.0.0",
    "ALLOWED_ORIGINS=https://replace-with-your-domain.example",
    "SERVE_STATIC_APP=true",
    "RELEASE_VERSION=0.1.0",
    "RELEASE_COMMIT=replace-with-git-commit-sha",
    "RELEASE_CHANNEL=production",
    "RELEASE_BUILD_TIME=replace-with-iso-build-time",
    `SESSION_SECRET=${sessionSecret}`,
    "SHUTDOWN_GRACE_MS=8000",
    "DEBATE_CLOCK_TICK_MS=1000",
    "",
    "# Production safety",
    "ENABLE_DEMO_AUTH=false",
    "ENABLE_OPEN_STATE_WRITE=false",
    "PHONE_CODE_HIDE_DEBUG=true",
    "",
    "# Rate limits",
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
    "",
    "# Phone verification and SMS",
    "PHONE_CODE_TTL_SECONDS=300",
    "PHONE_CODE_RESEND_SECONDS=30",
    "PHONE_CODE_MAX_ATTEMPTS=5",
    "PHONE_CODE_SMS_TEMPLATE=[노수베스트] 인증번호는 {{code}}입니다. {{ttlMinutes}}분 안에 입력해주세요.",
    "SMS_PROVIDER=solapi",
    "SOLAPI_API_KEY=replace-with-solapi-api-key",
    "SOLAPI_API_SECRET=replace-with-solapi-api-secret",
    "SOLAPI_SENDER_NUMBER=01000000000",
    "SOLAPI_API_BASE_URL=https://api.solapi.com",
    "",
    "# AI judge",
    "OPENAI_API_KEY=replace-with-openai-api-key",
    "OPENAI_JUDGE_MODEL=gpt-4o-mini",
    "AI_JUDGE_FORCE_LOCAL=false",
    "",
    "# Supabase",
    "SUPABASE_URL=https://replace-with-project-ref.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
    "SUPABASE_ANON_KEY=replace-with-anon-key",
    "VITE_SUPABASE_URL=https://replace-with-project-ref.supabase.co",
    "VITE_SUPABASE_ANON_KEY=replace-with-anon-key",
    "SUPABASE_TABLE_PREFIX=nb_",
    "SUPABASE_PROFILE_PHOTO_BUCKET=profile-photos",
    "SUPABASE_STORAGE_MODE=normalized",
    "SUPABASE_STATE_TABLE=nb_app_state",
    "APP_STATE_ID=default",
    "",
  ].join("\n");
}

const draft = buildReleaseEnvDraft();

if (shouldPrint) {
  process.stdout.write(draft);
  process.exit(0);
}

if (existsSync(targetPath) && !shouldForce) {
  console.log("Release env draft already exists; leaving it untouched", {
    path: path.relative(process.cwd(), targetPath),
  });
  process.exit(0);
}

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, draft, { encoding: "utf8", flag: shouldForce ? "w" : "wx" });
console.log("Release env draft written", {
  path: path.relative(process.cwd(), targetPath),
  next: "Replace placeholders, then run npm run check:release-env.",
});
