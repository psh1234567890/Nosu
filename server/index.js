import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createHmac, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(__dirname, "..", "data"));
const STATE_FILE = path.resolve(process.env.STATE_FILE ?? path.join(DATA_DIR, "state.json"));
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
const API_HOST = process.env.API_HOST ?? "127.0.0.1";
const PHONE_CODE_TTL_SECONDS = Number(process.env.PHONE_CODE_TTL_SECONDS ?? 300);
const PHONE_CODE_RESEND_SECONDS = Number(process.env.PHONE_CODE_RESEND_SECONDS ?? 30);
const PHONE_CODE_MAX_ATTEMPTS = Number(process.env.PHONE_CODE_MAX_ATTEMPTS ?? 5);
const PHONE_CODE_SMS_TEMPLATE =
  process.env.PHONE_CODE_SMS_TEMPLATE ??
  "[노수베스트] 인증번호는 {{code}}입니다. {{ttlMinutes}}분 안에 입력해주세요.";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL ?? "gpt-4o-mini";
const OPENAI_RESPONSES_URL = process.env.OPENAI_RESPONSES_URL ?? "https://api.openai.com/v1/responses";
const AI_JUDGE_FORCE_LOCAL = readBooleanEnv("AI_JUDGE_FORCE_LOCAL", false);
const OPENAI_JUDGE_TIMEOUT_MS = readPositiveIntEnv("OPENAI_JUDGE_TIMEOUT_MS", 20000);
const OPENING_SECONDS = 90;
const CLOSING_SECONDS = 60;
const CROSSFIRE_SECONDS = 300;
const MAX_DEBATE_CHARS = 500;
const MAX_OPENING_CHARS = 800;
const MAX_SPECTATOR_CHARS = 300;
const MAX_REPORT_REASON_CHARS = 140;
const DEFAULT_PLATFORM_SETTINGS = {
  debate: {
    openingSeconds: OPENING_SECONDS,
    closingSeconds: CLOSING_SECONDS,
    crossfireSeconds: CROSSFIRE_SECONDS,
    maxOpeningChars: MAX_OPENING_CHARS,
    maxDebateChars: MAX_DEBATE_CHARS,
    maxReportReasonChars: MAX_REPORT_REASON_CHARS,
    defaultCoinStake: 80,
    minWinnerRewardCoins: 30,
    winnerRewardRate: 0.6,
  },
  moderation: {
    reportReviewThreshold: 3,
    suspensionDefaultHours: 24,
  },
};
const PLATFORM_SETTING_LIMITS = {
  openingSeconds: { min: 30, max: 600 },
  closingSeconds: { min: 30, max: 600 },
  crossfireSeconds: { min: 30, max: 600 },
  maxOpeningChars: { min: 100, max: 3000 },
  maxDebateChars: { min: 100, max: 2000 },
  maxReportReasonChars: { min: 20, max: 500 },
  defaultCoinStake: { min: 0, max: 10000 },
  minWinnerRewardCoins: { min: 0, max: 10000 },
  winnerRewardRate: { min: 0, max: 1 },
  reportReviewThreshold: { min: 1, max: 20 },
  suspensionDefaultHours: { min: 1, max: 720 },
};
const MAX_PROFILE_PHOTO_BYTES = 1_000_000;
const MAX_AUDIT_LOGS = readPositiveIntEnv("MAX_AUDIT_LOGS", 300);
const PROFILE_PHOTO_BUCKET = process.env.SUPABASE_PROFILE_PHOTO_BUCKET ?? "profile-photos";
const DEBATE_CLOCK_TICK_MS = Number(process.env.DEBATE_CLOCK_TICK_MS ?? 1000);
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const SECURE_BACKUP_CONFIRMATION = "EXPORT FULL BACKUP";
const RESTORE_BACKUP_CONFIRMATION = "RESTORE FULL BACKUP";
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "nb_session";
const REQUIRED_AGREEMENT_VERSION = "2026-06-28";
const REQUIRED_AGREEMENT_DOCUMENTS = {
  terms: "terms-2026-06-28",
  privacy: "privacy-2026-06-28",
  community: "community-rules-2026-06-28",
};
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 14);
const IS_PRODUCTION_RUNTIME = process.env.NODE_ENV === "production";
const DEMO_AUTH_ENABLED = readBooleanEnv("ENABLE_DEMO_AUTH", !IS_PRODUCTION_RUNTIME);
const OPEN_STATE_WRITE_ENABLED = readBooleanEnv("ENABLE_OPEN_STATE_WRITE", !IS_PRODUCTION_RUNTIME);
const SERVE_STATIC_APP = readBooleanEnv("SERVE_STATIC_APP", IS_PRODUCTION_RUNTIME);
const APP_VERSION = "0.1.0";
const RELEASE_VERSION_ENV = readReleaseValue([
  ["RELEASE_VERSION", process.env.RELEASE_VERSION],
  ["npm_package_version", process.env.npm_package_version],
]);
const RELEASE_CHANNEL_ENV = readReleaseValue([["RELEASE_CHANNEL", process.env.RELEASE_CHANNEL]]);
const RELEASE_COMMIT_ENV = readReleaseValue([
  ["RENDER_GIT_COMMIT", process.env.RENDER_GIT_COMMIT],
  ["RELEASE_COMMIT", process.env.RELEASE_COMMIT],
  ["VERCEL_GIT_COMMIT_SHA", process.env.VERCEL_GIT_COMMIT_SHA],
  ["GITHUB_SHA", process.env.GITHUB_SHA],
]);
const RELEASE_VERSION = RELEASE_VERSION_ENV.value;
const RELEASE_VERSION_SOURCE = RELEASE_VERSION_ENV.source;
const RELEASE_CHANNEL = RELEASE_CHANNEL_ENV.value || (IS_PRODUCTION_RUNTIME ? "production" : "development");
const RELEASE_CHANNEL_SOURCE = RELEASE_CHANNEL_ENV.source || "runtime-default";
const RELEASE_COMMIT = RELEASE_COMMIT_ENV.value;
const RELEASE_COMMIT_SOURCE = RELEASE_COMMIT_ENV.source;
const RELEASE_BUILD_TIME = normalizeReleaseBuildTime(process.env.RELEASE_BUILD_TIME ?? process.env.BUILD_TIME);
const RELEASE_BUILD_TIME_SOURCE = process.env.RELEASE_BUILD_TIME
  ? "RELEASE_BUILD_TIME"
  : process.env.BUILD_TIME
    ? "BUILD_TIME"
    : null;
const STALE_RELEASE_ENV_KEYS = [];
if (process.env.RENDER_GIT_COMMIT && process.env.RELEASE_COMMIT) {
  const renderCommit = cleanReleaseValue(process.env.RENDER_GIT_COMMIT);
  const manualCommit = cleanReleaseValue(process.env.RELEASE_COMMIT);
  if (renderCommit && manualCommit && renderCommit !== manualCommit) STALE_RELEASE_ENV_KEYS.push("RELEASE_COMMIT");
}
const PHONE_CODE_HIDE_DEBUG = readBooleanEnv("PHONE_CODE_HIDE_DEBUG", IS_PRODUCTION_RUNTIME);
const EXPOSE_PHONE_DEBUG_CODE = !PHONE_CODE_HIDE_DEBUG;
const SMS_PROVIDER = String(process.env.SMS_PROVIDER ?? "dev").trim().toLowerCase();
const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY;
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET;
const SOLAPI_SENDER_NUMBER = process.env.SOLAPI_SENDER_NUMBER;
const SOLAPI_API_BASE_URL = process.env.SOLAPI_API_BASE_URL ?? "https://api.solapi.com";
const RATE_LIMIT_AUTH_WINDOW_SECONDS = readPositiveIntEnv("RATE_LIMIT_AUTH_WINDOW_SECONDS", 600);
const RATE_LIMIT_LOGIN_MAX = readPositiveIntEnv("RATE_LIMIT_LOGIN_MAX", 8);
const RATE_LIMIT_SIGNUP_MAX = readPositiveIntEnv("RATE_LIMIT_SIGNUP_MAX", 5);
const RATE_LIMIT_SOCIAL_MAX = readPositiveIntEnv("RATE_LIMIT_SOCIAL_MAX", 12);
const RATE_LIMIT_DEMO_MAX = readPositiveIntEnv("RATE_LIMIT_DEMO_MAX", 40);
const RATE_LIMIT_PHONE_REQUEST_MAX = readPositiveIntEnv("RATE_LIMIT_PHONE_REQUEST_MAX", 5);
const RATE_LIMIT_PHONE_VERIFY_MAX = readPositiveIntEnv("RATE_LIMIT_PHONE_VERIFY_MAX", 10);
const RATE_LIMIT_PASSWORD_MAX = readPositiveIntEnv("RATE_LIMIT_PASSWORD_MAX", 6);
const RATE_LIMIT_WRITE_WINDOW_SECONDS = readPositiveIntEnv("RATE_LIMIT_WRITE_WINDOW_SECONDS", 60);
const RATE_LIMIT_MESSAGE_MAX = readPositiveIntEnv("RATE_LIMIT_MESSAGE_MAX", 30);
const RATE_LIMIT_REPORT_MAX = readPositiveIntEnv("RATE_LIMIT_REPORT_MAX", 10);
const SHUTDOWN_GRACE_MS = readPositiveIntEnv("SHUTDOWN_GRACE_MS", 8000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  process.env.APP_SESSION_SECRET ??
  (SUPABASE_KEY ? `supabase:${SUPABASE_KEY}` : randomBytes(32).toString("hex"));
const SUPABASE_TABLE_PREFIX = process.env.SUPABASE_TABLE_PREFIX ?? "nb_";
const SUPABASE_TABLE = process.env.SUPABASE_STATE_TABLE ?? `${SUPABASE_TABLE_PREFIX}app_state`;
const SUPABASE_STORAGE_MODE = process.env.SUPABASE_STORAGE_MODE ?? "snapshot";
const STATE_ID = process.env.APP_STATE_ID ?? "default";
const SUPABASE_ENV_STATUS = supabaseEnvStatus();
const PLATFORM_ADMIN_USER_IDS = new Set(readListEnv("PLATFORM_ADMIN_USER_IDS", []));
const PLATFORM_ADMIN_LOGIN_IDS = new Set(readListEnv("PLATFORM_ADMIN_LOGIN_IDS", []));
const PLATFORM_ADMIN_ALLOWLIST_CONFIGURED = PLATFORM_ADMIN_USER_IDS.size > 0 || PLATFORM_ADMIN_LOGIN_IDS.size > 0;
const hasSupabaseConfig =
  isConfiguredUrl(SUPABASE_URL, ["your-project-ref", "placeholder"]) &&
  isConfiguredSecret(SUPABASE_KEY, ["your-service-role-or-secret-key", "placeholder"]);
const supabase =
  hasSupabaseConfig
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
const usesNormalizedSupabase = Boolean(supabase) && SUPABASE_STORAGE_MODE === "normalized";
const DEPLOY_EXTERNAL_URL = normalizeOriginUrl(process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_APP_URL);
const defaultAllowedOrigins =
  IS_PRODUCTION_RUNTIME && DEPLOY_EXTERNAL_URL
    ? [DEPLOY_EXTERNAL_URL]
    : ["http://127.0.0.1:5173", "http://localhost:5173"];
const allowedOrigins = readListEnv("ALLOWED_ORIGINS", defaultAllowedOrigins);

function readBooleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function readListEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const values = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

function readPositiveIntEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function isConfiguredUrl(value, placeholders = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (placeholders.some((placeholder) => raw.toLowerCase().includes(placeholder.toLowerCase()))) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isConfiguredSecret(value, placeholders = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (raw.length < 12) return false;
  return !placeholders.some((placeholder) => raw.toLowerCase().includes(placeholder.toLowerCase()));
}

function readReleaseValue(entries) {
  for (const [source, value] of entries) {
    const cleaned = cleanReleaseValue(value);
    if (cleaned) return { value: cleaned, source };
  }
  return { value: "", source: null };
}

function cleanReleaseValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^\w.@:/+-]/g, "-")
    .slice(0, 96);
}

function normalizeOriginUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function normalizeReleaseBuildTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizedTable(tableName) {
  return `${SUPABASE_TABLE_PREFIX}${tableName}`;
}

function supabaseEnvStatus() {
  const missing = [];
  const configured = {};
  const urlConfigured = isConfiguredUrl(SUPABASE_URL, ["your-project-ref", "placeholder"]);
  const serviceRoleConfigured = isConfiguredSecret(SUPABASE_KEY, [
    "your-service-role-or-secret-key",
    "your-service-role-key",
    "placeholder",
  ]);
  const anonKeyConfigured = isConfiguredSecret(SUPABASE_ANON_KEY, ["your-supabase-anon-key", "placeholder"]);
  configured.url = urlConfigured;
  configured.serviceRoleKey = serviceRoleConfigured;
  configured.anonKey = anonKeyConfigured;
  if (!urlConfigured) missing.push("SUPABASE_URL");
  if (!serviceRoleConfigured) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKeyConfigured) missing.push("SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY");
  if (SUPABASE_STORAGE_MODE !== "normalized") missing.push("SUPABASE_STORAGE_MODE=normalized");
  return {
    configured,
    missing,
    normalizedRequested: SUPABASE_STORAGE_MODE === "normalized",
    productionReady: missing.length === 0,
  };
}

const PERMISSIONS_POLICY = "camera=(), microphone=(self), geolocation=()";

function applySecurityHeaders(_request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  next();
}

const NORMALIZED_TABLE_NAMES = [
  "app_settings",
  "users",
  "user_claims",
  "rooms",
  "channels",
  "channel_participants",
  "channel_spectators",
  "debate_messages",
  "spectator_messages",
  "votes",
  "reactions",
  "reports",
  "coin_ledger",
];
const NORMALIZED_APP_SETTING_KEYS = [
  "current_user_id",
  "moderation_sanctions",
  "user_notifications",
  "audit_logs",
  "ai_appeals",
  "privacy_requests",
  "service_notice",
  "platform_settings",
];

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.disable("x-powered-by");
app.use(applySecurityHeaders);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use("/api", sessionIdentityMiddleware);

const providerLabels = {
  google: "Google",
  apple: "Apple",
  naver: "Naver",
  kakao: "Kakao",
};
const roleLabels = {
  admin: "메인 운영자",
  moderator: "운영진",
  member: "일반 회원",
};
const claimStatusLabels = {
  verified: "인증 완료",
  rejected: "반려",
  pending: "검토 중",
  self_reported: "자가 입력",
};
const reportStatusLabels = {
  open: "접수",
  reviewing: "검토 중",
  resolved: "조치 완료",
  dismissed: "기각",
};
const aiAppealStatusLabels = {
  pending: "검토 대기",
  reviewing: "검토 중",
  resolved: "재검토 완료",
  dismissed: "기각",
};
const shopItems = [
  {
    id: "badge_logic",
    name: "논리왕 배지",
    price: 120,
    category: "badge",
  },
  {
    id: "badge_counter",
    name: "반박 장인",
    price: 160,
    category: "badge",
  },
  {
    id: "profile_glow",
    name: "글로우 프레임권",
    price: 220,
    category: "profile",
  },
  {
    id: "channel_ticket",
    name: "프리미엄 채널권",
    price: 300,
    category: "channel",
  },
];
const judgingChannels = new Set();
const phoneVerificationCodes = new Map();
const passwordResetCodes = new Map();
const voiceSessions = new Map();
const rateLimitBuckets = new Map();
const SERVICE_NOTICE_TONES = new Set(["info", "warning", "critical"]);
let nextRateLimitPruneAt = 0;
const PROCESS_STARTED_AT = new Date();
let shuttingDown = false;
let shutdownStartedAt = null;
let debateClockTimer = null;

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString("hex");
  return { passwordHash, passwordSalt: salt };
}

function verifyPassword(user, password) {
  if (!password) return false;
  if (user.passwordHash && user.passwordSalt) {
    const expected = Buffer.from(user.passwordHash, "hex");
    const actual = pbkdf2Sync(
      password,
      user.passwordSalt,
      PASSWORD_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      PASSWORD_DIGEST,
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  return user.password === password;
}

function isUserDeactivated(user) {
  return Boolean(user?.deactivatedAt);
}

function isActiveUser(user) {
  return Boolean(user && !isUserDeactivated(user));
}

function sanitizeUser(user) {
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return { ...safeUser, password: "", agreements: normalizeAgreementState(safeUser.agreements) };
}

function sanitizeState(state) {
  if (!state) return state;
  return {
    ...state,
    users: state.users.map(sanitizeUser),
  };
}

function createRequiredAgreementState({ accepted = false, acceptedAt = "", acceptedIp = "" } = {}) {
  const requiredAccepted = Boolean(accepted);
  const effectiveAcceptedAt = requiredAccepted ? (acceptedAt || new Date().toISOString()) : "";
  return {
    requiredVersion: REQUIRED_AGREEMENT_VERSION,
    requiredAccepted,
    acceptedAt: effectiveAcceptedAt,
    acceptedIp: requiredAccepted ? String(acceptedIp ?? "").slice(0, 120) : "",
    documents: { ...REQUIRED_AGREEMENT_DOCUMENTS },
    updatedAt: effectiveAcceptedAt,
  };
}

function normalizeAgreementState(agreements, { fallbackAccepted = true } = {}) {
  if (!agreements || typeof agreements !== "object") {
    return createRequiredAgreementState({ accepted: fallbackAccepted });
  }
  const documents = agreements.documents && typeof agreements.documents === "object" ? agreements.documents : {};
  const requiredAccepted =
    Boolean(agreements.requiredAccepted) &&
    agreements.requiredVersion === REQUIRED_AGREEMENT_VERSION &&
    documents.terms === REQUIRED_AGREEMENT_DOCUMENTS.terms &&
    documents.privacy === REQUIRED_AGREEMENT_DOCUMENTS.privacy &&
    documents.community === REQUIRED_AGREEMENT_DOCUMENTS.community;
  const acceptedAt = String(agreements.acceptedAt ?? agreements.updatedAt ?? "");
  return {
    requiredVersion: REQUIRED_AGREEMENT_VERSION,
    requiredAccepted,
    acceptedAt: requiredAccepted ? acceptedAt : "",
    acceptedIp: requiredAccepted ? String(agreements.acceptedIp ?? "").slice(0, 120) : "",
    documents: {
      terms: REQUIRED_AGREEMENT_DOCUMENTS.terms,
      privacy: REQUIRED_AGREEMENT_DOCUMENTS.privacy,
      community: REQUIRED_AGREEMENT_DOCUMENTS.community,
    },
    updatedAt: requiredAccepted ? String(agreements.updatedAt ?? acceptedAt) : "",
  };
}

function agreementPayloadForUser(user) {
  return normalizeAgreementState(user?.agreements);
}

function stateBackupCounts(state) {
  return {
    users: state.users?.length ?? 0,
    rooms: state.rooms?.length ?? 0,
    channels: state.channels?.length ?? 0,
    debateMessages: (state.channels ?? []).reduce((sum, channel) => sum + (channel.debateMessages?.length ?? 0), 0),
    spectatorMessages: (state.channels ?? []).reduce((sum, channel) => sum + (channel.spectatorMessages?.length ?? 0), 0),
    ledger: state.ledger?.length ?? 0,
    reports: state.reports?.length ?? 0,
    sanctions: state.sanctions?.length ?? 0,
    notifications: state.notifications?.length ?? 0,
    auditLogs: state.auditLogs?.length ?? 0,
    serviceNotice: state.serviceNotice ? 1 : 0,
  };
}

function extractStateBackupCandidate(body) {
  const backup = body?.backup && typeof body.backup === "object" ? body.backup : null;
  const directState = body?.state && typeof body.state === "object" ? body.state : null;
  if (backup?.state && typeof backup.state === "object") return backup.state;
  if (directState) return directState;
  return backup ?? body;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (!value) return;
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }
    seen.add(value);
  });
  return [...duplicates];
}

function backupUserHasSecrets(user) {
  return Boolean(user && ("passwordHash" in user || "passwordSalt" in user));
}

function buildSecureBackupState(state) {
  const normalizedState = normalizeStoredState(state);
  return {
    ...normalizedState,
    currentUserId: null,
    users: jsonArray(normalizedState.users).map((user) => {
      const generatedSecret =
        !user.passwordHash && !user.passwordSalt && user.password
          ? hashPassword(user.password)
          : null;
      return {
        ...user,
        password: "",
        passwordHash: user.passwordHash ?? generatedSecret?.passwordHash,
        passwordSalt: user.passwordSalt ?? generatedSecret?.passwordSalt,
      };
    }),
  };
}

function secureBackupSecretCounts(state) {
  const users = jsonArray(state?.users);
  return {
    users: users.length,
    passwordSecrets: users.filter((user) => user.passwordHash && user.passwordSalt).length,
    socialOrPasswordlessUsers: users.filter((user) => !user.passwordHash || !user.passwordSalt).length,
  };
}

function buildRestoredStateFromBackup(candidate) {
  const normalizedState = normalizeStoredState(candidate);
  return {
    ...normalizedState,
    currentUserId: null,
    users: jsonArray(normalizedState.users).map((user) => ({
      ...user,
      password: "",
    })),
  };
}

function validateStateBackup(candidate) {
  const errors = [];
  const warnings = [];

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {
      valid: false,
      errors: ["invalid_backup_object"],
      warnings,
      secretsIncluded: false,
      redactedFields: [],
      counts: stateBackupCounts({}),
      restoreMode: "invalid",
      recommendedAction: "upload_valid_state_backup",
    };
  }

  const requiredArrays = ["users", "rooms", "channels", "ledger"];
  requiredArrays.forEach((key) => {
    if (!Array.isArray(candidate[key])) errors.push(`missing_${key}_array`);
  });

  ["reports", "sanctions", "notifications", "auditLogs", "aiAppeals", "privacyRequests"].forEach((key) => {
    if (candidate[key] !== undefined && !Array.isArray(candidate[key])) {
      warnings.push(`coerced_${key}_to_empty_array`);
    }
  });

  const normalized = normalizeStoredState({
    ...candidate,
    users: jsonArray(candidate.users),
    rooms: jsonArray(candidate.rooms),
    channels: jsonArray(candidate.channels),
    ledger: jsonArray(candidate.ledger),
    reports: jsonArray(candidate.reports),
    sanctions: jsonArray(candidate.sanctions),
    notifications: jsonArray(candidate.notifications),
    auditLogs: jsonArray(candidate.auditLogs),
    aiAppeals: jsonArray(candidate.aiAppeals),
    privacyRequests: jsonArray(candidate.privacyRequests),
    currentUserId: null,
  });
  const users = normalized.users ?? [];
  const channels = normalized.channels ?? [];
  const activeManagers = users.filter((user) => canManagePlatform(user));
  if (Array.isArray(candidate.users) && activeManagers.length === 0) {
    errors.push("missing_active_platform_manager");
  }

  const duplicateUserIds = duplicateValues(users.map((user) => user.id));
  const duplicateRoomIds = duplicateValues((normalized.rooms ?? []).map((room) => room.id));
  const duplicateChannelIds = duplicateValues(channels.map((channel) => channel.id));
  if (duplicateUserIds.length > 0) warnings.push("duplicate_user_ids");
  if (duplicateRoomIds.length > 0) warnings.push("duplicate_room_ids");
  if (duplicateChannelIds.length > 0) warnings.push("duplicate_channel_ids");

  const secretsIncluded = users.some(backupUserHasSecrets);
  if (secretsIncluded) {
    warnings.push("password_secrets_present");
  } else {
    warnings.push("password_secrets_redacted");
  }
  if (candidate.currentUserId) warnings.push("current_session_user_ignored");

  const channelsWithMissingRooms = channels.filter(
    (channel) => channel.roomId && !(normalized.rooms ?? []).some((room) => room.id === channel.roomId),
  );
  if (channelsWithMissingRooms.length > 0) warnings.push("channels_reference_missing_rooms");

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    secretsIncluded,
    redactedFields: secretsIncluded ? [] : ["users.passwordHash", "users.passwordSalt"],
    counts: stateBackupCounts(normalized),
    restoreMode: valid ? (secretsIncluded ? "full-state" : "redacted-state") : "invalid",
    recommendedAction: valid
      ? secretsIncluded
        ? "store_securely_before_restore"
        : "restore_requires_password_reset_or_identity_provider"
      : "fix_backup_shape_before_restore",
  };
}

function snapshotUser(user) {
  return {
    userId: user.id,
    displayName: user.displayName,
    title: user.title,
    bio: user.bio,
    photoUrl: user.photoUrl,
    accentColor: user.accentColor ?? "blue",
    profileFrame: user.profileFrame ?? "clean",
    bannerStyle: user.bannerStyle ?? "plain",
    featuredBadge: user.featuredBadge ?? "신규 토론러",
    claims: user.claims ?? [],
    stats: user.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
  };
}

function createDemoSeedState() {
  const seedUsers = [
    {
      id: "u_admin",
      loginId: "nosu",
      password: "demo",
      authProvider: "local",
      phone: "010-0000-2026",
      phoneVerified: true,
      displayName: "노수",
      title: "메인 운영자 / 토론 기획자",
      bio: "논쟁이 콘텐츠가 되는 커뮤니티를 실험 중입니다. 좋은 주제, 명확한 룰, 깔끔한 판정을 중요하게 봅니다.",
      photoUrl: "",
      role: "admin",
      coins: 1200,
      accentColor: "blue",
      profileFrame: "glow",
      bannerStyle: "gradient",
      featuredBadge: "운영자 인증",
      ownedItemIds: ["badge_logic", "profile_glow"],
      claims: [
        { id: "c_admin_1", label: "운영 권한", value: "플랫폼 메인 운영자", status: "verified" },
        { id: "c_admin_2", label: "관심 분야", value: "정책, 기술, 커뮤니티 설계", status: "self_reported" },
      ],
      stats: { wins: 3, losses: 1, aiRating: 86, voteTrust: 92 },
    },
    {
      id: "u_seojun",
      loginId: "seojun",
      password: "demo",
      authProvider: "google",
      phone: "010-1111-2026",
      phoneVerified: true,
      displayName: "한서준",
      title: "정책 토론러",
      bio: "제도 설계와 노동시장 이슈를 주로 다룹니다. 주장보다 근거가 오래 남는다고 믿습니다.",
      photoUrl: "",
      role: "member",
      coins: 860,
      accentColor: "mint",
      profileFrame: "solid",
      bannerStyle: "plain",
      featuredBadge: "정책 토론 12승",
      ownedItemIds: ["badge_logic"],
      claims: [
        { id: "c_seojun_1", label: "학력", value: "서울대학교 정치외교학부", status: "verified" },
        { id: "c_seojun_2", label: "경력", value: "전 국회 보좌진", status: "pending" },
      ],
      stats: { wins: 12, losses: 5, aiRating: 91, voteTrust: 84 },
    },
    {
      id: "u_jia",
      loginId: "jia",
      password: "demo",
      authProvider: "kakao",
      phone: "010-2222-2026",
      phoneVerified: true,
      displayName: "민지아",
      title: "AI 제품 PM",
      bio: "기술이 사회적 비용과 편익을 어떻게 바꾸는지 토론합니다. 반례 찾기를 좋아합니다.",
      photoUrl: "",
      role: "moderator",
      coins: 990,
      accentColor: "violet",
      profileFrame: "glow",
      bannerStyle: "midnight",
      featuredBadge: "AI 제품 PM",
      ownedItemIds: ["profile_glow", "badge_counter"],
      claims: [
        { id: "c_jia_1", label: "학력", value: "KAIST 전산학부", status: "verified" },
        { id: "c_jia_2", label: "직업", value: "AI 스타트업 PM", status: "verified" },
      ],
      stats: { wins: 18, losses: 7, aiRating: 88, voteTrust: 89 },
    },
    {
      id: "u_yeonwoo",
      loginId: "yeonwoo",
      password: "demo",
      authProvider: "naver",
      phone: "010-3333-2026",
      phoneVerified: true,
      displayName: "정연우",
      title: "법률 쟁점 전문 토론러",
      bio: "규제와 권리 충돌을 주로 다룹니다. 토론 중 정의를 먼저 맞추는 편입니다.",
      photoUrl: "",
      role: "member",
      coins: 730,
      accentColor: "amber",
      profileFrame: "clean",
      bannerStyle: "gradient",
      featuredBadge: "법률 쟁점",
      ownedItemIds: [],
      claims: [
        { id: "c_yeonwoo_1", label: "직업", value: "변호사", status: "pending" },
        { id: "c_yeonwoo_2", label: "전문 분야", value: "플랫폼 규제", status: "self_reported" },
      ],
      stats: { wins: 8, losses: 8, aiRating: 79, voteTrust: 76 },
    },
  ];
  const seedRooms = [
    {
      id: "r_ai_labor",
      title: "AI와 노동시장",
      topic: "생성형 AI가 일자리를 대체하는가, 아니면 새로운 기회를 만드는가?",
      createdBy: "u_admin",
      createdAt: "06.07 00:10",
    },
    {
      id: "r_real_estate",
      title: "부동산 정책",
      topic: "규제 완화와 공급 확대 중 어느 쪽이 주거 안정에 더 효과적인가?",
      createdBy: "u_admin",
      createdAt: "06.07 00:12",
    },
    {
      id: "r_education",
      title: "입시와 공정성",
      topic: "정시 확대가 공정성을 높이는가, 교육 격차를 더 키우는가?",
      createdBy: "u_jia",
      createdAt: "06.07 00:14",
    },
  ];
  const nowMs = Date.now();
  const seedChannels = [
    {
      id: "d_ai_public",
      roomId: "r_ai_labor",
      title: "AI 대체론 vs 보완론",
      visibility: "public",
      format: "text",
      status: "live",
      phase: "crossfire",
      createdBy: "u_seojun",
      participantLimit: 2,
      participantIds: ["u_seojun", "u_jia"],
      readyUserIds: ["u_seojun", "u_jia"],
      participantSnapshots: {
        u_seojun: snapshotUser(seedUsers[1]),
        u_jia: snapshotUser(seedUsers[2]),
      },
      stanceByUser: { u_seojun: "agree", u_jia: "disagree" },
      activeSpeakerId: "u_seojun",
      phaseStartedAt: nowMs,
      turnStartedAt: nowMs,
      remainingSecondsByUser: { u_seojun: CROSSFIRE_SECONDS, u_jia: CROSSFIRE_SECONDS },
      voiceStateByUser: {
        u_seojun: { muted: false, handRaised: false, updatedAt: "00:18" },
        u_jia: { muted: true, handRaised: true, updatedAt: "00:19" },
      },
      spectatorIds: ["u_admin", "u_yeonwoo"],
      debateMessages: [
        {
          id: "m_1",
          authorId: "u_seojun",
          body: "AI는 단순 업무부터 빠르게 대체합니다. 이미 고객센터, 번역, 초안 작성 업무는 인력 수요가 줄고 있습니다.",
          createdAt: "00:18",
        },
        {
          id: "m_2",
          authorId: "u_jia",
          body: "하지만 대체만 보면 반쪽입니다. 생산성이 오르면 새로운 서비스와 직무가 생깁니다. 핵심은 전환 교육 속도입니다.",
          createdAt: "00:19",
        },
        {
          id: "m_3",
          authorId: "u_seojun",
          body: "전환 교육이 가능하다는 주장에는 동의하지만, 중장년 노동자의 전환 비용과 기간을 어떻게 줄일지 근거가 필요합니다.",
          createdAt: "00:21",
        },
      ],
      spectatorMessages: [
        { id: "s_1", authorId: "u_admin", body: "근거 싸움이 좋아지고 있네요.", createdAt: "00:22" },
        { id: "s_2", authorId: "u_yeonwoo", body: "전환 비용 질문이 핵심 같습니다.", createdAt: "00:23" },
      ],
      votes: [],
      reactions: [
        { id: "react_1", spectatorId: "u_admin", targetUserId: "u_jia", createdAt: "00:24" },
        { id: "react_2", spectatorId: "u_yeonwoo", targetUserId: "u_seojun", createdAt: "00:24" },
      ],
      coinStake: 80,
      createdAt: "06.07 00:16",
    },
    {
      id: "d_ai_private",
      roomId: "r_ai_labor",
      title: "비공개 초청 토론: 기본소득",
      visibility: "private",
      inviteCode: "NB-2046",
      format: "voice",
      status: "waiting",
      phase: "ready",
      createdBy: "u_yeonwoo",
      participantLimit: 2,
      participantIds: ["u_yeonwoo"],
      readyUserIds: [],
      participantSnapshots: {
        u_yeonwoo: snapshotUser(seedUsers[3]),
      },
      stanceByUser: { u_yeonwoo: "agree" },
      remainingSecondsByUser: { u_yeonwoo: CROSSFIRE_SECONDS },
      voiceStateByUser: {
        u_yeonwoo: { muted: true, handRaised: false, updatedAt: "00:24" },
      },
      spectatorIds: [],
      debateMessages: [],
      spectatorMessages: [],
      votes: [],
      reactions: [],
      coinStake: 120,
      createdAt: "06.07 00:24",
    },
  ];
  return normalizeStoredState({
    users: seedUsers,
    rooms: seedRooms,
    channels: seedChannels,
    ledger: [
      { id: "l_1", type: "signup", userId: "u_admin", amount: 1000, memo: "운영자 초기 코인", createdAt: "06.07 00:00" },
      { id: "l_2", type: "signup", userId: "u_seojun", amount: 500, memo: "가입 보너스", createdAt: "06.07 00:01" },
      { id: "l_3", type: "signup", userId: "u_jia", amount: 500, memo: "가입 보너스", createdAt: "06.07 00:02" },
    ],
    reports: [],
    sanctions: [],
    notifications: [],
    auditLogs: [],
    aiAppeals: [],
    privacyRequests: [],
    serviceNotice: null,
    currentUserId: null,
  });
}

function normalizeVoiceState(voiceState) {
  return {
    muted: typeof voiceState?.muted === "boolean" ? voiceState.muted : true,
    handRaised: typeof voiceState?.handRaised === "boolean" ? voiceState.handRaised : false,
    ...(voiceState?.updatedAt ? { updatedAt: String(voiceState.updatedAt) } : {}),
  };
}

function preserveUserSecrets(nextState, previousState) {
  if (!previousState) return nextState;
  const previousUsers = new Map(previousState.users.map((user) => [user.id, user]));
  return {
    ...nextState,
    users: nextState.users.map((user) => {
      const previousUser = previousUsers.get(user.id);
      if (!previousUser) return user;
      return {
        ...user,
        password: user.password || previousUser.password || "",
        passwordHash: user.passwordHash || previousUser.passwordHash,
        passwordSalt: user.passwordSalt || previousUser.passwordSalt,
      };
    }),
  };
}

function errorResponse(response, status, error) {
  response.status(status).json({ error });
}

function getClientAddress(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwardedFor || request.ip || request.socket?.remoteAddress || "unknown";
}

function normalizeRateLimitPart(value) {
  return String(value ?? "none").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 80) || "none";
}

function pruneRateLimitBuckets(now = Date.now()) {
  if (now < nextRateLimitPruneAt && rateLimitBuckets.size < 10_000) return;
  nextRateLimitPruneAt = now + 60_000;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function consumeRateLimit(request, response, { scope, keyParts = [], max, windowSeconds }) {
  const now = Date.now();
  pruneRateLimitBuckets(now);
  const windowMs = Math.max(1, Number(windowSeconds)) * 1000;
  const limit = Math.max(1, Number(max));
  const key = [scope, getClientAddress(request), ...keyParts.map(normalizeRateLimitPart)].join(":");
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - 1)));
    return true;
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    response.setHeader("Retry-After", String(retryAfterSeconds));
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", "0");
    response.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    response.status(429).json({ error: "rate_limited", retryAfterSeconds });
    return false;
  }

  bucket.count += 1;
  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  return true;
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) return [part, ""];
        return [part.slice(0, separatorIndex), decodeURIComponent(part.slice(separatorIndex + 1))];
      }),
  );
}

function getSessionToken(request) {
  return parseCookies(request)[AUTH_COOKIE_NAME] ?? "";
}

function signSessionPayload(payload) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createCsrfToken(sessionToken) {
  return sessionToken ? createHmac("sha256", SESSION_SECRET).update(`csrf:${sessionToken}`).digest("base64url") : "";
}

function createSessionToken(userId) {
  const userSegment = Buffer.from(String(userId), "utf8").toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${userSegment}.${expiresAt}.${nonce}`;
  return `${payload}.${signSessionPayload(payload)}`;
}

function getSignedSession(request) {
  const token = getSessionToken(request);
  if (!token) return { token: "", userId: "", expiresAt: 0 };
  const parts = String(token).split(".");
  if (parts.length !== 4) return { token: "", userId: "", expiresAt: 0 };
  const [userSegment, expiresAtRaw, nonce, signature] = parts;
  const payload = `${userSegment}.${expiresAtRaw}.${nonce}`;
  if (!safeEqualString(signature, signSessionPayload(payload))) return { token: "", userId: "", expiresAt: 0 };
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { token: "", userId: "", expiresAt: 0 };
  try {
    return {
      token,
      userId: Buffer.from(userSegment, "base64url").toString("utf8"),
      expiresAt,
    };
  } catch {
    return { token: "", userId: "", expiresAt: 0 };
  }
}

function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidKoreanPhone(phone) {
  return /^010-?\d{4}-?\d{4}$/.test(phone);
}

function normalizePhoneNumber(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function findVerifiedPhoneOwner(state, phone, excludedUserId = "") {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return null;
  return (state.users ?? []).find(
    (user) =>
      user.id !== excludedUserId &&
      !isUserDeactivated(user) &&
      user.phoneVerified &&
      normalizePhoneNumber(user.phone) === normalizedPhone,
  ) ?? null;
}

function createPhoneCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashPhoneCode(userId, phone, code) {
  return createHmac("sha256", SESSION_SECRET)
    .update(`${userId}:${normalizePhoneNumber(phone)}:${code}`)
    .digest("hex");
}

function publicPhoneCodePayload(code, record, delivery = { provider: "dev", sent: false }) {
  const canExposeDebugCode = EXPOSE_PHONE_DEBUG_CODE && delivery.provider !== "solapi";
  return {
    ok: true,
    expiresAt: record.expiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((record.expiresAt - Date.now()) / 1000)),
    resendAfterSeconds: PHONE_CODE_RESEND_SECONDS,
    attemptsRemaining: Math.max(0, PHONE_CODE_MAX_ATTEMPTS - record.attempts),
    smsProvider: delivery.provider,
    smsSent: Boolean(delivery.sent),
    ...(delivery.deliveryId ? { smsDeliveryId: delivery.deliveryId } : {}),
    ...(canExposeDebugCode ? { devCode: code } : {}),
  };
}

function isConfiguredSolapiSender(value) {
  const normalized = normalizePhoneNumber(value);
  if (normalized.length < 8) return false;
  return !["00000000", "0000000000", "01000000000", "01012345678"].includes(normalized);
}

function getSmsProviderStatus() {
  const provider = SMS_PROVIDER || "dev";
  const devProvider = ["dev", "console", "log"].includes(provider);
  const solapiProvider = provider === "solapi";
  const solapiKeyConfigured = isConfiguredSecret(SOLAPI_API_KEY, [
    "your-solapi-api-key",
    "replace-with-solapi-api-key",
    "placeholder",
  ]);
  const solapiSecretConfigured = isConfiguredSecret(SOLAPI_API_SECRET, [
    "your-solapi-api-secret",
    "replace-with-solapi-api-secret",
    "placeholder",
  ]);
  const solapiSenderConfigured = isConfiguredSolapiSender(SOLAPI_SENDER_NUMBER);
  const solapiConfigured = solapiProvider && solapiKeyConfigured && solapiSecretConfigured && solapiSenderConfigured;
  const missingEnv = [];

  if (!solapiProvider) missingEnv.push("SMS_PROVIDER=solapi");
  if (!solapiKeyConfigured) missingEnv.push("SOLAPI_API_KEY");
  if (!solapiSecretConfigured) missingEnv.push("SOLAPI_API_SECRET");
  if (!solapiSenderConfigured) missingEnv.push("SOLAPI_SENDER_NUMBER");
  if (!PHONE_CODE_HIDE_DEBUG) missingEnv.push("PHONE_CODE_HIDE_DEBUG=true");

  return {
    provider,
    supportedProvider: devProvider || solapiProvider,
    devProvider,
    realProvider: solapiProvider,
    configured: solapiProvider ? solapiConfigured : devProvider && EXPOSE_PHONE_DEBUG_CODE,
    solapiConfigured,
    solapiKeyConfigured,
    solapiSecretConfigured,
    solapiSenderConfigured,
    debugCodeExposed: EXPOSE_PHONE_DEBUG_CODE,
    productionReady: solapiConfigured && PHONE_CODE_HIDE_DEBUG,
    missingEnv,
  };
}

function isSmsProviderConfigured() {
  return getSmsProviderStatus().configured;
}

function createPhoneCodeMessage(code) {
  return PHONE_CODE_SMS_TEMPLATE
    .split("{{code}}").join(code)
    .split("{{ttlSeconds}}").join(String(PHONE_CODE_TTL_SECONDS))
    .split("{{ttlMinutes}}").join(String(Math.ceil(PHONE_CODE_TTL_SECONDS / 60)));
}

function maskPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length < 8) return "****";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function createSolapiAuthHeader() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", SOLAPI_API_SECRET).update(`${date}${salt}`).digest("hex");
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendPhoneVerificationCode(phone, code) {
  const provider = SMS_PROVIDER || "dev";
  const normalizedPhone = normalizePhoneNumber(phone);
  const text = createPhoneCodeMessage(code);

  if (provider === "solapi") {
    const smsStatus = getSmsProviderStatus();
    if (!smsStatus.solapiConfigured) {
      return { provider, sent: false, error: "sms_provider_not_configured", missingEnv: smsStatus.missingEnv };
    }

    let response;
    try {
      response = await fetch(`${SOLAPI_API_BASE_URL.replace(/\/$/, "")}/messages/v4/send-many/detail`, {
        method: "POST",
        headers: {
          Authorization: createSolapiAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              to: normalizedPhone,
              from: normalizePhoneNumber(SOLAPI_SENDER_NUMBER),
              text,
              autoTypeDetect: true,
            },
          ],
          allowDuplicates: false,
        }),
      });
    } catch (error) {
      console.error("Phone SMS send failed", {
        provider,
        errorName: error?.name ?? "FetchError",
      });
      return { provider, sent: false, error: "sms_send_failed" };
    }

    const responseText = await response.text();
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }

    if (!response.ok || data?.failedMessageList?.length) {
      console.error("Phone SMS send failed", {
        provider,
        status: response.status,
        errorCode: data?.errorCode,
        errorMessage: data?.errorMessage,
        failedMessageCount: data?.failedMessageList?.length ?? 0,
      });
      return { provider, sent: false, error: "sms_send_failed" };
    }

    return {
      provider,
      sent: true,
      deliveryId: data?.groupInfo?.groupId ?? data?.messageList?.[0]?.messageId ?? "",
    };
  }

  if (["dev", "console", "log"].includes(provider)) {
    if (EXPOSE_PHONE_DEBUG_CODE) {
      console.info(`Phone verification code for ${maskPhoneNumber(phone)}: ${code}`);
      return { provider: "dev", sent: false };
    }
    return { provider: "dev", sent: false, error: "sms_provider_not_configured" };
  }

  return { provider, sent: false, error: "sms_provider_not_configured" };
}

function getSignedSessionUserId(request) {
  return getSignedSession(request).userId;
}

function authCookieAttributes(maxAgeSeconds = SESSION_TTL_SECONDS) {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean);
}

function setAuthCookie(response, userId) {
  const token = createSessionToken(userId);
  response.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${authCookieAttributes().join("; ")}`,
  );
  return createCsrfToken(token);
}

function clearAuthCookie(response) {
  response.setHeader("Set-Cookie", `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function requiresSession(request) {
  const method = request.method.toUpperCase();
  const pathName = request.path;
  if (method === "GET" && (pathName === "/health" || pathName === "/state")) return false;
  if (
    pathName === "/auth/login" ||
    pathName === "/auth/signup" ||
    pathName === "/auth/password-reset/request-code" ||
    pathName === "/auth/password-reset/confirm" ||
    pathName === "/auth/social" ||
    pathName === "/auth/oauth/session" ||
    pathName === "/auth/select-demo" ||
    pathName === "/auth/logout"
  ) {
    return false;
  }
  if (pathName === "/state" && (method === "PUT" || method === "DELETE")) return !OPEN_STATE_WRITE_ENABLED;
  return (
    pathName.startsWith("/admin") ||
    pathName.startsWith("/users") ||
    pathName.startsWith("/shop") ||
    pathName.startsWith("/notifications") ||
    pathName.startsWith("/channels") ||
    pathName.startsWith("/debate") ||
    pathName.startsWith("/reports") ||
    pathName.startsWith("/ai") ||
    pathName === "/auth/phone/change" ||
    pathName === "/auth/phone/request-code" ||
    pathName === "/auth/phone/verify" ||
    pathName === "/auth/agreements/accept" ||
    pathName === "/auth/password" ||
    pathName === "/auth/account/deactivate"
  );
}

function requiresCsrf(request) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  const pathName = request.path;
  if (
    pathName === "/auth/login" ||
    pathName === "/auth/signup" ||
    pathName === "/auth/password-reset/request-code" ||
    pathName === "/auth/password-reset/confirm" ||
    pathName === "/auth/social" ||
    pathName === "/auth/oauth/session" ||
    pathName === "/auth/select-demo"
  ) {
    return false;
  }
  if (pathName === "/state") return false;
  return requiresSession(request) || pathName === "/auth/logout";
}

function validateCsrfRequest(request, response) {
  if (!request.sessionUserId || !request.csrfToken) {
    errorResponse(response, 401, "not_authenticated");
    return false;
  }
  const submittedToken = String(request.headers["x-csrf-token"] ?? "");
  if (!submittedToken || !safeEqualString(submittedToken, request.csrfToken)) {
    errorResponse(response, 403, "csrf_invalid");
    return false;
  }
  return true;
}

function sessionIdentityMiddleware(request, response, next) {
  const sessionToken = getSessionToken(request);
  const sessionUserId = getSignedSessionUserId(request);
  request.sessionUserId = sessionUserId;
  request.csrfToken = sessionUserId ? createCsrfToken(sessionToken) : "";
  if (sessionUserId && requiresSession(request) && request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
    request.body.userId = sessionUserId;
    request.body.actorId = sessionUserId;
  }
  if (requiresSession(request) && !sessionUserId) {
    errorResponse(response, 401, "not_authenticated");
    return;
  }
  if (requiresCsrf(request) && !validateCsrfRequest(request, response)) return;
  next();
}

function sessionUserFromState(request, state) {
  const userId = request.sessionUserId || getSignedSessionUserId(request);
  const user = userId ? findStateUser(state, userId) : null;
  return isActiveUser(user) ? user : null;
}

function requireSessionUser(request, response, state) {
  const user = sessionUserFromState(request, state);
  if (!user) {
    errorResponse(response, 401, "not_authenticated");
    return null;
  }
  return user;
}

function authStateForRequest(request, state) {
  const user = sessionUserFromState(request, state);
  return sanitizeState({ ...state, currentUserId: user?.id ?? null });
}

async function requireAdminRequest(request, response, next) {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) {
      request.body.actorId = actor.id;
    }
    request.platformManager = actor;
    next();
  } catch (error) {
    next(error);
  }
}

function sessionUserPayload(user) {
  if (!user) return null;
  const safeUser = sanitizeUser(user);
  return {
    id: safeUser.id,
    loginId: safeUser.loginId,
    displayName: safeUser.displayName,
    role: safeUser.role,
    authProvider: safeUser.authProvider,
    phoneVerified: Boolean(safeUser.phoneVerified),
    photoUrl: safeUser.photoUrl ?? "",
    accentColor: safeUser.accentColor ?? "blue",
    profileFrame: safeUser.profileFrame ?? "clean",
    agreements: agreementPayloadForUser(safeUser),
  };
}

function clampScore(value, min = 20, max = 98) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function scoreDebateCategories(messages) {
  const text = messages.map((message) => message.body).join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const evidenceHits = (text.match(/근거|자료|통계|사례|연구|수치|비용|효과|전환/g) ?? []).length;
  const rebuttalHits = (text.match(/반박|하지만|그러나|따라서|동의|질문|핵심|논리/g) ?? []).length;
  const relevanceHits = (text.match(/주제|쟁점|정의|원인|결과|대안|정책|시장|교육|AI|규제/g) ?? []).length;
  const toxicHits = (text.match(/멍청|바보|꺼져|한심|무식|쓰레기/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const logic = clampScore(48 + words * 0.16 + rebuttalHits * 4 + questions * 2, 35);
  const evidence = clampScore(45 + evidenceHits * 8 + words * 0.08, 35);
  const rebuttal = clampScore(44 + rebuttalHits * 7 + questions * 3, 35);
  const relevance = clampScore(50 + relevanceHits * 4 + Math.min(words, 220) * 0.07, 35);
  const conduct = clampScore(88 - toxicHits * 18);
  const total = Math.round(logic * 0.28 + evidence * 0.24 + rebuttal * 0.22 + relevance * 0.18 + conduct * 0.08);
  return { logic, evidence, rebuttal, relevance, conduct, total };
}

function buildFallbackJudgement(channel) {
  const voteScores = Object.fromEntries(
    channel.participantIds.map((participantId) => [
      participantId,
      channel.votes.filter((voteItem) => voteItem.targetUserId === participantId).length,
    ]),
  );
  const totalVotes = Math.max(1, channel.votes.length);
  const categoryScores = Object.fromEntries(
    channel.participantIds.map((participantId) => [
      participantId,
      scoreDebateCategories(channel.debateMessages.filter((message) => message.authorId === participantId)),
    ]),
  );
  const userScores = Object.fromEntries(
    channel.participantIds.map((participantId) => [participantId, categoryScores[participantId].total]),
  );
  const finalScores = Object.fromEntries(
    channel.participantIds.map((participantId) => {
      const aiScore = userScores[participantId] ?? 50;
      const audienceScore =
        channel.votes.length === 0 ? 50 : ((voteScores[participantId] ?? 0) / totalVotes) * 100;
      return [participantId, Math.round(audienceScore * 0.6 + aiScore * 0.4)];
    }),
  );
  const [winnerId, loserId] = [...channel.participantIds].sort(
    (a, b) => (finalScores[b] ?? 0) - (finalScores[a] ?? 0),
  );
  const winner = channel.participantSnapshots[winnerId];
  const other = channel.participantSnapshots[loserId];
  const aiGap = (userScores[winnerId] ?? 0) - (userScores[loserId] ?? 0);
  const voteGap = (voteScores[winnerId] ?? 0) - (voteScores[loserId] ?? 0);

  return {
    winnerId,
    loserId,
    userScores,
    categoryScores,
    voteScores,
    finalScores,
    reasoning: `${winner?.displayName ?? "승자"}는 근거 제시, 반박 대응, 주제 유지 점수에서 우위를 보였습니다. ${other?.displayName ? `${other.displayName}와 비교해 ` : ""}AI 점수 차이는 ${aiGap}점, 관전자 표 차이는 ${voteGap}표였고 관전자 투표 60%와 AI 분석 40%를 합산해 최종 승자로 결정했습니다.`,
    source: "fallback",
  };
}

function normalizeJudgePayload(channel, parsed) {
  const fallback = buildFallbackJudgement(channel);
  const categoryScores = {};
  for (const participantId of channel.participantIds) {
    const score = parsed?.categoryScores?.[participantId] ?? {};
    categoryScores[participantId] = {
      logic: clampScore(score.logic ?? fallback.categoryScores[participantId].logic, 35),
      evidence: clampScore(score.evidence ?? fallback.categoryScores[participantId].evidence, 35),
      rebuttal: clampScore(score.rebuttal ?? fallback.categoryScores[participantId].rebuttal, 35),
      relevance: clampScore(score.relevance ?? fallback.categoryScores[participantId].relevance, 35),
      conduct: clampScore(score.conduct ?? fallback.categoryScores[participantId].conduct),
      total: clampScore(score.total ?? fallback.categoryScores[participantId].total, 35),
    };
  }
  const userScores = Object.fromEntries(
    channel.participantIds.map((participantId) => [participantId, categoryScores[participantId].total]),
  );
  const voteScores = fallback.voteScores;
  const totalVotes = Math.max(1, channel.votes.length);
  const finalScores = Object.fromEntries(
    channel.participantIds.map((participantId) => {
      const audienceScore =
        channel.votes.length === 0 ? 50 : ((voteScores[participantId] ?? 0) / totalVotes) * 100;
      return [participantId, Math.round(audienceScore * 0.6 + userScores[participantId] * 0.4)];
    }),
  );
  const rankedWinnerId =
    parsed?.winnerId && channel.participantIds.includes(parsed.winnerId)
      ? parsed.winnerId
      : [...channel.participantIds].sort((a, b) => (finalScores[b] ?? 0) - (finalScores[a] ?? 0))[0];
  const loserId = channel.participantIds.find((participantId) => participantId !== rankedWinnerId) ?? fallback.loserId;

  return {
    winnerId: rankedWinnerId,
    loserId,
    userScores,
    categoryScores,
    voteScores,
    finalScores,
    reasoning: String(parsed?.reasoning ?? fallback.reasoning).slice(0, 600),
    source: parsed ? "openai" : "fallback",
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

function getAiJudgeStatus() {
  const configured = isConfiguredSecret(OPENAI_API_KEY, [
    "replace-with-openai-api-key",
    "your-openai-api-key",
    "placeholder",
  ]);
  const missingEnv = [];
  if (!configured) missingEnv.push("OPENAI_API_KEY");
  if (AI_JUDGE_FORCE_LOCAL) missingEnv.push("AI_JUDGE_FORCE_LOCAL=false");
  return {
    configured,
    model: OPENAI_JUDGE_MODEL,
    responsesUrlConfigured: isConfiguredUrl(OPENAI_RESPONSES_URL),
    timeoutMs: OPENAI_JUDGE_TIMEOUT_MS,
    forceLocal: AI_JUDGE_FORCE_LOCAL,
    missingEnv,
    productionReady: configured && !AI_JUDGE_FORCE_LOCAL,
  };
}

function isPendingAiJudgement(channel) {
  return channel?.aiJudgement?.status === "pending_review" && !channel?.finalResult;
}

function hasFinalDebateResult(channel) {
  return Boolean(channel?.finalResult && channel?.aiJudgement && !isPendingAiJudgement(channel));
}

function pendingAiReviewJudgement(reasonCode, attemptedAt) {
  return {
    status: "pending_review",
    source: "openai",
    decidedAt: attemptedAt,
    failureCode: reasonCode,
    reasoning: "AI 판정이 자동 확정되지 않아 운영자 재판정 대기 상태로 전환되었습니다.",
  };
}

async function judgeWithOpenAI(channel) {
  if (!getAiJudgeStatus().configured) throw new Error("OpenAI judge is not configured");
  const compactChannel = {
    title: channel.title,
    participantIds: channel.participantIds,
    participantSnapshots: channel.participantSnapshots,
    stanceByUser: channel.stanceByUser,
    debateMessages: channel.debateMessages.map((message) => ({
      authorId: message.authorId,
      phase: message.phase,
      body: message.body,
    })),
    votes: channel.votes.map((vote) => ({ targetUserId: vote.targetUserId })),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_JUDGE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_JUDGE_MODEL,
        input: [
          {
            role: "system",
            content:
              "You are a strict but fair Korean debate judge. Return only valid JSON. Judge debate quality, not popularity. Penalize personal attacks.",
          },
          {
            role: "user",
            content: `다음 토론을 판정하세요. 참가자 ID를 유지하고 JSON만 반환하세요. schema: {"winnerId":"id","reasoning":"Korean short explanation","categoryScores":{"id":{"logic":number,"evidence":number,"rebuttal":number,"relevance":number,"conduct":number,"total":number}}}\n\n${JSON.stringify(compactChannel)}`,
          },
        ],
        temperature: 0.2,
        max_output_tokens: 900,
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI judge failed: ${response.status} ${text.slice(0, 160)}`);
  }
  const data = await response.json();
  const text = extractResponseText(data);
  return JSON.parse(text);
}

function storagePayload() {
  const normalizedActive = Boolean(supabase) && SUPABASE_STORAGE_MODE === "normalized";
  return {
    storage: supabase ? "supabase" : "file",
    storageMode: supabase ? SUPABASE_STORAGE_MODE : "file",
    requestedStorageMode: SUPABASE_STORAGE_MODE,
    table: normalizedActive ? `${SUPABASE_TABLE_PREFIX}*` : supabase ? SUPABASE_TABLE : null,
    tablePrefix: SUPABASE_TABLE_PREFIX,
    supabaseConfigured: Boolean(supabase),
    normalized: normalizedActive,
    normalizedRequested: SUPABASE_ENV_STATUS.normalizedRequested,
    missingEnv: SUPABASE_ENV_STATUS.missing,
    productionReady: Boolean(supabase && normalizedActive && SUPABASE_ENV_STATUS.productionReady),
  };
}

function rateLimitPayload() {
  return {
    authWindowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
    writeWindowSeconds: RATE_LIMIT_WRITE_WINDOW_SECONDS,
    loginMax: RATE_LIMIT_LOGIN_MAX,
    signupMax: RATE_LIMIT_SIGNUP_MAX,
    socialMax: RATE_LIMIT_SOCIAL_MAX,
    demoMax: RATE_LIMIT_DEMO_MAX,
    phoneRequestMax: RATE_LIMIT_PHONE_REQUEST_MAX,
    phoneVerifyMax: RATE_LIMIT_PHONE_VERIFY_MAX,
    passwordMax: RATE_LIMIT_PASSWORD_MAX,
    messageMax: RATE_LIMIT_MESSAGE_MAX,
    reportMax: RATE_LIMIT_REPORT_MAX,
    phoneCodeTtlSeconds: PHONE_CODE_TTL_SECONDS,
    phoneCodeResendSeconds: PHONE_CODE_RESEND_SECONDS,
    phoneCodeMaxAttempts: PHONE_CODE_MAX_ATTEMPTS,
    activeBuckets: rateLimitBuckets.size,
  };
}

function processLifecyclePayload() {
  return {
    pid: process.pid,
    startedAt: PROCESS_STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    shuttingDown,
    shutdownStartedAt,
    shutdownGraceMs: SHUTDOWN_GRACE_MS,
  };
}

function releaseIdentityPayload() {
  const missing = [];
  if (!RELEASE_VERSION) missing.push("RELEASE_VERSION");
  if (!RELEASE_COMMIT) missing.push("RENDER_GIT_COMMIT or RELEASE_COMMIT");
  if (!RELEASE_BUILD_TIME) missing.push("RELEASE_BUILD_TIME");
  const configured = missing.length === 0 && STALE_RELEASE_ENV_KEYS.length === 0;
  return {
    version: RELEASE_VERSION || APP_VERSION,
    versionSource: RELEASE_VERSION_SOURCE || "app-default",
    commit: RELEASE_COMMIT || null,
    commitShort: RELEASE_COMMIT ? RELEASE_COMMIT.slice(0, 12) : null,
    commitSource: RELEASE_COMMIT_SOURCE,
    channel: RELEASE_CHANNEL,
    channelSource: RELEASE_CHANNEL_SOURCE,
    buildTime: RELEASE_BUILD_TIME,
    buildTimeSource: RELEASE_BUILD_TIME_SOURCE,
    configured,
    missing,
    staleEnv: STALE_RELEASE_ENV_KEYS,
  };
}

function providerDiagnosticsPayload() {
  const storage = storagePayload();
  const smsStatus = getSmsProviderStatus();
  const aiStatus = getAiJudgeStatus();
  const oauthServerConfigured = Boolean(storage.supabaseConfigured);
  const oauthClientConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  return {
    sms: {
      provider: smsStatus.provider,
      supportedProvider: smsStatus.supportedProvider,
      configured: smsStatus.configured,
      realProvider: smsStatus.realProvider,
      solapiConfigured: smsStatus.solapiConfigured,
      senderConfigured: smsStatus.solapiSenderConfigured,
      debugCodeExposed: smsStatus.debugCodeExposed,
      missingEnv: smsStatus.missingEnv,
      productionReady: smsStatus.productionReady,
    },
    oauth: {
      serverConfigured: oauthServerConfigured,
      clientConfigured: oauthClientConfigured,
      anonKeyPresent: Boolean(SUPABASE_ANON_KEY),
      productionReady: oauthServerConfigured && oauthClientConfigured,
    },
    ai: {
      configured: aiStatus.configured,
      model: aiStatus.model,
      timeoutMs: aiStatus.timeoutMs,
      forceLocal: aiStatus.forceLocal,
      missingEnv: aiStatus.missingEnv,
      productionReady: aiStatus.productionReady,
    },
    storage: {
      storage: storage.storage,
      storageMode: storage.storageMode,
      requestedStorageMode: storage.requestedStorageMode,
      supabaseConfigured: storage.supabaseConfigured,
      normalized: storage.normalized,
      normalizedRequested: storage.normalizedRequested,
      missingEnv: storage.missingEnv,
      productionReady: storage.productionReady,
    },
  };
}

function runtimePayload() {
  const staticAppAvailable = existsSync(path.join(DIST_DIR, "index.html"));
  return {
    production: IS_PRODUCTION_RUNTIME,
    nodeEnv: process.env.NODE_ENV ?? "development",
    demoAuthEnabled: DEMO_AUTH_ENABLED,
    openStateWriteEnabled: OPEN_STATE_WRITE_ENABLED,
    phoneDebugCodeExposed: EXPOSE_PHONE_DEBUG_CODE,
    aiJudgeForceLocal: AI_JUDGE_FORCE_LOCAL,
    staticAppEnabled: SERVE_STATIC_APP,
    staticAppAvailable,
    permissionsPolicy: PERMISSIONS_POLICY,
    apiHost: API_HOST,
    allowedOrigins,
    adminAccess: {
      explicitAllowlistConfigured: PLATFORM_ADMIN_ALLOWLIST_CONFIGURED,
      allowedUserIds: PLATFORM_ADMIN_USER_IDS.size,
      allowedLoginIds: PLATFORM_ADMIN_LOGIN_IDS.size,
      productionReady: !IS_PRODUCTION_RUNTIME || PLATFORM_ADMIN_ALLOWLIST_CONFIGURED,
    },
    release: releaseIdentityPayload(),
    rateLimits: rateLimitPayload(),
    process: processLifecyclePayload(),
    providerDiagnostics: providerDiagnosticsPayload(),
  };
}

function publicServiceStatusPayload(payload) {
  const storage = storagePayload();
  const notice = normalizeServiceNotice(payload?.state?.serviceNotice);
  const status = shuttingDown
    ? "maintenance"
    : notice?.tone === "critical"
      ? "maintenance"
      : notice?.tone === "warning"
        ? "degraded"
        : "operational";
  const labels = {
    operational: "정상 운영",
    degraded: "주의 필요",
    maintenance: "점검/중요 공지",
  };
  const runtime = runtimePayload();
  return {
    ok: !shuttingDown,
    service: "nosu-best-api",
    status,
    label: labels[status],
    checkedAt: new Date().toISOString(),
    notice,
    realtime: {
      enabled: true,
      clients: io.engine.clientsCount,
    },
    storage: {
      storage: storage.storage,
      storageMode: storage.storageMode,
      supabaseConfigured: storage.supabaseConfigured,
      normalized: storage.normalized,
    },
    runtime: {
      production: runtime.production,
      staticAppEnabled: runtime.staticAppEnabled,
      staticAppAvailable: runtime.staticAppAvailable,
      release: runtime.release,
      process: {
        startedAt: runtime.process.startedAt,
        uptimeSeconds: runtime.process.uptimeSeconds,
        shuttingDown: runtime.process.shuttingDown,
        shutdownStartedAt: runtime.process.shutdownStartedAt,
        shutdownGraceMs: runtime.process.shutdownGraceMs,
      },
    },
  };
}

function coerceSettingNumber(value, fallback, limits, { integer = true, errors = [], field = "" } = {}) {
  const raw = value ?? fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < limits.min || parsed > limits.max) {
    if (field) errors.push(field);
    return fallback;
  }
  return integer ? Math.round(parsed) : Number(parsed.toFixed(2));
}

function normalizePlatformSettings(settings, { collectErrors = false } = {}) {
  const errors = [];
  const source = settings && typeof settings === "object" ? settings : {};
  const debate = source.debate && typeof source.debate === "object" ? source.debate : {};
  const moderation = source.moderation && typeof source.moderation === "object" ? source.moderation : {};
  const normalized = {
    debate: {
      openingSeconds: coerceSettingNumber(debate.openingSeconds, DEFAULT_PLATFORM_SETTINGS.debate.openingSeconds, PLATFORM_SETTING_LIMITS.openingSeconds, { errors, field: "debate.openingSeconds" }),
      closingSeconds: coerceSettingNumber(debate.closingSeconds, DEFAULT_PLATFORM_SETTINGS.debate.closingSeconds, PLATFORM_SETTING_LIMITS.closingSeconds, { errors, field: "debate.closingSeconds" }),
      crossfireSeconds: coerceSettingNumber(debate.crossfireSeconds, DEFAULT_PLATFORM_SETTINGS.debate.crossfireSeconds, PLATFORM_SETTING_LIMITS.crossfireSeconds, { errors, field: "debate.crossfireSeconds" }),
      maxOpeningChars: coerceSettingNumber(debate.maxOpeningChars, DEFAULT_PLATFORM_SETTINGS.debate.maxOpeningChars, PLATFORM_SETTING_LIMITS.maxOpeningChars, { errors, field: "debate.maxOpeningChars" }),
      maxDebateChars: coerceSettingNumber(debate.maxDebateChars, DEFAULT_PLATFORM_SETTINGS.debate.maxDebateChars, PLATFORM_SETTING_LIMITS.maxDebateChars, { errors, field: "debate.maxDebateChars" }),
      maxReportReasonChars: coerceSettingNumber(debate.maxReportReasonChars, DEFAULT_PLATFORM_SETTINGS.debate.maxReportReasonChars, PLATFORM_SETTING_LIMITS.maxReportReasonChars, { errors, field: "debate.maxReportReasonChars" }),
      defaultCoinStake: coerceSettingNumber(debate.defaultCoinStake, DEFAULT_PLATFORM_SETTINGS.debate.defaultCoinStake, PLATFORM_SETTING_LIMITS.defaultCoinStake, { errors, field: "debate.defaultCoinStake" }),
      minWinnerRewardCoins: coerceSettingNumber(debate.minWinnerRewardCoins, DEFAULT_PLATFORM_SETTINGS.debate.minWinnerRewardCoins, PLATFORM_SETTING_LIMITS.minWinnerRewardCoins, { errors, field: "debate.minWinnerRewardCoins" }),
      winnerRewardRate: coerceSettingNumber(debate.winnerRewardRate, DEFAULT_PLATFORM_SETTINGS.debate.winnerRewardRate, PLATFORM_SETTING_LIMITS.winnerRewardRate, { integer: false, errors, field: "debate.winnerRewardRate" }),
    },
    moderation: {
      reportReviewThreshold: coerceSettingNumber(moderation.reportReviewThreshold, DEFAULT_PLATFORM_SETTINGS.moderation.reportReviewThreshold, PLATFORM_SETTING_LIMITS.reportReviewThreshold, { errors, field: "moderation.reportReviewThreshold" }),
      suspensionDefaultHours: coerceSettingNumber(moderation.suspensionDefaultHours, DEFAULT_PLATFORM_SETTINGS.moderation.suspensionDefaultHours, PLATFORM_SETTING_LIMITS.suspensionDefaultHours, { errors, field: "moderation.suspensionDefaultHours" }),
    },
  };
  return collectErrors ? { settings: normalized, errors } : normalized;
}

function platformSettingsForState(state) {
  return normalizePlatformSettings(state?.platformSettings);
}

function validatePlatformSettingsInput(settings) {
  const result = normalizePlatformSettings(settings, { collectErrors: true });
  if (result.errors.length > 0) {
    return { ok: false, error: "invalid_platform_settings", fields: [...new Set(result.errors)] };
  }
  return { ok: true, settings: result.settings };
}

function defaultStats(stats) {
  return {
    wins: Number(stats?.wins ?? 0),
    losses: Number(stats?.losses ?? 0),
    aiRating: Number(stats?.aiRating ?? 50),
    voteTrust: Number(stats?.voteTrust ?? 50),
  };
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function debatePhaseFromStatus(status) {
  if (status === "waiting") return "ready";
  if (status === "voting") return "voting";
  if (status === "finished") return "finished";
  return "crossfire";
}

function normalizeStoredUser(user) {
  const hasAgreementState = Boolean(user && Object.prototype.hasOwnProperty.call(user, "agreements"));
  return {
    ...user,
    ownedItemIds: jsonArray(user?.ownedItemIds),
    claims: jsonArray(user?.claims),
    stats: user?.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
    agreements: normalizeAgreementState(user?.agreements, { fallbackAccepted: !hasAgreementState }),
  };
}

function normalizeStoredSanction(sanction) {
  const expiresAt = Number(sanction?.expiresAt);
  return {
    ...sanction,
    id: String(sanction?.id ?? uid("sanction")),
    userId: String(sanction?.userId ?? ""),
    actorId: String(sanction?.actorId ?? ""),
    type: sanction?.type === "suspension" ? "suspension" : "warning",
    reason: String(sanction?.reason ?? "운영 제재").trim().slice(0, 500),
    createdAt: String(sanction?.createdAt ?? nowLabel()),
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined,
    revokedAt: sanction?.revokedAt ? String(sanction.revokedAt) : undefined,
    revokedBy: sanction?.revokedBy ? String(sanction.revokedBy) : undefined,
    revokedReason: sanction?.revokedReason ? String(sanction.revokedReason).trim().slice(0, 200) : undefined,
  };
}

function normalizeStoredChannel(channel) {
  const participantIds = jsonArray(channel?.participantIds);
  const disabledInviteCodes = jsonArray(channel?.disabledInviteCodes)
    .map((code) => String(code).trim().toUpperCase())
    .filter(Boolean);
  const phase = channel?.phase ?? debatePhaseFromStatus(channel?.status);
  const stanceByUser = Object.fromEntries(
    participantIds.map((participantId, index) => [
      participantId,
      channel?.stanceByUser?.[participantId] ?? (index === 0 ? "agree" : "disagree"),
    ]),
  );
  const remainingSecondsByUser = Object.fromEntries(
    participantIds.map((participantId) => [
      participantId,
      channel?.remainingSecondsByUser?.[participantId] ?? CROSSFIRE_SECONDS,
    ]),
  );
  const voiceStateByUser = Object.fromEntries(
    participantIds.map((participantId) => [
      participantId,
      normalizeVoiceState(channel?.voiceStateByUser?.[participantId]),
    ]),
  );
  return {
    ...channel,
    phase,
    participantIds,
    readyUserIds: jsonArray(channel?.readyUserIds).filter((userId) => participantIds.includes(userId)),
    spectatorIds: jsonArray(channel?.spectatorIds),
    debateMessages: jsonArray(channel?.debateMessages),
    spectatorMessages: jsonArray(channel?.spectatorMessages),
    votes: jsonArray(channel?.votes),
    reactions: jsonArray(channel?.reactions),
    disabledInviteCodes,
    participantSnapshots: channel?.participantSnapshots ?? {},
    stanceByUser,
    remainingSecondsByUser,
    voiceStateByUser,
  };
}

function normalizeServiceNotice(notice) {
  if (!notice || typeof notice !== "object" || notice.active === false) return null;
  const title = String(notice.title ?? "").trim().slice(0, 80);
  const body = String(notice.body ?? "").trim().slice(0, 220);
  if (!title || !body) return null;
  const rawTone = String(notice.tone ?? "info").trim();
  const updatedAt = String(notice.updatedAt ?? "").trim();
  const expiresAt = normalizeServiceNoticeExpiresAt(notice.expiresAt);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;
  return {
    id: String(notice.id ?? "service_notice").slice(0, 80),
    title,
    body,
    tone: SERVICE_NOTICE_TONES.has(rawTone) ? rawTone : "info",
    active: true,
    updatedAt: updatedAt && !Number.isNaN(new Date(updatedAt).getTime()) ? updatedAt : new Date().toISOString(),
    updatedBy: String(notice.updatedBy ?? "").slice(0, 80),
    expiresAt,
  };
}

function normalizeServiceNoticeExpiresAt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeStoredState(state) {
  if (!state) return state;
  return {
    ...state,
    users: jsonArray(state.users).map(normalizeStoredUser),
    rooms: jsonArray(state.rooms),
    channels: jsonArray(state.channels).map(normalizeStoredChannel),
    ledger: jsonArray(state.ledger),
    reports: jsonArray(state.reports).map(normalizeStoredReport),
    sanctions: jsonArray(state.sanctions).map(normalizeStoredSanction),
    notifications: jsonArray(state.notifications),
    auditLogs: jsonArray(state.auditLogs),
    aiAppeals: jsonArray(state.aiAppeals).map(normalizeAiAppeal),
    privacyRequests: jsonArray(state.privacyRequests).map(normalizePrivacyRequest),
    serviceNotice: normalizeServiceNotice(state.serviceNotice),
    platformSettings: platformSettingsForState(state),
    currentUserId: state.currentUserId ?? null,
  };
}

function normalizePrivacyRequestStatus(status, fallback = "pending") {
  const value = String(status ?? "").trim();
  return ["pending", "reviewing", "resolved", "dismissed"].includes(value) ? value : fallback;
}

function normalizePrivacyRequest(request = {}) {
  return {
    id: String(request.id ?? uid("privacy")),
    userId: String(request.userId ?? ""),
    userName: String(request.userName ?? "").trim().slice(0, 80),
    reason: String(request.reason ?? "").trim().slice(0, 500),
    status: normalizePrivacyRequestStatus(request.status),
    createdAt: String(request.createdAt ?? nowLabel()),
    ...(request.reviewedAt ? { reviewedAt: String(request.reviewedAt) } : {}),
    ...(request.reviewerId ? { reviewerId: String(request.reviewerId) } : {}),
    ...(request.reviewerName ? { reviewerName: String(request.reviewerName).slice(0, 80) } : {}),
    ...(request.reviewMemo ? { reviewMemo: String(request.reviewMemo).trim().slice(0, 500) } : {}),
  };
}

function normalizeReportStatus(status, fallback = "open") {
  const value = String(status ?? "").trim();
  if (value === "reviewed") return "resolved";
  return Object.prototype.hasOwnProperty.call(reportStatusLabels, value) ? value : fallback;
}

function sanitizeReportMemo(value) {
  return String(value ?? "").trim().slice(0, 500);
}

function normalizeStoredReport(report) {
  return {
    ...report,
    id: String(report?.id ?? uid("report")),
    reporterId: String(report?.reporterId ?? ""),
    targetType: String(report?.targetType ?? "channel"),
    targetId: String(report?.targetId ?? ""),
    channelId: report?.channelId ? String(report.channelId) : undefined,
    reason: String(report?.reason ?? "신고 사유 미입력").trim().slice(0, 500),
    status: normalizeReportStatus(report?.status),
    createdAt: String(report?.createdAt ?? nowLabel()),
    resolvedAt: report?.resolvedAt ? String(report.resolvedAt) : undefined,
    resolvedBy: report?.resolvedBy ? String(report.resolvedBy) : undefined,
    assigneeId: report?.assigneeId ? String(report.assigneeId) : undefined,
    assigneeName: report?.assigneeName ? String(report.assigneeName) : undefined,
    assignedAt: report?.assignedAt ? String(report.assignedAt) : undefined,
    reviewMemo: sanitizeReportMemo(report?.reviewMemo),
    statusHistory: jsonArray(report?.statusHistory)
      .map((item) => ({
        status: normalizeReportStatus(item?.status),
        actorId: String(item?.actorId ?? ""),
        actorName: String(item?.actorName ?? ""),
        memo: sanitizeReportMemo(item?.memo),
        createdAt: String(item?.createdAt ?? nowLabel()),
      }))
      .slice(0, 20),
  };
}

function normalizeAiAppeal(appeal) {
  const status = ["pending", "reviewing", "resolved", "dismissed"].includes(appeal?.status)
    ? appeal.status
    : "pending";
  return {
    id: String(appeal?.id ?? uid("appeal")).slice(0, 80),
    channelId: String(appeal?.channelId ?? ""),
    userId: String(appeal?.userId ?? ""),
    userName: String(appeal?.userName ?? "").slice(0, 80),
    reason: String(appeal?.reason ?? "").trim().slice(0, 500),
    status,
    createdAt: String(appeal?.createdAt ?? nowLabel()).slice(0, 64),
    reviewedAt: appeal?.reviewedAt ? String(appeal.reviewedAt).slice(0, 64) : undefined,
    reviewerId: appeal?.reviewerId ? String(appeal.reviewerId).slice(0, 80) : undefined,
    reviewerName: appeal?.reviewerName ? String(appeal.reviewerName).slice(0, 80) : undefined,
    reviewMemo: appeal?.reviewMemo ? String(appeal.reviewMemo).trim().slice(0, 500) : undefined,
  };
}

function appendReportStatusHistory(report, status, actor, memo, createdAt) {
  return [
    {
      status,
      actorId: actor.id,
      actorName: actor.displayName,
      memo,
      createdAt,
    },
    ...jsonArray(report?.statusHistory),
  ].slice(0, 20);
}

function createNotification({
  userId,
  kind = "system",
  title,
  body,
  view,
  channelId,
  roomId,
}) {
  if (!userId || !title || !body) return null;
  return {
    id: uid("notice"),
    userId,
    kind,
    title: String(title).trim().slice(0, 80),
    body: String(body).trim().slice(0, 220),
    createdAt: nowLabel(),
    ...(view ? { view } : {}),
    ...(channelId ? { channelId } : {}),
    ...(roomId ? { roomId } : {}),
  };
}

function addNotifications(state, notifications) {
  const nextNotifications = notifications.filter(Boolean);
  return {
    ...state,
    notifications: [...nextNotifications, ...jsonArray(state.notifications)].slice(0, 300),
  };
}

function normalizeAuditMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [
        String(key).slice(0, 40),
        typeof value === "object" ? JSON.stringify(value).slice(0, 140) : String(value).slice(0, 140),
      ]),
  );
}

function createAuditLog(actor, { action, targetType = "system", targetId = "", summary, metadata = {} }) {
  if (!actor || !action || !summary) return null;
  return {
    id: uid("audit"),
    action: String(action).slice(0, 80),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    targetType: String(targetType).slice(0, 40),
    targetId: String(targetId ?? "").slice(0, 120),
    summary: String(summary).trim().slice(0, 220),
    metadata: normalizeAuditMetadata(metadata),
    createdAt: nowLabel(),
    createdAtIso: new Date().toISOString(),
  };
}

function addAuditLog(state, actor, audit) {
  const auditLog = createAuditLog(actor, audit);
  if (!auditLog) return state;
  return {
    ...state,
    auditLogs: [auditLog, ...jsonArray(state.auditLogs)].slice(0, MAX_AUDIT_LOGS),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeAuditExportFilters(source = {}) {
  return {
    query: String(source.q ?? source.query ?? "").trim().slice(0, 120),
    action: String(source.action ?? "").trim().slice(0, 80),
    targetType: String(source.targetType ?? "").trim().slice(0, 40),
    actor: String(source.actor ?? "").trim().slice(0, 80),
    date: String(source.date ?? "").trim().slice(0, 10),
  };
}

function auditFiltersActive(filters) {
  return Object.values(filters).some(Boolean);
}

function auditFilterSlug(filters) {
  const parts = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}-${String(value).replace(/[^\w가-힣-]+/g, "-").slice(0, 32)}`);
  return parts.length ? `filtered-${parts.join("-")}` : "all";
}

function auditLogMatchesFilters(log, filters) {
  if (filters.action && log.action !== filters.action) return false;
  if (filters.targetType && log.targetType !== filters.targetType) return false;
  if (filters.actor) {
    const actorNeedle = filters.actor.toLowerCase();
    const actorText = `${log.actorId} ${log.actorName} ${log.actorRole}`.toLowerCase();
    if (!actorText.includes(actorNeedle)) return false;
  }
  if (filters.date) {
    const isoDate = String(log.createdAtIso ?? "").slice(0, 10);
    const labelDate = String(log.createdAt ?? "");
    if (isoDate !== filters.date && !labelDate.includes(filters.date)) return false;
  }
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = [
      log.id,
      log.action,
      log.actorName,
      log.actorRole,
      log.targetType,
      log.targetId,
      log.summary,
      JSON.stringify(log.metadata ?? {}),
      log.createdAt,
      log.createdAtIso,
    ].join(" ").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildAuditExport(state, rawFilters = {}) {
  const exportedAt = new Date().toISOString();
  const datePart = exportedAt.slice(0, 10);
  const timePart = exportedAt.slice(11, 19).replaceAll(":", "");
  const filters = normalizeAuditExportFilters(rawFilters);
  const allAuditLogs = jsonArray(state.auditLogs).map((log) => ({
    id: String(log.id ?? ""),
    action: String(log.action ?? ""),
    actorId: String(log.actorId ?? ""),
    actorName: String(log.actorName ?? ""),
    actorRole: String(log.actorRole ?? ""),
    targetType: String(log.targetType ?? ""),
    targetId: String(log.targetId ?? ""),
    summary: String(log.summary ?? ""),
    metadata: normalizeAuditMetadata(log.metadata ?? {}),
    createdAt: String(log.createdAt ?? ""),
    createdAtIso: String(log.createdAtIso ?? ""),
  }));
  const auditLogs = allAuditLogs.filter((log) => auditLogMatchesFilters(log, filters));
  const headers = [
    "id",
    "createdAtIso",
    "createdAt",
    "action",
    "actorId",
    "actorName",
    "actorRole",
    "targetType",
    "targetId",
    "summary",
    "metadata",
  ];
  const rows = auditLogs.map((log) =>
    headers
      .map((key) => csvCell(key === "metadata" ? JSON.stringify(log.metadata) : log[key]))
      .join(","),
  );
  return {
    exportedAt,
    filename: `nosu-best-audit-${datePart}-${timePart}-${auditFilterSlug(filters)}.json`,
    csvFilename: `nosu-best-audit-${datePart}-${timePart}-${auditFilterSlug(filters)}.csv`,
    filters,
    filtered: auditFiltersActive(filters),
    totalCount: allAuditLogs.length,
    count: auditLogs.length,
    maxAuditLogs: MAX_AUDIT_LOGS,
    retention: {
      maxLogs: MAX_AUDIT_LOGS,
      currentLogs: allAuditLogs.length,
      percentUsed: Math.round((allAuditLogs.length / MAX_AUDIT_LOGS) * 100),
      nearLimit: allAuditLogs.length >= Math.floor(MAX_AUDIT_LOGS * 0.8),
      atLimit: allAuditLogs.length >= MAX_AUDIT_LOGS,
    },
    auditLogs,
    csv: [headers.join(","), ...rows].join("\n"),
  };
}

function notifyPlatformManagers(state, notification, excludeUserId = "") {
  const managerNotifications = state.users
    .filter((user) => canManagePlatform(user) && user.id !== excludeUserId)
    .map((user) => createNotification({ ...notification, userId: user.id, view: notification.view ?? "admin" }));
  return addNotifications(state, managerNotifications);
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const groupKey = row[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
    return groups;
  }, new Map());
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

async function selectNormalizedRows() {
  const [
    settings,
    users,
    userClaims,
    rooms,
    channels,
    channelParticipants,
    channelSpectators,
    debateMessages,
    spectatorMessages,
    votes,
    reactions,
    reports,
    coinLedger,
  ] = await Promise.all([
    supabase.from(normalizedTable("app_settings")).select("key, value"),
    supabase.from(normalizedTable("users")).select("*").order("id"),
    supabase.from(normalizedTable("user_claims")).select("*").order("id"),
    supabase.from(normalizedTable("rooms")).select("*").order("id"),
    supabase.from(normalizedTable("channels")).select("*").order("id"),
    supabase.from(normalizedTable("channel_participants")).select("*").order("channel_id").order("user_id"),
    supabase.from(normalizedTable("channel_spectators")).select("*").order("channel_id").order("user_id"),
    supabase.from(normalizedTable("debate_messages")).select("*").order("id"),
    supabase.from(normalizedTable("spectator_messages")).select("*").order("id"),
    supabase.from(normalizedTable("votes")).select("*").order("id"),
    supabase.from(normalizedTable("reactions")).select("*").order("id"),
    supabase.from(normalizedTable("reports")).select("*").order("id"),
    supabase.from(normalizedTable("coin_ledger")).select("*").order("id"),
  ]);

  const results = {
    settings,
    users,
    userClaims,
    rooms,
    channels,
    channelParticipants,
    channelSpectators,
    debateMessages,
    spectatorMessages,
    votes,
    reactions,
    reports,
    coinLedger,
  };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) {
      result.error.message = `Supabase normalized table "${name}" failed: ${result.error.message}`;
      throw result.error;
    }
  }
  return Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.data ?? []]));
}

async function readNormalizedState() {
  const rows = await selectNormalizedRows();
  if (!rows.users.length && !rows.rooms.length && !rows.channels.length) return null;

  const claimsByUser = groupBy(rows.userClaims, "user_id");
  const participantsByChannel = groupBy(rows.channelParticipants, "channel_id");
  const spectatorsByChannel = groupBy(rows.channelSpectators, "channel_id");
  const debateMessagesByChannel = groupBy(rows.debateMessages, "channel_id");
  const spectatorMessagesByChannel = groupBy(rows.spectatorMessages, "channel_id");
  const votesByChannel = groupBy(rows.votes, "channel_id");
  const reactionsByChannel = groupBy(rows.reactions, "channel_id");
  const settingsByKey = mapBy(rows.settings, "key");
  const currentUserId =
    settingsByKey.get("current_user_id")?.value?.id ??
    rows.users.find((user) => user.role === "admin")?.id ??
    rows.users[0]?.id ??
    null;
  const sanctionsSetting = settingsByKey.get("moderation_sanctions")?.value;
  const sanctions = jsonArray(sanctionsSetting?.items ?? sanctionsSetting);
  const notificationsSetting = settingsByKey.get("user_notifications")?.value;
  const notifications = jsonArray(notificationsSetting?.items ?? notificationsSetting);
  const auditLogsSetting = settingsByKey.get("audit_logs")?.value;
  const auditLogs = jsonArray(auditLogsSetting?.items ?? auditLogsSetting);
  const aiAppealsSetting = settingsByKey.get("ai_appeals")?.value;
  const aiAppeals = jsonArray(aiAppealsSetting?.items ?? aiAppealsSetting).map(normalizeAiAppeal);
  const privacyRequestsSetting = settingsByKey.get("privacy_requests")?.value;
  const privacyRequests = jsonArray(privacyRequestsSetting?.items ?? privacyRequestsSetting).map(normalizePrivacyRequest);
  const serviceNoticeSetting = settingsByKey.get("service_notice")?.value;
  const serviceNotice = normalizeServiceNotice(serviceNoticeSetting?.item ?? serviceNoticeSetting);
  const platformSettingsSetting = settingsByKey.get("platform_settings")?.value;
  const platformSettings = normalizePlatformSettings(platformSettingsSetting?.settings ?? platformSettingsSetting);

  const users = rows.users.map((user) => {
    const accountState = user.stats?.account ?? user.stats?.__account ?? {};
    return {
      id: user.id,
      loginId: user.login_id,
      password: "",
      passwordHash: user.password_hash ?? undefined,
      passwordSalt: user.password_salt ?? undefined,
      authProvider: user.auth_provider,
      phone: user.phone ?? "",
      phoneVerified: Boolean(user.phone_verified),
      displayName: user.display_name,
      title: user.title,
      bio: user.bio,
      photoUrl: user.photo_url ?? "",
      role: user.role,
      coins: Number(user.coins ?? 0),
      accentColor: user.accent_color ?? "blue",
      profileFrame: user.profile_frame ?? "clean",
      bannerStyle: user.banner_style ?? "plain",
      featuredBadge: user.featured_badge ?? "신규 토론러",
      ownedItemIds: jsonArray(user.owned_item_ids),
      claims: (claimsByUser.get(user.id) ?? []).map((claim) => ({
        id: claim.id,
        label: claim.label,
        value: claim.value,
        status: claim.status,
        submittedReason: claim.submitted_reason ?? claim.submittedReason ?? "",
        evidenceText: claim.evidence_text ?? claim.evidenceText ?? "",
        evidenceUrl: claim.evidence_url ?? claim.evidenceUrl ?? "",
        submittedAt: claim.submitted_at ?? claim.submittedAt ?? "",
        reviewerId: claim.reviewer_id ?? claim.reviewerId ?? "",
        reviewerName: claim.reviewer_name ?? claim.reviewerName ?? "",
        reviewedAt: claim.reviewed_at ?? claim.reviewedAt ?? "",
        reviewMemo: claim.review_memo ?? claim.reviewMemo ?? "",
      })),
      stats: defaultStats(user.stats),
      deactivatedAt: user.deactivated_at ?? accountState.deactivatedAt ?? undefined,
      deactivationReason: user.deactivation_reason ?? accountState.deactivationReason ?? undefined,
      agreements: normalizeAgreementState(user.agreements ?? accountState.agreements ?? user.stats?.agreements),
    };
  });

  const rooms = rows.rooms.map((room) => ({
    id: room.id,
    title: room.title,
    topic: room.topic,
    createdBy: room.created_by ?? "",
    createdAt: room.created_at_text,
  }));

  const channels = rows.channels.map((channel) => {
    const participants = participantsByChannel.get(channel.id) ?? [];
    const participantIds = participants.map((participant) => participant.user_id);
    return {
      id: channel.id,
      roomId: channel.room_id,
      title: channel.title,
      visibility: channel.visibility,
      inviteCode: channel.invite_code ?? undefined,
      format: channel.format,
      status: channel.status,
      phase: channel.phase,
      createdBy: channel.created_by ?? "",
      participantLimit: Number(channel.participant_limit ?? 2),
      participantIds,
      participantSnapshots: Object.fromEntries(
        participants.map((participant) => [participant.user_id, participant.snapshot ?? {}]),
      ),
      stanceByUser: Object.fromEntries(participants.map((participant) => [participant.user_id, participant.stance])),
      readyUserIds: participants
        .filter((participant) => Boolean(participant.snapshot?.ready))
        .map((participant) => participant.user_id),
      activeSpeakerId: channel.active_speaker_id ?? undefined,
      phaseStartedAt: channel.phase_started_at ?? undefined,
      phaseEndsAt: channel.phase_ends_at ?? undefined,
      turnStartedAt: channel.turn_started_at ?? undefined,
      remainingSecondsByUser: Object.fromEntries(
        participants.map((participant) => [participant.user_id, Number(participant.remaining_seconds ?? 300)]),
      ),
      voiceStateByUser: Object.fromEntries(
        participants.map((participant) => [
          participant.user_id,
          normalizeVoiceState(participant.snapshot?.voiceState),
        ]),
      ),
      spectatorIds: (spectatorsByChannel.get(channel.id) ?? []).map((spectator) => spectator.user_id),
      debateMessages: (debateMessagesByChannel.get(channel.id) ?? []).map((message) => ({
        id: message.id,
        authorId: message.author_id ?? "",
        body: message.body,
        phase: message.phase ?? undefined,
        createdAt: message.created_at_text,
      })),
      spectatorMessages: (spectatorMessagesByChannel.get(channel.id) ?? []).map((message) => ({
        id: message.id,
        authorId: message.author_id ?? "",
        body: message.body,
        createdAt: message.created_at_text,
      })),
      votes: (votesByChannel.get(channel.id) ?? []).map((vote) => ({
        id: vote.id,
        voterId: vote.voter_id ?? "",
        targetUserId: vote.target_user_id ?? "",
        createdAt: vote.created_at_text,
      })),
      reactions: (reactionsByChannel.get(channel.id) ?? []).map((reaction) => ({
        id: reaction.id,
        spectatorId: reaction.spectator_id ?? "",
        targetUserId: reaction.target_user_id ?? "",
        createdAt: reaction.created_at_text,
      })),
      coinStake: Number(channel.coin_stake ?? 0),
      aiJudgement: channel.ai_judgement ?? undefined,
      finalResult: channel.final_result ?? undefined,
      createdAt: channel.created_at_text,
    };
  });

  return {
    users,
    rooms,
    channels,
    reports: rows.reports.map((report) => ({
      id: report.id,
      reporterId: report.reporter_id ?? "",
      targetType: report.target_type,
      targetId: report.target_id,
      channelId: report.channel_id ?? undefined,
      reason: report.reason,
      status: report.status,
      createdAt: report.created_at_text,
      resolvedAt: report.resolved_at_text ?? undefined,
      resolvedBy: report.resolved_by ?? undefined,
    })),
    sanctions,
    notifications,
    auditLogs,
    aiAppeals,
    privacyRequests,
    serviceNotice,
    platformSettings,
    ledger: rows.coinLedger.map((item) => ({
      id: item.id,
      type: item.type,
      userId: item.user_id ?? "",
      amount: Number(item.amount ?? 0),
      memo: item.memo,
      createdAt: item.created_at_text,
    })),
    currentUserId,
  };
}

async function writeNormalizedState(state) {
  const savedAt = new Date().toISOString();
  const rows = buildNormalizedRows(state, { includeSecrets: true });
  await deleteNormalizedRows();
  await insertNormalizedRows(rows);
  const { error } = await supabase.from(normalizedTable("app_settings")).upsert([
    {
      key: "current_user_id",
      value: { id: state.currentUserId },
      updated_at: savedAt,
    },
    {
      key: "moderation_sanctions",
      value: { items: state.sanctions ?? [] },
      updated_at: savedAt,
    },
    {
      key: "user_notifications",
      value: { items: state.notifications ?? [] },
      updated_at: savedAt,
    },
    {
      key: "audit_logs",
      value: { items: state.auditLogs ?? [] },
      updated_at: savedAt,
    },
    {
      key: "ai_appeals",
      value: { items: state.aiAppeals ?? [] },
      updated_at: savedAt,
    },
    {
      key: "privacy_requests",
      value: { items: state.privacyRequests ?? [] },
      updated_at: savedAt,
    },
    {
      key: "service_notice",
      value: { item: state.serviceNotice ?? null },
      updated_at: savedAt,
    },
    {
      key: "platform_settings",
      value: { settings: platformSettingsForState(state) },
      updated_at: savedAt,
    },
  ]);
  if (error) throw error;
  return savedAt;
}

async function readState() {
  if (usesNormalizedSupabase) {
    const state = await readNormalizedState();
    if (!state) return null;
    return { state: normalizeStoredState(state), savedAt: null, storage: "supabase", storageMode: "normalized" };
  }

  if (supabase) {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("state, updated_at")
      .eq("id", STATE_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { state: normalizeStoredState(data.state), savedAt: data.updated_at, storage: "supabase" };
  }

  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const payload = JSON.parse(raw);
    return { ...payload, state: normalizeStoredState(payload.state), storage: "file" };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeState(state) {
  const normalizedState = normalizeStoredState(state);
  if (usesNormalizedSupabase) {
    return writeNormalizedState(normalizedState);
  }

  if (supabase) {
    const savedAt = new Date().toISOString();
    const { error } = await supabase.from(SUPABASE_TABLE).upsert({
      id: STATE_ID,
      state: normalizedState,
      updated_at: savedAt,
    });
    if (error) throw error;
    return savedAt;
  }

  const savedAt = new Date().toISOString();
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    STATE_FILE,
    JSON.stringify({ state: normalizedState, savedAt }, null, 2),
    "utf8",
  );
  return savedAt;
}

async function writeStateAndBroadcast(state, reason) {
  const normalizedState = normalizeStoredState(state);
  const savedAt = await writeState(normalizedState);
  const safeState = sanitizeState(normalizedState);
  io.emit("state-updated", {
    state: safeState,
    savedAt,
    reason,
    ...storagePayload(),
  });
  return { savedAt, state: safeState };
}

function looksLikeAppState(value) {
  return (
    value &&
    Array.isArray(value.users) &&
    Array.isArray(value.rooms) &&
    Array.isArray(value.channels) &&
    Array.isArray(value.ledger) &&
    Object.prototype.hasOwnProperty.call(value, "currentUserId")
  );
}

function buildNormalizedRows(state, { includeSecrets = false } = {}) {
  const users = state.users.map((user) => {
    const generatedSecret =
      includeSecrets && !user.passwordHash && !user.passwordSalt && user.password
        ? hashPassword(user.password)
        : null;
    const accountState = {
      ...(user.deactivatedAt || user.deactivationReason
        ? { deactivatedAt: user.deactivatedAt ?? "", deactivationReason: user.deactivationReason ?? "" }
        : {}),
      agreements: normalizeAgreementState(user.agreements),
    };
    return {
      id: user.id,
      login_id: user.loginId,
      password_hash: includeSecrets ? (user.passwordHash ?? generatedSecret?.passwordHash ?? null) : null,
      password_salt: includeSecrets ? (user.passwordSalt ?? generatedSecret?.passwordSalt ?? null) : null,
      auth_provider: user.authProvider,
      phone: user.phone,
      phone_verified: Boolean(user.phoneVerified),
      display_name: user.displayName,
      title: user.title,
      bio: user.bio,
      photo_url: user.photoUrl,
      role: user.role,
      coins: user.coins,
      accent_color: user.accentColor,
      profile_frame: user.profileFrame,
      banner_style: user.bannerStyle,
      featured_badge: user.featuredBadge,
      owned_item_ids: user.ownedItemIds ?? [],
      stats: {
        ...(user.stats ?? {}),
        account: accountState,
      },
    };
  });

  const user_claims = state.users.flatMap((user) =>
    (user.claims ?? []).map((claim) => ({
      id: claim.id,
      user_id: user.id,
      label: claim.label,
      value: claim.value,
      status: claim.status,
    })),
  );

  const rooms = state.rooms.map((room) => ({
    id: room.id,
    title: room.title,
    topic: room.topic,
    created_by: room.createdBy,
    created_at_text: room.createdAt,
  }));

  const channels = state.channels.map((channel) => ({
    id: channel.id,
    room_id: channel.roomId,
    title: channel.title,
    visibility: channel.visibility,
    invite_code: channel.inviteCode ?? null,
    format: channel.format,
    status: channel.status,
    phase: channel.phase,
    created_by: channel.createdBy,
    participant_limit: channel.participantLimit,
    active_speaker_id: channel.activeSpeakerId ?? null,
    phase_started_at: channel.phaseStartedAt ?? null,
    phase_ends_at: channel.phaseEndsAt ?? null,
    turn_started_at: channel.turnStartedAt ?? null,
    coin_stake: channel.coinStake,
    ai_judgement: channel.aiJudgement ?? null,
    final_result: channel.finalResult ?? null,
    created_at_text: channel.createdAt,
  }));

  const channel_participants = state.channels.flatMap((channel) =>
    channel.participantIds.map((userId) => ({
      channel_id: channel.id,
      user_id: userId,
      stance: channel.stanceByUser?.[userId] ?? "agree",
      remaining_seconds: channel.remainingSecondsByUser?.[userId] ?? 300,
      snapshot: {
        ...(channel.participantSnapshots?.[userId] ?? {}),
        ready: (channel.readyUserIds ?? []).includes(userId),
        voiceState: normalizeVoiceState(channel.voiceStateByUser?.[userId]),
      },
    })),
  );

  const channel_spectators = state.channels.flatMap((channel) =>
    channel.spectatorIds.map((userId) => ({
      channel_id: channel.id,
      user_id: userId,
    })),
  );

  const debate_messages = state.channels.flatMap((channel) =>
    channel.debateMessages.map((message) => ({
      id: message.id,
      channel_id: channel.id,
      author_id: message.authorId,
      phase: message.phase ?? null,
      body: message.body,
      created_at_text: message.createdAt,
    })),
  );

  const spectator_messages = state.channels.flatMap((channel) =>
    channel.spectatorMessages.map((message) => ({
      id: message.id,
      channel_id: channel.id,
      author_id: message.authorId,
      body: message.body,
      created_at_text: message.createdAt,
    })),
  );

  const votes = state.channels.flatMap((channel) =>
    channel.votes.map((vote) => ({
      id: vote.id,
      channel_id: channel.id,
      voter_id: vote.voterId,
      target_user_id: vote.targetUserId,
      created_at_text: vote.createdAt,
    })),
  );

  const reactions = state.channels.flatMap((channel) =>
    (channel.reactions ?? []).map((reaction) => ({
      id: reaction.id,
      channel_id: channel.id,
      spectator_id: reaction.spectatorId,
      target_user_id: reaction.targetUserId,
      created_at_text: reaction.createdAt,
    })),
  );

  const reports = (state.reports ?? []).map((report) => ({
    id: report.id,
    reporter_id: report.reporterId,
    target_type: report.targetType,
    target_id: report.targetId,
    channel_id: report.channelId ?? null,
    reason: report.reason,
    status: report.status,
    created_at_text: report.createdAt,
    resolved_at_text: report.resolvedAt ?? null,
    resolved_by: report.resolvedBy ?? null,
  }));

  const coin_ledger = state.ledger.map((item) => ({
    id: item.id,
    type: item.type,
    user_id: item.userId,
    amount: item.amount,
    memo: item.memo,
    created_at_text: item.createdAt,
  }));

  return {
    users,
    user_claims,
    rooms,
    channels,
    channel_participants,
    channel_spectators,
    debate_messages,
    spectator_messages,
    votes,
    reactions,
    reports,
    coin_ledger,
  };
}

function rowCounts(rowsByTable) {
  return Object.fromEntries(
    Object.entries(rowsByTable).map(([table, rows]) => [table, rows.length]),
  );
}

function expectedNormalizedCounts(state) {
  return {
    app_settings: NORMALIZED_APP_SETTING_KEYS.length,
    ...rowCounts(buildNormalizedRows(state, { includeSecrets: false })),
  };
}

function buildNormalizedIntegrityWarnings(state) {
  if (!state) return [];
  const rows = buildNormalizedRows(state, { includeSecrets: false });
  const warnings = [];
  const ids = {
    users: new Set(rows.users.map((row) => row.id)),
    rooms: new Set(rows.rooms.map((row) => row.id)),
    channels: new Set(rows.channels.map((row) => row.id)),
    debate_messages: new Set(rows.debate_messages.map((row) => row.id)),
    spectator_messages: new Set(rows.spectator_messages.map((row) => row.id)),
  };
  const warnMissing = (table, rowId, column, value, referencedTable) => {
    if (!value) return;
    if (ids[referencedTable]?.has(value)) return;
    warnings.push({
      type: "missing_reference",
      table,
      rowId,
      column,
      value,
      referencedTable,
      detail: `${table}.${column} references missing ${referencedTable} row "${value}".`,
    });
  };
  const warnDuplicate = (table, key, value) => {
    warnings.push({
      type: "duplicate_key",
      table,
      key,
      value,
      detail: `${table} has duplicate ${key} "${value}".`,
    });
  };
  const checkDuplicateKeys = (table, key, values) => {
    duplicateValues(values.filter(Boolean)).forEach((value) => warnDuplicate(table, key, value));
  };

  checkDuplicateKeys("users", "id", rows.users.map((row) => row.id));
  checkDuplicateKeys("rooms", "id", rows.rooms.map((row) => row.id));
  checkDuplicateKeys("channels", "id", rows.channels.map((row) => row.id));
  checkDuplicateKeys("channel_participants", "channel_id,user_id", rows.channel_participants.map((row) => `${row.channel_id}:${row.user_id}`));
  checkDuplicateKeys("channel_spectators", "channel_id,user_id", rows.channel_spectators.map((row) => `${row.channel_id}:${row.user_id}`));
  checkDuplicateKeys("votes", "channel_id,voter_id", rows.votes.map((row) => (row.voter_id ? `${row.channel_id}:${row.voter_id}` : "")));

  rows.user_claims.forEach((row) => warnMissing("user_claims", row.id, "user_id", row.user_id, "users"));
  rows.rooms.forEach((row) => warnMissing("rooms", row.id, "created_by", row.created_by, "users"));
  rows.channels.forEach((row) => {
    warnMissing("channels", row.id, "room_id", row.room_id, "rooms");
    warnMissing("channels", row.id, "created_by", row.created_by, "users");
    warnMissing("channels", row.id, "active_speaker_id", row.active_speaker_id, "users");
  });
  rows.channel_participants.forEach((row) => {
    warnMissing("channel_participants", `${row.channel_id}:${row.user_id}`, "channel_id", row.channel_id, "channels");
    warnMissing("channel_participants", `${row.channel_id}:${row.user_id}`, "user_id", row.user_id, "users");
  });
  rows.channel_spectators.forEach((row) => {
    warnMissing("channel_spectators", `${row.channel_id}:${row.user_id}`, "channel_id", row.channel_id, "channels");
    warnMissing("channel_spectators", `${row.channel_id}:${row.user_id}`, "user_id", row.user_id, "users");
  });
  rows.debate_messages.forEach((row) => {
    warnMissing("debate_messages", row.id, "channel_id", row.channel_id, "channels");
    warnMissing("debate_messages", row.id, "author_id", row.author_id, "users");
  });
  rows.spectator_messages.forEach((row) => {
    warnMissing("spectator_messages", row.id, "channel_id", row.channel_id, "channels");
    warnMissing("spectator_messages", row.id, "author_id", row.author_id, "users");
  });
  rows.votes.forEach((row) => {
    warnMissing("votes", row.id, "channel_id", row.channel_id, "channels");
    warnMissing("votes", row.id, "voter_id", row.voter_id, "users");
    warnMissing("votes", row.id, "target_user_id", row.target_user_id, "users");
  });
  rows.reactions.forEach((row) => {
    warnMissing("reactions", row.id, "channel_id", row.channel_id, "channels");
    warnMissing("reactions", row.id, "spectator_id", row.spectator_id, "users");
    warnMissing("reactions", row.id, "target_user_id", row.target_user_id, "users");
  });
  rows.reports.forEach((row) => {
    warnMissing("reports", row.id, "reporter_id", row.reporter_id, "users");
    warnMissing("reports", row.id, "channel_id", row.channel_id, "channels");
    warnMissing("reports", row.id, "resolved_by", row.resolved_by, "users");
    if (row.target_type === "user") warnMissing("reports", row.id, "target_id", row.target_id, "users");
    if (row.target_type === "channel") warnMissing("reports", row.id, "target_id", row.target_id, "channels");
    if (row.target_type === "debate_message") warnMissing("reports", row.id, "target_id", row.target_id, "debate_messages");
    if (row.target_type === "spectator_message") warnMissing("reports", row.id, "target_id", row.target_id, "spectator_messages");
  });
  rows.coin_ledger.forEach((row) => warnMissing("coin_ledger", row.id, "user_id", row.user_id, "users"));

  return warnings.slice(0, 80);
}

function summarizeIntegrityWarnings(warnings) {
  return warnings.reduce((summary, warning) => {
    summary[warning.table] = (summary[warning.table] ?? 0) + 1;
    return summary;
  }, {});
}

async function countSupabaseRows(tableName) {
  if (!supabase) {
    return {
      table: tableName,
      ok: false,
      count: null,
      error: "supabase_not_configured",
    };
  }

  const { count, error } = await supabase
    .from(tableName)
    .select("*", { count: "exact", head: true });

  return {
    table: tableName,
    ok: !error,
    count: error ? null : count ?? 0,
    ...(error ? { error: error.message } : {}),
  };
}

async function normalizedRowCountsByKey() {
  const checks = await Promise.all(
    NORMALIZED_TABLE_NAMES.map(async (tableName) => {
      const check = await countSupabaseRows(normalizedTable(tableName));
      return [tableName, check.ok ? check.count ?? 0 : null];
    }),
  );
  return Object.fromEntries(checks);
}

function sumKnownCounts(counts) {
  return Object.values(counts).reduce((sum, count) => sum + (typeof count === "number" ? count : 0), 0);
}

function buildNormalizedSyncSummary(beforeCounts, expectedCounts) {
  const tables = NORMALIZED_TABLE_NAMES.map((tableName) => ({
    table: tableName,
    deletedRows: beforeCounts[tableName],
    insertedRows: expectedCounts[tableName] ?? 0,
    updatedRows: 0,
  }));
  return {
    strategy: "replace_all",
    deletedRows: sumKnownCounts(beforeCounts),
    insertedRows: sumKnownCounts(expectedCounts),
    updatedRows: 0,
    tables,
  };
}

function buildNormalizedStorageGate(normalizedTables) {
  const failedTables = normalizedTables.filter((table) => !table.ok);
  const schemaReady = normalizedTables.length === NORMALIZED_TABLE_NAMES.length && failedTables.length === 0;
  const envReady = SUPABASE_ENV_STATUS.productionReady && Boolean(supabase);
  const ready = envReady && usesNormalizedSupabase && schemaReady;
  const blockers = [];
  if (!envReady) blockers.push(...SUPABASE_ENV_STATUS.missing);
  if (envReady && !usesNormalizedSupabase) blockers.push("SUPABASE_STORAGE_MODE=normalized");
  if (envReady && !schemaReady) {
    blockers.push(
      ...failedTables.map((table) => `${table.table}: ${table.error || "not queryable"}`),
    );
  }
  return {
    status: ready ? "ready" : "blocked",
    ready,
    envReady,
    schemaReady,
    normalizedActive: usesNormalizedSupabase,
    requiredEnv: [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY",
      "SUPABASE_STORAGE_MODE=normalized",
    ],
    missingEnv: SUPABASE_ENV_STATUS.missing,
    checkedTables: normalizedTables.length,
    requiredTables: NORMALIZED_TABLE_NAMES.length,
    failedTables: failedTables.map((table) => ({
      key: table.key,
      table: table.table,
      error: table.error || "not queryable",
    })),
    blockers,
    nextAction: ready
      ? ""
      : "Set the missing Supabase env vars, run supabase/normalized-schema.sql in Supabase SQL Editor, then call GET /api/admin/storage-check before switching public traffic.",
  };
}

async function buildStorageCheck(payload) {
  const expectedCounts = payload?.state ? expectedNormalizedCounts(payload.state) : {};
  const expectedTotalRows = Object.values(expectedCounts).reduce((total, count) => total + count, 0);
  const integrityWarnings = payload?.state ? buildNormalizedIntegrityWarnings(payload.state) : [];
  const [snapshotTable, normalizedTables] = await Promise.all([
    supabase ? countSupabaseRows(SUPABASE_TABLE) : Promise.resolve(null),
    supabase
      ? Promise.all(
          NORMALIZED_TABLE_NAMES.map(async (tableName) => {
            const check = await countSupabaseRows(normalizedTable(tableName));
            return {
              key: tableName,
              expectedCount: expectedCounts[tableName] ?? 0,
              ...check,
            };
          }),
        )
      : Promise.resolve([]),
  ]);

  return {
    ok: true,
    ...storagePayload(),
    storage: payload?.storage ?? (supabase ? "supabase" : "file"),
    storageMode: payload?.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
    savedAt: payload?.savedAt ?? null,
    checkedAt: new Date().toISOString(),
    productionGate: buildNormalizedStorageGate(normalizedTables),
    expectedCounts,
    expectedTotalRows,
    integrityWarnings,
    integrityWarningCount: integrityWarnings.length,
    integritySummary: summarizeIntegrityWarnings(integrityWarnings),
    appState: payload?.state
      ? {
          users: payload.state.users.length,
          rooms: payload.state.rooms.length,
          channels: payload.state.channels.length,
          ledger: payload.state.ledger.length,
          reports: payload.state.reports?.length ?? 0,
          privacyRequests: payload.state.privacyRequests?.length ?? 0,
          auditLogs: payload.state.auditLogs?.length ?? 0,
          serviceNotice: payload.state.serviceNotice ? 1 : 0,
        }
      : null,
    snapshotTable,
    tables: normalizedTables,
  };
}

async function deleteNormalizedRows() {
  const deletePlan = [
    ["app_settings", "key"],
    ["coin_ledger", "id"],
    ["reports", "id"],
    ["reactions", "id"],
    ["votes", "id"],
    ["spectator_messages", "id"],
    ["debate_messages", "id"],
    ["channel_spectators", "channel_id"],
    ["channel_participants", "channel_id"],
    ["channels", "id"],
    ["rooms", "id"],
    ["user_claims", "id"],
    ["users", "id"],
  ];

  for (const [table, column] of deletePlan) {
    const { error } = await supabase.from(normalizedTable(table)).delete().neq(column, "__nosu_never__");
    if (error) throw error;
  }
}

async function insertNormalizedRows(rowsByTable) {
  const insertPlan = [
    "users",
    "user_claims",
    "rooms",
    "channels",
    "channel_participants",
    "channel_spectators",
    "debate_messages",
    "spectator_messages",
    "votes",
    "reactions",
    "reports",
    "coin_ledger",
  ];

  for (const table of insertPlan) {
    const rows = rowsByTable[table];
    if (!rows?.length) continue;
    const onConflict =
      table === "channel_participants" || table === "channel_spectators"
        ? "channel_id,user_id"
        : undefined;
    const { error } = onConflict
      ? await supabase.from(normalizedTable(table)).upsert(rows, { onConflict })
      : await supabase.from(normalizedTable(table)).upsert(rows);
    if (error) throw error;
  }
}

const readinessPhaseLabels = {
  data: "저장소",
  identity: "로그인/인증",
  trust: "판정/신뢰",
  safety: "운영 보안",
  deploy: "배포",
  voice: "음성 토론",
  realtime: "실시간",
};

const readinessLaunchMetadata = {
  process_lifecycle: { phase: "deploy", priority: "required", required: true },
  release_identity: { phase: "deploy", priority: "required", required: true },
  storage: { phase: "data", priority: "required", required: true },
  oauth: { phase: "identity", priority: "required", required: true },
  sms: { phase: "identity", priority: "required", required: true },
  ai_judge: { phase: "trust", priority: "required", required: true },
  security: { phase: "safety", priority: "required", required: true },
  abuse_limits: { phase: "safety", priority: "required", required: true },
  security_headers: { phase: "safety", priority: "recommended", required: false },
  static_app: { phase: "deploy", priority: "required", required: true },
  origins: { phase: "deploy", priority: "required", required: true },
  voice_permissions: { phase: "voice", priority: "required", required: true },
  realtime: { phase: "realtime", priority: "required", required: true },
};

function createReadinessItem(id, label, status, detail, action = "") {
  const metadata = readinessLaunchMetadata[id] ?? { phase: "deploy", priority: "recommended", required: false };
  return { id, label, status, detail, action, ...metadata };
}

const launchEnvByReadinessCheck = {
  process_lifecycle: ["API_PORT=4000", "SHUTDOWN_GRACE_MS=8000", "DEBATE_CLOCK_TICK_MS=1000"],
  release_identity: [
    "RELEASE_VERSION=0.1.0",
    "RENDER_GIT_COMMIT=<render-provided-git-sha>",
    "RELEASE_CHANNEL=production",
    "RELEASE_BUILD_TIME=<iso-build-time>",
  ],
  storage: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_MODE=normalized"],
  oauth: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  sms: ["SMS_PROVIDER=solapi", "SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SOLAPI_SENDER_NUMBER", "PHONE_CODE_HIDE_DEBUG=true"],
  ai_judge: ["OPENAI_API_KEY", "OPENAI_JUDGE_MODEL=gpt-4o-mini", "OPENAI_JUDGE_TIMEOUT_MS=20000", "AI_JUDGE_FORCE_LOCAL=false"],
  security: [
    "NODE_ENV=production",
    "PLATFORM_ADMIN_LOGIN_IDS=<comma-separated-admin-login-ids>",
    "ENABLE_DEMO_AUTH=false",
    "ENABLE_OPEN_STATE_WRITE=false",
    "PHONE_CODE_HIDE_DEBUG=true",
  ],
  abuse_limits: [
    "RATE_LIMIT_AUTH_WINDOW_SECONDS=600",
    "RATE_LIMIT_LOGIN_MAX=8",
    "RATE_LIMIT_PHONE_REQUEST_MAX=5",
    "RATE_LIMIT_MESSAGE_MAX=30",
  ],
  origins: ["API_HOST=0.0.0.0", "ALLOWED_ORIGINS=https://your-service.example.com"],
  static_app: ["SERVE_STATIC_APP=true"],
};

const launchEnvTemplateByReadinessCheck = {
  process_lifecycle: {
    title: "Process lifecycle",
    lines: [
      "API_PORT=4000",
      "SHUTDOWN_GRACE_MS=8000",
      "DEBATE_CLOCK_TICK_MS=1000",
    ],
  },
  release_identity: {
    title: "Release identity",
    lines: [
      "RELEASE_VERSION=0.1.0",
      "# Render normally provides RENDER_GIT_COMMIT automatically; set RELEASE_COMMIT only outside Render.",
      "RELEASE_CHANNEL=production",
      "RELEASE_BUILD_TIME=<iso-build-time>",
    ],
  },
  storage: {
    title: "Supabase storage",
    lines: [
      "SUPABASE_URL=https://your-project-ref.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
      "SUPABASE_TABLE_PREFIX=nb_",
      "SUPABASE_STORAGE_MODE=normalized",
    ],
  },
  oauth: {
    title: "Supabase OAuth",
    lines: [
      "VITE_SUPABASE_URL=https://your-project-ref.supabase.co",
      "VITE_SUPABASE_ANON_KEY=replace-with-anon-key",
      "SUPABASE_URL=https://your-project-ref.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key",
    ],
  },
  sms: {
    title: "SOLAPI SMS",
    lines: [
      "SMS_PROVIDER=solapi",
      "SOLAPI_API_KEY=replace-with-solapi-api-key",
      "SOLAPI_API_SECRET=replace-with-solapi-api-secret",
      "SOLAPI_SENDER_NUMBER=replace-with-registered-solapi-sender-number",
      "PHONE_CODE_HIDE_DEBUG=true",
    ],
  },
  ai_judge: {
    title: "OpenAI judge",
    lines: [
      "OPENAI_API_KEY=replace-with-openai-api-key",
      "OPENAI_JUDGE_MODEL=gpt-4o-mini",
      "OPENAI_JUDGE_TIMEOUT_MS=20000",
      "AI_JUDGE_FORCE_LOCAL=false",
    ],
  },
  security: {
    title: "Production safety",
    lines: [
      "NODE_ENV=production",
      "SESSION_SECRET=replace-with-long-random-secret",
      "PLATFORM_ADMIN_LOGIN_IDS=nosu",
      "ENABLE_DEMO_AUTH=false",
      "ENABLE_OPEN_STATE_WRITE=false",
      "PHONE_CODE_HIDE_DEBUG=true",
    ],
  },
  abuse_limits: {
    title: "Abuse protection limits",
    lines: [
      "RATE_LIMIT_AUTH_WINDOW_SECONDS=600",
      "RATE_LIMIT_LOGIN_MAX=8",
      "RATE_LIMIT_SIGNUP_MAX=5",
      "RATE_LIMIT_PHONE_REQUEST_MAX=5",
      "RATE_LIMIT_PHONE_VERIFY_MAX=10",
      "RATE_LIMIT_PASSWORD_MAX=6",
      "RATE_LIMIT_WRITE_WINDOW_SECONDS=60",
      "RATE_LIMIT_MESSAGE_MAX=30",
      "RATE_LIMIT_REPORT_MAX=10",
    ],
  },
  origins: {
    title: "Public API origin",
    lines: [
      "API_HOST=0.0.0.0",
      "ALLOWED_ORIGINS=https://nosu-best.onrender.com",
    ],
  },
  static_app: {
    title: "Static app serving",
    lines: ["SERVE_STATIC_APP=true"],
  },
};

const launchCommandList = [
  {
    id: "verify",
    label: "로컬 전체 검증",
    command: "npm.cmd run verify",
    detail: "서버 문법, 빌드, API/auth/storage/release smoke를 먼저 통과시킵니다.",
  },
  {
    id: "release-env",
    label: "운영 env 점검",
    command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run check:release-env',
    detail: "실제 운영 secret 파일이 배포 기준을 만족하는지 확인합니다.",
  },
  {
    id: "release-env-json",
    label: "Release env JSON",
    command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run check:release-env:json',
    detail: "Outputs a secret-safe machine-readable release env diagnostics report for CI or launch evidence.",
  },
  {
    id: "build",
    label: "정적 앱 빌드",
    command: "npm.cmd run build",
    detail: "Express 단일 서버가 서빙할 Vite dist 산출물을 만듭니다.",
  },
  {
    id: "start-release",
    label: "운영 서버 시작",
    command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run start:release',
    detail: "운영 env guard를 통과한 뒤 Express API와 정적 앱을 같은 서버에서 시작합니다.",
  },
  {
    id: "release-preflight",
    label: "Release preflight",
    command: "npm.cmd run smoke:release-preflight",
    detail: "Starts the guarded release server with a temporary production env and verifies health/static/CORS safety.",
  },
  {
    id: "release-evidence",
    label: "Launch evidence package",
    command: "npm.cmd run release:evidence:strict",
    detail: "Collects release preflight and full smoke artifacts into output/launch-evidence-package.json and .md.",
  },
  {
    id: "release-rehearsal",
    label: "Launch rehearsal",
    command: "npm.cmd run release:rehearse",
    detail: "Runs the production env gate, full smoke, strict evidence package, and release dry-run as one promotion rehearsal.",
  },
  {
    id: "promotion-refresh",
    label: "Promotion gate refresh",
    command: "npm.cmd run release:promotion-refresh",
    detail: "Refreshes full smoke, strict launch evidence, and rehearsal smoke artifacts, then writes a promotion gate report.",
  },
  {
    id: "promotion-refresh-strict",
    label: "Strict promotion refresh",
    command: "npm.cmd run release:promotion-refresh:strict",
    detail: "Runs the real-env promotion rehearsal and writes the final promotion gate refresh report.",
  },
  {
    id: "full-smoke",
    label: "릴리스 최종 스모크",
    command: "npm.cmd run smoke:full",
    detail: "배포/브라우저/음성 플로우까지 한 번에 점검합니다.",
  },
];

const LAUNCH_ARTIFACT_MAX_AGE_HOURS = readPositiveIntEnv("LAUNCH_ARTIFACT_MAX_AGE_HOURS", 24);

const launchPromotionArtifactDefinitions = [
  {
    id: "release-preflight",
    label: "Release preflight",
    path: "output/release-preflight-report.json",
    command: "npm.cmd run smoke:release-preflight",
    required: true,
  },
  {
    id: "smoke-full",
    label: "Full smoke",
    path: "output/smoke-full-report.json",
    command: "npm.cmd run smoke:full",
    required: true,
  },
  {
    id: "launch-evidence",
    label: "Strict evidence",
    path: "output/launch-evidence-package.json",
    command: "npm.cmd run release:evidence:strict",
    required: true,
  },
  {
    id: "launch-rehearsal",
    label: "Launch rehearsal",
    path: "output/launch-rehearsal-report.json",
    command: "npm.cmd run release:rehearse",
    required: true,
  },
  {
    id: "promotion-refresh",
    label: "Promotion refresh",
    path: "output/promotion-gate-refresh-report.json",
    command: "npm.cmd run release:promotion-refresh",
    required: true,
  },
];

function buildLaunchEnvTemplate(items) {
  const sections = [];
  const seenKeys = new Set();
  for (const item of items) {
    const template = launchEnvTemplateByReadinessCheck[item.id];
    if (!template) continue;
    const lines = template.lines.filter((line) => {
      const key = String(line).split("=")[0];
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    if (lines.length) sections.push([`# ${template.title}`, ...lines].join("\n"));
  }
  return sections.length
    ? ["# Nosu Best production env draft", "# Replace placeholder values before deploy.", ...sections].join("\n\n")
    : "";
}

function compactReadinessItem(item) {
  return {
    id: item.id,
    label: item.label,
    status: item.status,
    detail: item.detail,
    action: item.action,
    phase: item.phase,
    priority: item.priority,
    required: item.required,
  };
}

function buildLaunchReadinessReport(launch, checks, summary, generatedAt = new Date().toISOString()) {
  const datePart = generatedAt.slice(0, 10);
  const timePart = generatedAt.slice(11, 19).replaceAll(":", "");
  const percent = checks.length > 0 ? Math.round((summary.ready / checks.length) * 100) : 0;
  const commands = Array.isArray(launch.commands) ? launch.commands : [];
  const section = (title, items, fallback = "- None") => [
    `## ${title}`,
    "",
    ...(items.length
      ? items.map((item) => `- [${item.status}] ${item.label}: ${item.detail}${item.action ? ` Next: ${item.action}` : ""}`)
      : [fallback]),
    "",
  ];
  const lines = [
    "# Nosu Best Launch Readiness Report",
    "",
    `Generated: ${generatedAt}`,
    `Status: ${launch.label} (${launch.status})`,
    `Score: ${summary.ready}/${checks.length} ready (${percent}%)`,
    `Headline: ${launch.headline}`,
    "",
    ...section("Required Open Items", launch.requiredOpen),
    ...section("Recommended Open Items", launch.recommendedOpen),
    "## Next Actions",
    "",
    ...(launch.nextActions.length ? launch.nextActions.map((action) => `- ${action}`) : ["- No immediate action required."]),
    "",
    ...(launch.promotionGate
      ? [
          "## Promotion Gate",
          "",
          `Status: ${launch.promotionGate.label} (${launch.promotionGate.status})`,
          `Detail: ${launch.promotionGate.detail}`,
          `Freshness window: ${launch.promotionGate.maxAgeHours}h`,
          "",
          ...(launch.promotionGate.strict
            ? [
                "### Strict Promotion Gap",
                "",
                `Status: ${launch.promotionGate.strict.label} (${launch.promotionGate.strict.status})`,
                `Detail: ${launch.promotionGate.strict.detail}`,
                `Current rehearsal mode: ${launch.promotionGate.strict.currentMode}`,
                `Command: ${launch.promotionGate.strict.command}`,
                "",
              ]
            : []),
          ...(launch.promotionGate.artifacts.length
            ? launch.promotionGate.artifacts.map(
                (item) =>
                  `- [${item.ok ? "ready" : item.status}] ${item.label}: ${item.path}${item.detail ? ` - ${item.detail}` : ""}`,
              )
            : ["- No launch artifacts configured."]),
          "",
          ...(launch.promotionGate.nextActions.length
            ? launch.promotionGate.nextActions.map((action) => `- ${action}`)
            : ["- No promotion gate action required."]),
          "",
        ]
      : []),
    "## Release Commands",
    "",
    ...(commands.length
      ? commands.map((item) => `- ${item.label}: \`${item.command}\`${item.detail ? ` - ${item.detail}` : ""}`)
      : ["- No release commands configured."]),
    "",
    "## Required Environment",
    "",
    ...(launch.env.length ? launch.env.map((item) => `- ${item}`) : ["- No missing environment items detected."]),
    "",
  ];
  if (launch.envTemplate) {
    lines.push("## Env Draft", "", "```dotenv", launch.envTemplate, "```", "");
  }
  return {
    generatedAt,
    filename: `nosu-best-readiness-${datePart}-${timePart}.md`,
    jsonFilename: `nosu-best-readiness-${datePart}-${timePart}.json`,
    summary: launch.headline,
    markdown: lines.join("\n"),
  };
}

function buildLaunchEvidence(launch, report) {
  return {
    generatedAt: report.generatedAt,
    packageFilename: report.jsonFilename.replace("readiness", "launch-evidence"),
    checklist: [
      {
        id: "readiness-report",
        label: "Readiness Markdown report",
        artifact: report.filename,
        required: true,
      },
      {
        id: "readiness-json",
        label: "Readiness JSON snapshot",
        artifact: report.jsonFilename,
        required: true,
      },
      {
        id: "env-draft",
        label: "Production env draft",
        artifact: "nosu-best-production.env.example",
        required: launch.env.length > 0,
      },
      {
        id: "release-env-json",
        label: "Release env JSON diagnostics",
        artifact: "stdout from npm.cmd run check:release-env:json",
        command: "npm.cmd run check:release-env:json",
        required: true,
      },
      {
        id: "release-preflight-json",
        label: "Release preflight JSON report",
        artifact: "output/release-preflight-report.json",
        command: "npm.cmd run smoke:release-preflight",
        required: true,
      },
      {
        id: "release-preflight-markdown",
        label: "Release preflight Markdown report",
        artifact: "output/release-preflight-report.md",
        command: "npm.cmd run smoke:release-preflight",
        required: true,
      },
      {
        id: "release-smoke-json",
        label: "Full release smoke JSON report",
        artifact: "output/smoke-full-report.json",
        command: "npm.cmd run smoke:full",
        required: true,
      },
      {
        id: "release-smoke-markdown",
        label: "Full release smoke Markdown report",
        artifact: "output/smoke-full-report.md",
        command: "npm.cmd run smoke:full",
        required: true,
      },
      {
        id: "launch-evidence-json",
        label: "Launch evidence JSON package",
        artifact: "output/launch-evidence-package.json",
        command: "npm.cmd run release:evidence:strict",
        required: true,
      },
      {
        id: "launch-evidence-markdown",
        label: "Launch evidence Markdown package",
        artifact: "output/launch-evidence-package.md",
        command: "npm.cmd run release:evidence:strict",
        required: true,
      },
      {
        id: "launch-rehearsal-json",
        label: "Launch rehearsal JSON report",
        artifact: "output/launch-rehearsal-report.json",
        command: "npm.cmd run release:rehearse",
        required: true,
      },
      {
        id: "launch-rehearsal-markdown",
        label: "Launch rehearsal Markdown report",
        artifact: "output/launch-rehearsal-report.md",
        command: "npm.cmd run release:rehearse",
        required: true,
      },
    ],
  };
}

function buildLaunchHandoff(launch, report, evidence) {
  const strict = launch.promotionGate?.strict ?? null;
  const promotionStatus = launch.promotionGate?.status ?? "partial";
  const strictReady = strict?.ready === true;
  const localReady = strict?.localReady === true;
  const requiredOpenCount = launch.requiredOpen.length;
  const blockerCount = launch.blockers.length;
  const canLaunch = strictReady && requiredOpenCount === 0 && promotionStatus === "ready";
  const blocked = blockerCount > 0 || promotionStatus === "blocked";
  const status = canLaunch ? "ready" : blocked ? "blocked" : "pending";
  const label = canLaunch ? "Launch handoff ready" : blocked ? "Launch handoff blocked" : "Launch handoff pending";
  const summary = canLaunch
    ? "Production launch handoff is clear for the final release start command."
    : blocked
      ? "Resolve required readiness or promotion gate blockers before public launch."
      : "Local evidence is being assembled; complete strict rehearsal before public launch.";
  const commands = [
    {
      id: "check-release-env",
      label: "Validate production env",
      command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run check:release-env',
      required: true,
      detail: "Confirms real production secrets, origins, release identity, and safety switches before launch.",
    },
    {
      id: "strict-promotion-refresh",
      label: "Run strict promotion refresh",
      command: "npm.cmd run release:promotion-refresh:strict",
      required: true,
      detail: "Runs full smoke, strict evidence, and real-env launch rehearsal together for the final gate.",
    },
    {
      id: "start-release",
      label: "Start release server",
      command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run start:release',
      required: true,
      detail: "Starts the guarded production server only after the production env check passes.",
    },
  ];
  const finalCommandOrder = [
    {
      step: 1,
      id: "validate-production-env",
      label: "Validate the real production env file",
      command: commands[0].command,
      continueWhen: "The env guard exits 0 with no required errors.",
      failureRecovery: [
        "Fill missing or placeholder production env values in the secure env file.",
        "Re-run the same env guard until it passes before generating final evidence.",
      ],
    },
    {
      step: 2,
      id: "refresh-local-promotion-evidence",
      label: "Refresh local promotion evidence",
      command: "npm.cmd run release:promotion-refresh",
      continueWhen: "output/promotion-gate-refresh-report.json is ready or only strict rehearsal remains.",
      failureRecovery: [
        "Open output/promotion-gate-refresh-report.md and fix the first blocked local artifact.",
        "Re-run npm.cmd run release:promotion-refresh after the blocked smoke or evidence step is fixed.",
      ],
    },
    {
      step: 3,
      id: "run-strict-production-rehearsal",
      label: "Run strict real-env rehearsal",
      command: commands[1].command,
      continueWhen: "The strict report shows mode=strict-rehearsal and status=ready.",
      failureRecovery: [
        "Treat env guard, smoke, evidence, or dry-run failure as a launch blocker.",
        "Fix the failing stage, then re-run npm.cmd run release:promotion-refresh:strict.",
      ],
    },
    {
      step: 4,
      id: "start-guarded-release",
      label: "Start the guarded release server",
      command: commands[2].command,
      continueWhen: "The strict handoff status is ready and release approval is recorded.",
      failureRecovery: [
        "Do not bypass the startup guard; re-run the env guard if start:release stops.",
        "If runtime health fails after start, stop the process, restore the last known-good env/build, and repeat the strict rehearsal.",
      ],
    },
  ];
  const recoveryCommands = [
    {
      id: "env-json-diagnostics",
      command: '$env:RELEASE_ENV_PATH="C:\\secure\\nosu-best\\deploy\\.env.production"; npm.cmd run check:release-env:json',
      useWhen: "The env guard fails and the operator needs a secret-safe machine-readable error summary.",
    },
    {
      id: "local-promotion-refresh",
      command: "npm.cmd run release:promotion-refresh",
      useWhen: "Local preflight, smoke, evidence, or promotion artifacts are missing, failed, or stale.",
    },
    {
      id: "strict-promotion-refresh",
      command: "npm.cmd run release:promotion-refresh:strict",
      useWhen: "Local evidence is current but the real production-env rehearsal has not passed.",
    },
  ];
  const artifacts = [
    ...new Set([
      report.filename,
      report.jsonFilename,
      evidence.packageFilename,
      ...evidence.checklist.map((item) => item.artifact),
      ...(launch.promotionGate?.artifacts ?? []).map((item) => item.path),
    ]),
  ];
  const checklist = [
    {
      id: "production-env",
      label: "Production env guard",
      status: launch.env.length === 0 ? "ready" : "blocked",
      detail:
        launch.env.length === 0
          ? "No required env gaps are currently reported by readiness."
          : `${launch.env.length} production env item${launch.env.length === 1 ? "" : "s"} still need real values.`,
      command: commands[0].command,
      artifact: "stdout from npm.cmd run check:release-env:json",
    },
    {
      id: "local-evidence",
      label: "Local promotion evidence",
      status: localReady ? "ready" : promotionStatus === "blocked" ? "blocked" : "pending",
      detail: localReady
        ? "Preflight, full smoke, strict evidence, and promotion refresh are current locally."
        : "Refresh local promotion evidence before asking for final release approval.",
      command: "npm.cmd run release:promotion-refresh",
      artifact: "output/promotion-gate-refresh-report.json",
    },
    {
      id: "strict-rehearsal",
      label: "Strict production rehearsal",
      status: strictReady ? "ready" : localReady ? "pending" : promotionStatus === "blocked" ? "blocked" : "pending",
      detail: strictReady
        ? "The real-env strict launch rehearsal has passed."
        : "Run the strict production-env rehearsal after local evidence is current.",
      command: commands[1].command,
      artifact: "output/launch-rehearsal-report.json",
    },
    {
      id: "release-start",
      label: "Release start approval",
      status: canLaunch ? "ready" : blocked ? "blocked" : "pending",
      detail: canLaunch
        ? "Use the guarded start command for the public release process."
        : "Wait until required readiness checks and the strict promotion gate are ready.",
      command: commands[2].command,
    },
  ];
  const lines = [
    "# Nosu Best Launch Handoff",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${label} (${status})`,
    `Summary: ${summary}`,
    "",
    "## Go / No-Go",
    "",
    `- Can launch: ${canLaunch ? "yes" : "no"}`,
    `- Required open items: ${requiredOpenCount}`,
    `- Blockers: ${blockerCount}`,
    `- Strict rehearsal ready: ${strictReady ? "yes" : "no"}`,
    `- Local evidence ready: ${localReady ? "yes" : "no"}`,
    "",
    "## Checklist",
    "",
    ...checklist.map((item) => `- [${item.status}] ${item.label}: ${item.detail}${item.command ? ` Command: ${item.command}` : ""}`),
    "",
    "## Commands",
    "",
    ...commands.map((item) => `- ${item.label}: \`${item.command}\` - ${item.detail}`),
    "",
    "## Final Command Order",
    "",
    ...finalCommandOrder.map((item) => `${item.step}. ${item.label}: \`${item.command}\` — continue when ${item.continueWhen}`),
    "",
    "## Failure Recovery",
    "",
    ...recoveryCommands.map((item) => `- ${item.useWhen}: \`${item.command}\``),
    "",
    "## Artifacts",
    "",
    ...artifacts.map((artifact) => `- ${artifact}`),
    "",
  ];

  return {
    generatedAt: report.generatedAt,
    filename: report.jsonFilename.replace("readiness", "launch-handoff"),
    markdownFilename: report.filename.replace("readiness", "launch-handoff"),
    status,
    label,
    summary,
    goNoGo: {
      canLaunch,
      strictReady,
      localReady,
      requiredOpen: requiredOpenCount,
      blockers: blockerCount,
    },
    commands,
    finalCommandOrder,
    recoveryCommands,
    artifacts,
    checklist,
    markdown: lines.join("\n"),
  };
}

function launchArtifactTimeMs(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

function normalizeLaunchArtifactStatus(report) {
  if (typeof report?.status === "string" && report.status.trim()) return report.status.toLowerCase();
  if (report?.ok === true) return "passed";
  if (report?.ok === false) return "blocked";
  return "present";
}

function launchArtifactDetail(report, fallbackStatus) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const check =
    checks.find((item) => item?.status === "blocked") ??
    checks.find((item) => item?.status === "pending") ??
    checks[0];
  if (typeof check?.detail === "string" && check.detail.trim()) return check.detail;
  if (typeof report?.failedStage === "string" && report.failedStage) return `failed at ${report.failedStage}`;
  if (Array.isArray(report?.nextActions) && typeof report.nextActions[0] === "string") return report.nextActions[0];
  return `status=${fallbackStatus}`;
}

function inspectLaunchPromotionArtifact(definition, context = {}) {
  const checkedAt = new Date().toISOString();
  const absolutePath = path.join(__dirname, "..", definition.path);
  const base = {
    id: definition.id,
    label: definition.label,
    path: definition.path,
    command: definition.command,
    required: definition.required,
    checkedAt,
    exists: false,
    fresh: false,
    ok: false,
    blocking: false,
    status: "missing",
    detail: `${definition.label} artifact is missing`,
    ageMinutes: null,
    generatedAt: null,
    startedAt: null,
    finishedAt: null,
    mode: null,
    strict: null,
  };

  if (!existsSync(absolutePath)) return base;

  try {
    const stats = statSync(absolutePath);
    const report = JSON.parse(readFileSync(absolutePath, "utf8"));
    const ageMinutes = Math.max(0, Math.round((Date.now() - stats.mtimeMs) / 60000));
    const fresh = ageMinutes <= LAUNCH_ARTIFACT_MAX_AGE_HOURS * 60;
    let status = normalizeLaunchArtifactStatus(report);
    let detail = launchArtifactDetail(report, status);
    const generatedAt = typeof report?.generatedAt === "string" ? report.generatedAt : null;
    const startedAt = typeof report?.startedAt === "string" ? report.startedAt : null;
    const finishedAt = typeof report?.finishedAt === "string" ? report.finishedAt : generatedAt;
    let ok = report?.ok === true && ["passed", "ready"].includes(status);

    if (definition.id === "smoke-full") {
      const smokeFinishedMs = launchArtifactTimeMs(finishedAt);
      const preflightFinishedMs = launchArtifactTimeMs(context.preflightFinishedAt);
      ok = report?.ok === true && status === "passed";
      if (ok && preflightFinishedMs > 0 && smokeFinishedMs > 0 && smokeFinishedMs < preflightFinishedMs) {
        ok = false;
        status = "pending";
        detail = "full smoke is older than the latest preflight";
      }
    }

    if (definition.id === "launch-evidence") {
      ok = report?.ok === true && report?.strict === true && status === "ready";
      if (!ok && report?.strict !== true) detail = "strict evidence has not been generated after the latest full smoke";
    }

    if (definition.id === "launch-rehearsal") {
      ok = report?.ok === true && report?.mode === "strict" && status === "ready";
      if (!ok && report?.mode !== "strict") detail = "strict launch rehearsal has not been run";
    }

    if (definition.id === "promotion-refresh") {
      const reportFinishedMs = launchArtifactTimeMs(finishedAt);
      const latestGateFinishedMs = launchArtifactTimeMs(context.latestGateFinishedAt);
      ok = report?.ok === true && status === "ready";
      if (!ok && status !== "ready") detail = "promotion refresh has not completed all gate checks";
      if (ok && latestGateFinishedMs > 0 && reportFinishedMs > 0 && reportFinishedMs < latestGateFinishedMs) {
        ok = false;
        status = "pending";
        detail = "promotion refresh report is older than the latest gate artifact";
      }
    }

    if (!fresh) {
      ok = false;
      status = ["blocked", "failed"].includes(status) ? status : "stale";
      detail = `${definition.label} artifact is older than ${LAUNCH_ARTIFACT_MAX_AGE_HOURS}h`;
    }

    const blocking = ["blocked", "failed"].includes(status) || (report?.ok === false && !["pending", "partial", "stale"].includes(status));

    return {
      ...base,
      exists: true,
      fresh,
      ok,
      blocking,
      status,
      detail,
      ageMinutes,
      generatedAt,
      startedAt,
      finishedAt,
      mode: typeof report?.mode === "string" ? report.mode : null,
      strict: typeof report?.strict === "boolean" ? report.strict : null,
    };
  } catch (error) {
    return {
      ...base,
      exists: true,
      status: "blocked",
      detail: `artifact could not be read: ${error.message}`,
      blocking: true,
    };
  }
}

function buildLaunchPromotionGate(generatedAt = new Date().toISOString()) {
  const artifacts = [];
  const preflight = inspectLaunchPromotionArtifact(launchPromotionArtifactDefinitions[0]);
  artifacts.push(preflight);
  const fullSmoke = inspectLaunchPromotionArtifact(launchPromotionArtifactDefinitions[1], {
    preflightFinishedAt: preflight.finishedAt,
  });
  artifacts.push(fullSmoke);
  const launchEvidence = inspectLaunchPromotionArtifact(launchPromotionArtifactDefinitions[2]);
  artifacts.push(launchEvidence);
  const launchRehearsal = inspectLaunchPromotionArtifact(launchPromotionArtifactDefinitions[3]);
  artifacts.push(launchRehearsal);
  const latestGateFinishedAt = [preflight, fullSmoke, launchEvidence, launchRehearsal]
    .map((artifact) => artifact.finishedAt)
    .filter(Boolean)
    .sort((left, right) => launchArtifactTimeMs(right) - launchArtifactTimeMs(left))[0];
  artifacts.push(
    inspectLaunchPromotionArtifact(launchPromotionArtifactDefinitions[4], {
      latestGateFinishedAt,
    }),
  );

  const requiredArtifacts = artifacts.filter((artifact) => artifact.required);
  const readyCount = requiredArtifacts.filter((artifact) => artifact.ok).length;
  const openArtifacts = requiredArtifacts.filter((artifact) => !artifact.ok);
  const blockedArtifacts = openArtifacts.filter((artifact) => artifact.blocking);
  const localRehearsalReady = launchRehearsal.exists && launchRehearsal.fresh && launchRehearsal.status === "ready";
  const localPromotionReady =
    [preflight, fullSmoke, launchEvidence, artifacts[4]].every((artifact) => artifact?.ok) && localRehearsalReady;
  const strictRehearsalReady = launchRehearsal.ok && launchRehearsal.mode === "strict";
  const strictStatus = strictRehearsalReady ? "ready" : localPromotionReady ? "pending" : blockedArtifacts.length > 0 ? "blocked" : "pending";
  const strict = {
    status: strictStatus,
    label: strictRehearsalReady
      ? "Strict rehearsal complete"
      : localPromotionReady
        ? "Real-env rehearsal remaining"
        : "Strict rehearsal not ready",
    detail: strictRehearsalReady
      ? "production env guard, full smoke, strict evidence, and release dry-run have passed together"
      : localPromotionReady
        ? "local promotion evidence is ready; run the strict production-env rehearsal before public launch"
        : "refresh local promotion evidence before running the final strict production-env rehearsal",
    command: "npm.cmd run release:promotion-refresh:strict",
    artifactId: "launch-rehearsal",
    currentMode: launchRehearsal.mode ?? (launchRehearsal.exists ? "unknown" : "missing"),
    ready: strictRehearsalReady,
    localReady: localPromotionReady,
  };
  const status = blockedArtifacts.length > 0 ? "blocked" : openArtifacts.length > 0 ? "partial" : "ready";
  const label =
    status === "ready"
      ? "Final promotion ready"
      : status === "blocked"
        ? "Promotion blocked"
        : "Promotion evidence pending";
  const detail =
    status === "ready"
      ? "preflight, full smoke, strict evidence, launch rehearsal, and promotion refresh report are current"
      : `${openArtifacts.length} launch artifact${openArtifacts.length === 1 ? "" : "s"} need attention`;
  const nextActions = [];
  if (openArtifacts.length > 0) {
    nextActions.push("npm.cmd run release:promotion-refresh - refresh full smoke, strict evidence, and rehearsal smoke artifacts.");
    nextActions.push("npm.cmd run release:promotion-refresh:strict - run the real-env final rehearsal when production secrets are ready.");
  }
  const seenCommands = new Set();
  for (const artifact of openArtifacts) {
    if (!artifact.command || seenCommands.has(artifact.command)) continue;
    seenCommands.add(artifact.command);
    nextActions.push(`${artifact.command} - ${artifact.detail}`);
  }

  return {
    status,
    label,
    detail,
    generatedAt,
    maxAgeHours: LAUNCH_ARTIFACT_MAX_AGE_HOURS,
    requiredCount: requiredArtifacts.length,
    readyCount,
    blockedCount: blockedArtifacts.length,
    strict,
    artifacts,
    nextActions,
  };
}

function buildLaunchReadiness(checks, summary) {
  const blockers = checks.filter((item) => item.status === "blocked");
  const warnings = checks.filter((item) => item.status === "warning");
  const requiredOpen = checks.filter((item) => item.required && item.status !== "ready");
  const recommendedOpen = checks.filter((item) => !item.required && item.status !== "ready");
  const actionable = [...blockers, ...warnings].slice(0, 4);
  const envItems = [...blockers, ...warnings];
  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";
  const label =
    status === "ready"
      ? "런칭 가능"
      : status === "warning"
        ? "조건부 런칭"
        : "런칭 보류";
  const headline =
    status === "ready"
      ? "운영 전환에 필요한 핵심 설정이 준비됐습니다."
      : status === "warning"
        ? `${warnings.length}개 항목을 확인하면 운영 리스크를 더 줄일 수 있습니다.`
        : `${blockers.length}개 필수 항목이 막혀 있어 운영 전환 전에 처리해야 합니다.`;
  const env = [
    ...new Set(envItems.flatMap((item) => launchEnvByReadinessCheck[item.id] ?? [])),
  ];
  const phaseSummary = Object.values(
    checks.reduce((accumulator, item) => {
      const phase = item.phase ?? "deploy";
      if (!accumulator[phase]) {
        accumulator[phase] = {
          phase,
          label: readinessPhaseLabels[phase] ?? phase,
          total: 0,
          ready: 0,
          warning: 0,
          blocked: 0,
          requiredOpen: 0,
        };
      }
      accumulator[phase].total += 1;
      accumulator[phase][item.status] += 1;
      if (item.required && item.status !== "ready") accumulator[phase].requiredOpen += 1;
      return accumulator;
    }, {}),
  );

  const launch = {
    status,
    label,
    headline,
    blockers: blockers.map(compactReadinessItem),
    warnings: warnings.map(compactReadinessItem),
    requiredOpen: requiredOpen.map(compactReadinessItem),
    recommendedOpen: recommendedOpen.map(compactReadinessItem),
    phaseSummary,
    nextActions: actionable
      .map((item) => item.action || `${item.label} 설정을 확인하세요.`)
      .filter(Boolean),
    env,
    envTemplate: buildLaunchEnvTemplate(envItems),
    commands: launchCommandList,
  };
  const promotionGate = buildLaunchPromotionGate();
  const launchForReport = { ...launch, promotionGate };
  const report = buildLaunchReadinessReport(launchForReport, checks, summary);
  const evidence = buildLaunchEvidence(launchForReport, report);
  return {
    ...launchForReport,
    report,
    evidence,
    handoff: buildLaunchHandoff(launchForReport, report, evidence),
  };
}

function buildOperationalReadiness(payload) {
  const storage = storagePayload();
  const runtime = runtimePayload();
  const smsStatus = getSmsProviderStatus();
  const aiStatus = getAiJudgeStatus();
  const smsConfigured = smsStatus.configured;
  const productionSafetyReady =
    IS_PRODUCTION_RUNTIME &&
    !DEMO_AUTH_ENABLED &&
    !OPEN_STATE_WRITE_ENABLED &&
    PHONE_CODE_HIDE_DEBUG &&
    PLATFORM_ADMIN_ALLOWLIST_CONFIGURED;
  const productionSafetyBlocked =
    IS_PRODUCTION_RUNTIME &&
    (DEMO_AUTH_ENABLED || OPEN_STATE_WRITE_ENABLED || !PHONE_CODE_HIDE_DEBUG || !PLATFORM_ADMIN_ALLOWLIST_CONFIGURED);
  const rateLimits = rateLimitPayload();
  const abuseLimitsReady =
    rateLimits.authWindowSeconds > 0 &&
    rateLimits.writeWindowSeconds > 0 &&
    rateLimits.loginMax > 0 &&
    rateLimits.signupMax > 0 &&
    rateLimits.phoneRequestMax > 0 &&
    rateLimits.phoneVerifyMax > 0 &&
    rateLimits.passwordMax > 0 &&
    rateLimits.messageMax > 0 &&
    rateLimits.reportMax > 0;
  const localOrigins = allowedOrigins.filter((origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin));
  const externalOrigins = allowedOrigins.filter((origin) => !localOrigins.includes(origin));
  const hasExplicitAllowedOrigins = Boolean(process.env.ALLOWED_ORIGINS?.trim());
  const originStatus =
    externalOrigins.length > 0 && (!IS_PRODUCTION_RUNTIME || localOrigins.length === 0)
      ? "ready"
      : IS_PRODUCTION_RUNTIME && externalOrigins.length === 0
        ? "blocked"
        : "warning";
  const releaseIdentity = runtime.release;
  const releaseIdentityStatus = releaseIdentity.configured
    ? "ready"
    : IS_PRODUCTION_RUNTIME
      ? "blocked"
      : "warning";
  const storageStatus = storage.productionReady ? "ready" : IS_PRODUCTION_RUNTIME ? "blocked" : "warning";
  const storageDetail = storage.productionReady
    ? "Supabase normalized 모드에 필요한 URL, service-role key, anon key, storage mode가 설정되어 있습니다. /api/admin/storage-check로 정규 테이블 schema를 확인하세요."
    : storage.missingEnv.length > 0
      ? `Production Supabase gate is missing: ${storage.missingEnv.join(", ")}. Current storage=${storage.storage}, mode=${storage.storageMode}, requested=${storage.requestedStorageMode}.`
      : `Supabase storage is not production-ready. Current storage=${storage.storage}, mode=${storage.storageMode}, requested=${storage.requestedStorageMode}.`;
  const storageAction = storage.productionReady
    ? ""
    : "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPABASE_STORAGE_MODE=normalized, run supabase/normalized-schema.sql, then call /api/admin/storage-check.";
  const smsReadinessStatus = smsStatus.productionReady ? "ready" : IS_PRODUCTION_RUNTIME ? "blocked" : smsConfigured ? "warning" : "blocked";
  const smsReadinessDetail = smsStatus.productionReady
    ? "SOLAPI SMS is configured and debug verification codes are hidden."
    : smsStatus.missingEnv.length > 0
      ? `SMS production gate is missing: ${smsStatus.missingEnv.join(", ")}. Current provider=${smsStatus.provider}, debugCodeExposed=${smsStatus.debugCodeExposed}.`
      : `SMS provider is not production-ready. Current provider=${smsStatus.provider}, debugCodeExposed=${smsStatus.debugCodeExposed}.`;
  const smsReadinessAction = smsStatus.productionReady
    ? ""
    : "Set SMS_PROVIDER=solapi, SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER, and PHONE_CODE_HIDE_DEBUG=true in Render Environment.";
  const aiReadinessStatus = aiStatus.productionReady ? "ready" : IS_PRODUCTION_RUNTIME ? "blocked" : aiStatus.configured ? "warning" : "blocked";
  const aiReadinessDetail = aiStatus.productionReady
    ? `OpenAI judge is configured with ${aiStatus.model} and ${aiStatus.timeoutMs}ms timeout.`
    : aiStatus.missingEnv.length > 0
      ? `AI judge production gate is missing: ${aiStatus.missingEnv.join(", ")}. model=${aiStatus.model}, timeoutMs=${aiStatus.timeoutMs}.`
      : `AI judge is not production-ready. model=${aiStatus.model}, timeoutMs=${aiStatus.timeoutMs}.`;
  const aiReadinessAction = aiStatus.productionReady
    ? ""
    : "Set OPENAI_API_KEY, OPENAI_JUDGE_MODEL, OPENAI_JUDGE_TIMEOUT_MS, and AI_JUDGE_FORCE_LOCAL=false in Render Environment.";

  const checks = [
    createReadinessItem(
      "process_lifecycle",
      "Process lifecycle",
      runtime.process.shuttingDown ? "blocked" : "ready",
      runtime.process.shuttingDown
        ? `Shutdown started at ${runtime.process.shutdownStartedAt}. New traffic should wait for the replacement process.`
        : `Process ${runtime.process.pid} has been up for ${runtime.process.uptimeSeconds}s and allows ${runtime.process.shutdownGraceMs}ms for graceful shutdown.`,
      runtime.process.shuttingDown ? "Wait for the replacement process to report /api/health ok=true." : "",
    ),
    createReadinessItem(
      "release_identity",
      "릴리스 식별자",
      releaseIdentityStatus,
      releaseIdentity.configured
        ? `Release ${releaseIdentity.version} (${releaseIdentity.commitShort}) built at ${releaseIdentity.buildTime}.`
        : `Release identity is incomplete: missing=${releaseIdentity.missing.join(", ") || "none"}, stale=${releaseIdentity.staleEnv.join(", ") || "none"}, commit=${releaseIdentity.commitShort ?? "unset"}, buildTime=${releaseIdentity.buildTime ?? "unset"}.`,
      releaseIdentity.configured
        ? ""
        : "Let Render provide RENDER_GIT_COMMIT, remove stale RELEASE_COMMIT values, and set RELEASE_VERSION plus RELEASE_BUILD_TIME before promotion.",
    ),
    createReadinessItem(
      "storage",
      "Supabase 저장소",
      storageStatus,
      storageDetail,
      storageAction,
    ),
    createReadinessItem(
      "oauth",
      "간편 로그인 OAuth",
      storage.supabaseConfigured && SUPABASE_ANON_KEY ? "ready" : storage.supabaseConfigured ? "warning" : "blocked",
      storage.supabaseConfigured && SUPABASE_ANON_KEY
        ? "Supabase Auth 연결에 필요한 서버 키와 프론트 anon key가 설정되어 있습니다."
        : storage.supabaseConfigured
          ? "서버 Supabase 키는 있지만 프론트 OAuth용 anon key가 없습니다."
          : "Supabase가 연결되지 않아 실제 OAuth 세션 검증을 사용할 수 없습니다.",
      storage.supabaseConfigured && SUPABASE_ANON_KEY
        ? ""
        : "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY와 Supabase Auth Provider 설정을 확인하세요.",
    ),
    createReadinessItem(
      "sms",
      "전화번호 SMS 인증",
      smsReadinessStatus,
      smsReadinessDetail,
      smsReadinessAction,
    ),
    createReadinessItem(
      "ai_judge",
      "AI 판정",
      aiReadinessStatus,
      aiReadinessDetail,
      aiReadinessAction,
    ),
    createReadinessItem(
      "security",
      "운영 보안 스위치",
      productionSafetyReady ? "ready" : productionSafetyBlocked ? "blocked" : "warning",
      productionSafetyReady
        ? "프로덕션 런타임에서 데모 전환, 익명 쓰기, 디버그 코드가 닫혀 있고 관리자 allowlist가 설정되어 있습니다."
        : `NODE_ENV=${process.env.NODE_ENV ?? "development"}, 데모=${DEMO_AUTH_ENABLED ? "열림" : "닫힘"}, 익명쓰기=${OPEN_STATE_WRITE_ENABLED ? "열림" : "닫힘"}, 관리자 allowlist=${PLATFORM_ADMIN_ALLOWLIST_CONFIGURED ? "설정됨" : "미설정"}`,
      productionSafetyReady
        ? ""
        : "배포 환경에서는 PLATFORM_ADMIN_LOGIN_IDS 또는 PLATFORM_ADMIN_USER_IDS를 설정하고, ENABLE_DEMO_AUTH=false, ENABLE_OPEN_STATE_WRITE=false, PHONE_CODE_HIDE_DEBUG=true를 유지하세요.",
    ),
    createReadinessItem(
      "abuse_limits",
      "Auth/SMS 남용 방지",
      abuseLimitsReady ? "ready" : "blocked",
      abuseLimitsReady
        ? `로그인 ${rateLimits.loginMax}회/${rateLimits.authWindowSeconds}초, SMS 요청 ${rateLimits.phoneRequestMax}회/${rateLimits.authWindowSeconds}초, 메시지 ${rateLimits.messageMax}회/${rateLimits.writeWindowSeconds}초 제한이 적용됩니다.`
        : "인증, SMS, 메시지/신고 rate limit 값 중 0 이하인 항목이 있어 남용 방어가 비활성화될 수 있습니다.",
      abuseLimitsReady
        ? ""
        : "RATE_LIMIT_* 환경변수를 양수로 설정하고 /api/health의 runtime.rateLimits를 확인하세요.",
    ),
    createReadinessItem(
      "security_headers",
      "HTTP 보안 헤더",
      "ready",
      "nosniff, frame deny, referrer policy, permissions policy가 API 응답에 적용됩니다.",
      "",
    ),
    createReadinessItem(
      "static_app",
      "프론트엔드 정적 서빙",
      runtime.production
        ? runtime.staticAppEnabled && runtime.staticAppAvailable
          ? "ready"
          : "blocked"
        : runtime.staticAppAvailable
          ? "ready"
          : "warning",
      runtime.staticAppAvailable && (!runtime.production || runtime.staticAppEnabled)
        ? "Express 서버가 dist/index.html을 기준으로 빌드된 프론트엔드를 함께 서빙할 수 있습니다."
        : runtime.production
          ? "프로덕션 서버가 빌드된 프론트엔드를 서빙할 준비가 되지 않았습니다."
          : "개발 중에는 Vite dev server가 프론트엔드를 서빙합니다. 배포 전에는 build 산출물과 정적 서빙을 확인하세요.",
      runtime.staticAppAvailable && (!runtime.production || runtime.staticAppEnabled)
        ? ""
        : "배포 전에 npm run build를 실행하고 SERVE_STATIC_APP=true로 npm start 또는 node server/index.js를 실행하세요.",
    ),
    createReadinessItem(
      "origins",
      "배포 Origin",
      originStatus,
      externalOrigins.length > 0
        ? `허용 Origin ${allowedOrigins.length}개 중 외부 도메인 ${externalOrigins.length}개가 설정되어 있습니다.`
        : hasExplicitAllowedOrigins
          ? "ALLOWED_ORIGINS가 설정됐지만 로컬 주소만 허용되어 있습니다."
          : "ALLOWED_ORIGINS가 없어 로컬 개발 주소만 허용됩니다.",
      originStatus === "ready"
        ? ""
        : "배포 환경에서는 ALLOWED_ORIGINS에 실제 프론트엔드 HTTPS 도메인을 넣고 localhost/127.0.0.1은 제외하세요.",
    ),
    createReadinessItem(
      "voice_permissions",
      "음성 토론 권한 정책",
      runtime.permissionsPolicy.includes("microphone=(self)") ? "ready" : "blocked",
      runtime.permissionsPolicy.includes("microphone=(self)")
        ? "브라우저 Permissions-Policy가 같은 출처의 마이크 사용을 허용해 음성 토론을 시작할 수 있습니다."
        : "Permissions-Policy가 마이크 사용을 막고 있어 음성 토론 연결이 브라우저에서 차단됩니다.",
      runtime.permissionsPolicy.includes("microphone=(self)")
        ? ""
        : "Permissions-Policy에 microphone=(self)를 포함하세요.",
    ),
    createReadinessItem(
      "realtime",
      "실시간 동기화",
      "ready",
      `Socket.IO가 활성화되어 있고 현재 ${io.engine.clientsCount}개 클라이언트가 연결되어 있습니다.`,
      "",
    ),
  ];
  const summary = checks.reduce(
    (accumulator, item) => {
      accumulator[item.status] += 1;
      return accumulator;
    },
    { ready: 0, warning: 0, blocked: 0 },
  );

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    summary: {
      ...summary,
      total: checks.length,
      score: Math.round((summary.ready / checks.length) * 100),
    },
    launch: buildLaunchReadiness(checks, summary),
    runtime,
    service: {
      realtime: true,
      clients: io.engine.clientsCount,
      release: runtime.release,
      aiJudgeConfigured: aiStatus.configured,
      judgeModel: aiStatus.model,
      smsProvider: SMS_PROVIDER,
      smsConfigured,
      oauthConfigured: Boolean(storage.supabaseConfigured && SUPABASE_ANON_KEY),
      storage: storage.storage,
      storageMode: storage.storageMode,
      supabaseConfigured: storage.supabaseConfigured,
      normalized: storage.normalized,
      users: payload?.state?.users?.length ?? 0,
      channels: payload?.state?.channels?.length ?? 0,
      reports: payload?.state?.reports?.length ?? 0,
      platformSettings: platformSettingsForState(payload?.state),
    },
    checks,
  };
}

app.get("/api/health", (_request, response) => {
  const aiStatus = getAiJudgeStatus();
  const payload = {
    ok: !shuttingDown,
    service: "nosu-best-api",
    realtime: true,
    clients: io.engine.clientsCount,
    aiJudgeConfigured: aiStatus.configured,
    judgeModel: aiStatus.model,
    smsProvider: SMS_PROVIDER,
    smsConfigured: isSmsProviderConfigured(),
    phoneDebugCodeExposed: EXPOSE_PHONE_DEBUG_CODE,
    runtime: runtimePayload(),
    ...storagePayload(),
    now: new Date().toISOString(),
  };
  response.status(shuttingDown ? 503 : 200).json(payload);
});

app.get("/api/status", async (_request, response, next) => {
  try {
    const payload = await readState();
    const status = publicServiceStatusPayload(payload);
    response.status(shuttingDown ? 503 : 200).json(status);
  } catch (error) {
    next(error);
  }
});

app.get("/api/state", async (request, response, next) => {
  try {
    const payload = await readState();
    response.json(
      payload
        ? { ...payload, state: authStateForRequest(request, payload.state), csrfToken: request.csrfToken || null }
        : { state: null, savedAt: null },
    );
  } catch (error) {
    next(error);
  }
});

app.use("/api/admin", requireAdminRequest);

app.get("/api/admin/storage-check", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    response.json(await buildStorageCheck(payload));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/readiness", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    response.json(buildOperationalReadiness(payload));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/platform-settings", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    response.json({
      ok: true,
      platformSettings: platformSettingsForState(payload.state),
      savedAt: payload.savedAt ?? null,
      storage: payload.storage,
      storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/platform-settings", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const validation = validatePlatformSettingsInput(request.body?.platformSettings ?? request.body);
    if (!validation.ok) {
      response.status(400).json(validation);
      return;
    }
    const previousSettings = platformSettingsForState(payload.state);
    const nextSettings = validation.settings;
    const nextState = addAuditLog({ ...payload.state, platformSettings: nextSettings }, actor, {
      action: "admin_platform_settings_update",
      targetType: "platform_settings",
      targetId: "platform_settings",
      summary: "Platform operation settings were updated.",
      metadata: {
        previousDefaultCoinStake: previousSettings.debate.defaultCoinStake,
        nextDefaultCoinStake: nextSettings.debate.defaultCoinStake,
        previousReportThreshold: previousSettings.moderation.reportReviewThreshold,
        nextReportThreshold: nextSettings.moderation.reportReviewThreshold,
      },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_platform_settings_update");
    response.json({
      ok: true,
      platformSettings: saved.state.platformSettings,
      savedAt: saved.savedAt,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/service-notice", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }

    const active = request.body?.active !== false;
    const previousNotice = normalizeServiceNotice(payload.state.serviceNotice);
    let serviceNotice = null;
    if (active) {
      const title = String(request.body?.title ?? "").trim().slice(0, 80);
      const body = String(request.body?.body ?? "").trim().slice(0, 220);
      const rawTone = String(request.body?.tone ?? "info").trim();
      const expiresAt = normalizeServiceNoticeExpiresAt(request.body?.expiresAt);
      if (!title || !body) {
        errorResponse(response, 400, "invalid_service_notice");
        return;
      }
      if (request.body?.expiresAt && (!expiresAt || new Date(expiresAt).getTime() <= Date.now())) {
        errorResponse(response, 400, "invalid_service_notice");
        return;
      }
      serviceNotice = {
        id: previousNotice?.id ?? uid("service_notice"),
        title,
        body,
        tone: SERVICE_NOTICE_TONES.has(rawTone) ? rawTone : "info",
        active: true,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id,
        expiresAt,
      };
    }

    const action = active ? "admin_service_notice_update" : "admin_service_notice_clear";
    const nextState = addAuditLog({ ...payload.state, serviceNotice }, actor, {
      action,
      targetType: "service_notice",
      targetId: serviceNotice?.id ?? previousNotice?.id ?? "service_notice",
      summary: active
        ? `운영 공지 "${serviceNotice.title}"을 게시했습니다.`
        : "운영 공지를 내렸습니다.",
      metadata: {
        tone: serviceNotice?.tone ?? previousNotice?.tone ?? "",
        active: String(active),
        expiresAt: serviceNotice?.expiresAt ?? previousNotice?.expiresAt ?? "",
      },
    });
    const saved = await writeStateAndBroadcast(nextState, action);
    response.json({
      ok: true,
      serviceNotice: saved.state.serviceNotice ?? null,
      savedAt: saved.savedAt,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/normalized-export", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const rows = buildNormalizedRows(payload.state, { includeSecrets: false });
    response.json({
      ok: true,
      counts: rowCounts(rows),
      rows,
      secretsIncluded: false,
      storage: payload.storage,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/state-export", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }

    const exportedAt = new Date().toISOString();
    const safeState = { ...sanitizeState(payload.state), currentUserId: null };
    const filename = `nosu-best-state-${exportedAt.slice(0, 10)}-${exportedAt.slice(11, 19).replaceAll(":", "")}.json`;
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.json({
      ok: true,
      exportedAt,
      exportedBy: actor.id,
      filename,
      storage: payload.storage,
      storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
      savedAt: payload.savedAt ?? null,
      secretsIncluded: false,
      counts: stateBackupCounts(safeState),
      state: safeState,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/audit-export", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManageRoles(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }

    const auditExport = buildAuditExport(payload.state, request.query);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Content-Disposition", `attachment; filename="${auditExport.filename}"`);
    response.json({
      ok: true,
      exportedBy: actor.id,
      storage: payload.storage,
      storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
      ...auditExport,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/state-export/validate", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }

    const candidate = extractStateBackupCandidate(request.body ?? {});
    const validation = validateStateBackup(candidate);
    response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      checkedBy: actor.id,
      ...validation,
      currentCounts: stateBackupCounts(sanitizeState(payload.state)),
      storage: payload.storage,
      storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/state-export/secure", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManageRoles(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (String(request.body?.confirmation ?? "").trim() !== SECURE_BACKUP_CONFIRMATION) {
      errorResponse(response, 400, "secure_backup_confirmation_required");
      return;
    }

    const exportedAt = new Date().toISOString();
    const filename = `nosu-best-secure-state-${exportedAt.slice(0, 10)}-${exportedAt.slice(11, 19).replaceAll(":", "")}.json`;
    const auditedState = addAuditLog(payload.state, actor, {
      action: "admin_secure_state_export",
      targetType: "storage",
      summary: "Full credential backup was exported by an admin.",
      metadata: {
        storage: payload.storage,
        storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
        confirmation: "accepted",
      },
    });
    const saved = await writeStateAndBroadcast(auditedState, "admin_secure_state_export");
    const backupState = buildSecureBackupState(auditedState);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.json({
      ok: true,
      secure: true,
      exportedAt,
      exportedBy: actor.id,
      filename,
      storage: payload.storage,
      storageMode: payload.storageMode ?? (supabase ? SUPABASE_STORAGE_MODE : "file"),
      savedAt: saved.savedAt,
      secretsIncluded: true,
      secretCounts: secureBackupSecretCounts(backupState),
      counts: stateBackupCounts(backupState),
      auditLogged: true,
      state: backupState,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/state-restore", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManageRoles(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (String(request.body?.confirmation ?? "").trim() !== RESTORE_BACKUP_CONFIRMATION) {
      errorResponse(response, 400, "state_restore_confirmation_required");
      return;
    }

    const candidate = extractStateBackupCandidate(request.body ?? {});
    const validation = validateStateBackup(candidate);
    if (!validation.valid) {
      response.status(400).json({ ok: false, error: "state_restore_invalid_backup", validation });
      return;
    }
    if (!validation.secretsIncluded) {
      response.status(400).json({ ok: false, error: "state_restore_requires_secure_backup", validation });
      return;
    }

    const restoredState = buildRestoredStateFromBackup(candidate);
    const restoredActor = restoredState.users.find((user) => user.id === actor.id);
    if (!canManageRoles(restoredActor)) {
      response.status(400).json({ ok: false, error: "state_restore_actor_missing_from_backup", validation });
      return;
    }

    const restoredAt = new Date().toISOString();
    const nextState = addAuditLog(restoredState, restoredActor, {
      action: "admin_state_restore",
      targetType: "storage",
      summary: "Full credential backup was restored by an admin.",
      metadata: {
        restoredBy: actor.id,
        backupUsers: validation.counts.users,
        backupChannels: validation.counts.channels,
        secretsIncluded: "true",
      },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_state_restore");
    const storageCheck = await buildStorageCheck({
      ...payload,
      state: nextState,
      savedAt: saved.savedAt,
    });
    response.json({
      ok: true,
      restoredAt,
      restoredBy: actor.id,
      savedAt: saved.savedAt,
      counts: stateBackupCounts(nextState),
      validation,
      storageCheck,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/sync-normalized", async (request, response, next) => {
  try {
    if (!supabase) {
      errorResponse(response, 400, "supabase_not_configured");
      return;
    }
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const nextState = addAuditLog(payload.state, actor, {
      action: "admin_sync_normalized",
      targetType: "storage",
      summary: "Supabase 정규 테이블 동기화를 실행했습니다.",
      metadata: { storageMode: SUPABASE_STORAGE_MODE },
    });
    const beforeCounts = await normalizedRowCountsByKey();
    const rows = buildNormalizedRows(nextState, { includeSecrets: true });
    const expectedCounts = expectedNormalizedCounts(nextState);
    const syncSummary = buildNormalizedSyncSummary(beforeCounts, expectedCounts);
    const syncedAt = await writeNormalizedState(nextState);
    const storageCheck = await buildStorageCheck({
      ...payload,
      state: nextState,
      storage: "supabase",
      storageMode: "normalized",
      savedAt: syncedAt,
    });
    response.json({
      ok: true,
      counts: expectedCounts,
      rowCounts: rowCounts(rows),
      beforeCounts,
      syncSummary,
      storage: "supabase",
      normalized: true,
      syncedAt,
      storageCheck,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/seed-demo-state", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const seedState = createDemoSeedState();
    const seedActor = seedState.users.find((user) => user.id === actor.id) ?? seedState.users.find(canManagePlatform) ?? actor;
    const nextState = addAuditLog(seedState, seedActor, {
      action: "admin_seed_demo_state",
      targetType: "storage",
      summary: "1차 MVP 데모 상태를 현재 저장소에 재시드했습니다.",
      metadata: { storageMode: supabase ? SUPABASE_STORAGE_MODE : "file" },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_seed_demo_state");
    const storageCheck = await buildStorageCheck({
      ...payload,
      state: nextState,
      storage: supabase ? "supabase" : "file",
      storageMode: supabase ? SUPABASE_STORAGE_MODE : "file",
      savedAt: saved.savedAt,
    });
    response.json({
      ok: true,
      seededAt: saved.savedAt,
      storage: supabase ? "supabase" : "file",
      normalized: usesNormalizedSupabase,
      counts: expectedNormalizedCounts(nextState),
      storageCheck,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rooms", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const title = String(request.body?.title ?? "").trim().slice(0, 80);
    const topic = String(request.body?.topic ?? "").trim().slice(0, 180);
    const actor = findStateUser(payload.state, actorId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!title || !topic) {
      errorResponse(response, 400, "invalid_room_payload");
      return;
    }

    const room = {
      id: uid("room"),
      title,
      topic,
      createdBy: actor.id,
      createdAt: nowLabel(),
    };
    const nextState = addAuditLog({ ...payload.state, rooms: [room, ...payload.state.rooms] }, actor, {
      action: "admin_room_create",
      targetType: "room",
      targetId: room.id,
      summary: `주제 방 "${room.title}"을 생성했습니다.`,
      metadata: { topic: room.topic },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_room_create");
    response.json({ ok: true, roomId: room.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rooms/:roomId/update", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const roomId = String(request.params.roomId ?? "");
    const title = String(request.body?.title ?? "").trim().slice(0, 80);
    const topic = String(request.body?.topic ?? "").trim().slice(0, 180);
    const actor = findStateUser(payload.state, actorId);
    const room = payload.state.rooms.find((item) => item.id === roomId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!room) {
      errorResponse(response, 404, "room_not_found");
      return;
    }
    if (!title || !topic) {
      errorResponse(response, 400, "invalid_room_payload");
      return;
    }

    const nextState = addAuditLog({
      ...payload.state,
      rooms: payload.state.rooms.map((item) => (item.id === roomId ? { ...item, title, topic } : item)),
    }, actor, {
      action: "admin_room_update",
      targetType: "room",
      targetId: roomId,
      summary: `주제 방 "${room.title}"을 수정했습니다.`,
      metadata: { title, topic },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_room_update");
    response.json({ ok: true, roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/rooms/:roomId/delete", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const roomId = String(request.params.roomId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const room = payload.state.rooms.find((item) => item.id === roomId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!room) {
      errorResponse(response, 404, "room_not_found");
      return;
    }
    if (payload.state.rooms.length <= 1) {
      errorResponse(response, 409, "cannot_delete_last_room");
      return;
    }

    const removedChannelIds = new Set(
      payload.state.channels.filter((channel) => channel.roomId === roomId).map((channel) => channel.id),
    );
    if ([...removedChannelIds].some((channelId) => judgingChannels.has(channelId))) {
      errorResponse(response, 409, "judge_in_progress");
      return;
    }

    const nextState = addAuditLog({
      ...payload.state,
      rooms: payload.state.rooms.filter((item) => item.id !== roomId),
      channels: payload.state.channels.filter((channel) => channel.roomId !== roomId),
      reports: (payload.state.reports ?? []).map((report) =>
        removedChannelIds.has(report.channelId) || removedChannelIds.has(report.targetId)
          ? { ...report, channelId: undefined, status: "resolved", resolvedAt: nowLabel(), resolvedBy: actor.id }
          : report,
      ),
    }, actor, {
      action: "admin_room_delete",
      targetType: "room",
      targetId: roomId,
      summary: `주제 방 "${room.title}"을 삭제했습니다.`,
      metadata: { removedChannels: removedChannelIds.size },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_room_delete");
    response.json({
      ok: true,
      roomId,
      removedChannelIds: [...removedChannelIds],
      savedAt: saved.savedAt,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:userId/role", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const role = String(request.body?.role ?? "");
    const targetUserId = String(request.params.userId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManageRoles(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (actor.id === target.id) {
      errorResponse(response, 400, "cannot_update_self_role");
      return;
    }
    if (!["admin", "moderator", "member"].includes(role)) {
      errorResponse(response, 400, "invalid_role");
      return;
    }

    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      users: payload.state.users.map((user) => (user.id === target.id ? { ...user, role } : user)),
    }, [
      createNotification({
        userId: target.id,
        kind: "role",
        title: "권한이 변경되었습니다",
        body: `운영진이 계정 권한을 ${roleLabels[role] ?? role}(으)로 변경했습니다.`,
        view: "profile",
      }),
    ]), actor, {
      action: "admin_user_role_update",
      targetType: "user",
      targetId: target.id,
      summary: `${target.displayName}님의 권한을 ${roleLabels[role] ?? role}(으)로 변경했습니다.`,
      metadata: { previousRole: target.role, nextRole: role },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_user_role_update");
    response.json({ ok: true, userId: target.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:userId/sanctions", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const targetUserId = String(request.params.userId ?? "");
    const type = String(request.body?.type ?? "");
    const reason = String(request.body?.reason ?? "").trim().slice(0, 160);
    const reportId = request.body?.reportId ? String(request.body.reportId) : "";
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (actor.id === target.id) {
      errorResponse(response, 400, "cannot_sanction_self");
      return;
    }
    if (actor.role !== "admin" && target.role !== "member") {
      errorResponse(response, 403, "cannot_sanction_privileged");
      return;
    }
    if (!["warning", "suspension"].includes(type) || !reason) {
      errorResponse(response, 400, "invalid_sanction_payload");
      return;
    }

    const settings = platformSettingsForState(payload.state);
    const durationHours =
      type === "suspension"
        ? Math.max(
            PLATFORM_SETTING_LIMITS.suspensionDefaultHours.min,
            Math.min(
              PLATFORM_SETTING_LIMITS.suspensionDefaultHours.max,
              Math.round(Number(request.body?.durationHours ?? settings.moderation.suspensionDefaultHours) || settings.moderation.suspensionDefaultHours),
            ),
          )
        : 0;
    const sanction = {
      id: uid("sanction"),
      userId: target.id,
      actorId: actor.id,
      type,
      reason,
      createdAt: nowLabel(),
      expiresAt: type === "suspension" ? Date.now() + durationHours * 60 * 60 * 1000 : undefined,
    };
    const sanctionLabel = type === "suspension" ? `${durationHours}시간 정지` : "경고";
    const handledAt = nowLabel();
    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      sanctions: [sanction, ...(payload.state.sanctions ?? [])],
      reports: (payload.state.reports ?? []).map((report) =>
        report.id === reportId
          ? {
              ...report,
              status: "resolved",
              assigneeId: actor.id,
              assigneeName: actor.displayName,
              assignedAt: report.assignedAt || handledAt,
              reviewMemo: reason,
              resolvedAt: handledAt,
              resolvedBy: actor.id,
              statusHistory: appendReportStatusHistory(report, "resolved", actor, reason, handledAt),
            }
          : report,
      ),
    }, [
      createNotification({
        userId: target.id,
        kind: "sanction",
        title: `운영 제재: ${sanctionLabel}`,
        body: `${sanctionLabel} 조치가 적용되었습니다. 사유: ${reason}`,
        view: "profile",
      }),
    ]), actor, {
      action: "admin_user_sanction_create",
      targetType: "user",
      targetId: target.id,
      summary: `${target.displayName}님에게 ${sanctionLabel} 조치를 적용했습니다.`,
      metadata: { type, reason, reportId, durationHours },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_user_sanction_create");
    response.json({ ok: true, sanctionId: sanction.id, userId: target.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/sanctions/:sanctionId/revoke", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const sanctionId = String(request.params.sanctionId ?? "");
    const revokedReason =
      String(request.body?.reason ?? request.body?.revokedReason ?? "").trim().slice(0, 200) || "운영자 해제";
    const actor = findStateUser(payload.state, actorId);
    const sanction = (payload.state.sanctions ?? []).find((item) => item.id === sanctionId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!sanction) {
      errorResponse(response, 404, "sanction_not_found");
      return;
    }

    const revokedAt = nowLabel();
    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      sanctions: (payload.state.sanctions ?? []).map((item) =>
        item.id === sanctionId ? { ...item, revokedAt, revokedBy: actor.id, revokedReason } : item,
      ),
    }, [
      createNotification({
        userId: sanction.userId,
        kind: "sanction",
        title: "운영 제재가 해제되었습니다",
        body: `운영진이 계정 제재를 해제했습니다. 사유: ${revokedReason}`,
        view: "profile",
      }),
    ]), actor, {
      action: "admin_user_sanction_revoke",
      targetType: "sanction",
      targetId: sanctionId,
      summary: `제재 ${sanctionId}를 해제했습니다.`,
      metadata: { userId: sanction.userId, type: sanction.type, revokedReason, revokedAt },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_user_sanction_revoke");
    response.json({ ok: true, sanctionId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:userId/claims/:claimId/verify", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const status = String(request.body?.status ?? "verified");
    const reviewMemo = sanitizeClaimText(request.body?.reviewMemo, 500);
    const targetUserId = String(request.params.userId ?? "");
    const claimId = String(request.params.claimId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!["verified", "rejected", "pending", "self_reported"].includes(status)) {
      errorResponse(response, 400, "invalid_claim_status");
      return;
    }
    const claim = (target.claims ?? []).find((item) => item.id === claimId);
    if (!claim) {
      errorResponse(response, 404, "claim_not_found");
      return;
    }
    if (status === "rejected" && !reviewMemo) {
      errorResponse(response, 400, "missing_review_memo");
      return;
    }
    const reviewedAt = new Date().toISOString();

    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      users: payload.state.users.map((user) =>
        user.id === target.id
          ? {
              ...user,
              claims: user.claims.map((claim) =>
                claim.id === claimId
                  ? {
                      ...claim,
                      status,
                      reviewerId: actor.id,
                      reviewerName: actor.displayName,
                      reviewedAt,
                      reviewMemo,
                    }
                  : claim,
              ),
            }
          : user,
      ),
    }, [
      createNotification({
        userId: target.id,
        kind: "profile",
        title: "프로필 인증 검토 결과",
        body: `${claim.label} 인증 상태가 ${claimStatusLabels[status] ?? status}(으)로 변경되었습니다.${
          reviewMemo ? ` 심사 메모: ${reviewMemo}` : ""
        }`,
        view: "profile",
      }),
    ]), actor, {
      action: "admin_claim_verify",
      targetType: "claim",
      targetId: claimId,
      summary: `${target.displayName}님의 "${claim.label}" 이력을 ${claimStatusLabels[status] ?? status} 상태로 변경했습니다.`,
      metadata: {
        userId: target.id,
        status,
        reviewerId: actor.id,
        reviewMemo,
        submittedReason: claim.submittedReason ?? "",
        evidenceText: claim.evidenceText ?? "",
        evidenceUrl: claim.evidenceUrl ?? "",
      },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_claim_verify");
    response.json({ ok: true, userId: target.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/reports/:reportId/resolve", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const nextStatus = normalizeReportStatus(request.body?.status ?? "resolved", "");
    const reviewMemo = sanitizeReportMemo(request.body?.reviewMemo ?? request.body?.memo);
    const reportId = String(request.params.reportId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const report = (payload.state.reports ?? []).find((item) => item.id === reportId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!report) {
      errorResponse(response, 404, "report_not_found");
      return;
    }
    if (!["reviewing", "resolved", "dismissed"].includes(nextStatus)) {
      errorResponse(response, 400, "invalid_report_status");
      return;
    }
    const handledAt = nowLabel();
    const isFinalStatus = nextStatus === "resolved" || nextStatus === "dismissed";
    const targetUser = findReportTargetUserForNotification(payload.state, report);
    const reportChannel = report.channelId ? findStateChannel(payload.state, report.channelId) : null;
    const notifications = [
      createNotification({
        userId: report.reporterId,
        kind: "report",
        title: `신고 상태: ${reportStatusLabels[nextStatus] ?? nextStatus}`,
        body: reviewMemo || report.reason,
        view: report.channelId ? "arena" : "admin",
        channelId: report.channelId,
        roomId: reportChannel?.roomId,
      }),
      targetUser?.id && targetUser.id !== report.reporterId
        ? createNotification({
            userId: targetUser.id,
            kind: "report",
            title: `접수된 신고 상태: ${reportStatusLabels[nextStatus] ?? nextStatus}`,
            body: reviewMemo || report.reason,
            view: report.channelId ? "arena" : "profile",
            channelId: report.channelId,
            roomId: reportChannel?.roomId,
          })
        : null,
    ];

    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      reports: (payload.state.reports ?? []).map((item) =>
        item.id === reportId
          ? {
              ...item,
              status: nextStatus,
              assigneeId: actor.id,
              assigneeName: actor.displayName,
              assignedAt: item.assignedAt || handledAt,
              reviewMemo,
              resolvedAt: isFinalStatus ? handledAt : undefined,
              resolvedBy: isFinalStatus ? actor.id : undefined,
              statusHistory: appendReportStatusHistory(item, nextStatus, actor, reviewMemo, handledAt),
            }
          : item,
      ),
    }, notifications), actor, {
      action: "admin_report_status_update",
      targetType: "report",
      targetId: reportId,
      summary: `신고 "${report.reason}"을 ${reportStatusLabels[nextStatus] ?? nextStatus} 상태로 변경했습니다.`,
      metadata: {
        targetType: report.targetType,
        targetId: report.targetId,
        channelId: report.channelId,
        status: nextStatus,
        reviewMemo,
        assigneeId: actor.id,
      },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_report_status_update");
    response.json({ ok: true, reportId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/channels/:channelId/finish", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const channelId = String(request.params.channelId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const channel = findStateChannel(payload.state, channelId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (judgingChannels.has(channelId)) {
      errorResponse(response, 409, "judge_in_progress");
      return;
    }

    const nextChannel = {
      ...channel,
      status: "finished",
      phase: "finished",
      activeSpeakerId: undefined,
      phaseEndsAt: undefined,
      turnStartedAt: undefined,
      remainingSecondsByUser: captureCrossfireClock(channel, Date.now(), platformSettingsForState(payload.state)),
    };
    const nextState = addAuditLog(replaceChannel(payload.state, channelId, nextChannel), actor, {
      action: "admin_channel_finish",
      targetType: "channel",
      targetId: channelId,
      summary: `채널 "${channel.title}"을 강제 종료했습니다.`,
      metadata: { roomId: channel.roomId, previousStatus: channel.status },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_channel_finish");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/channels/:channelId/delete", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const channelId = String(request.params.channelId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const channel = findStateChannel(payload.state, channelId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (judgingChannels.has(channelId)) {
      errorResponse(response, 409, "judge_in_progress");
      return;
    }

    const nextState = addAuditLog({
      ...payload.state,
      channels: payload.state.channels.filter((item) => item.id !== channelId),
      reports: (payload.state.reports ?? []).map((report) =>
        report.channelId === channelId || report.targetId === channelId
          ? { ...report, channelId: undefined, status: "resolved", resolvedAt: nowLabel(), resolvedBy: actor.id }
          : report,
      ),
    }, actor, {
      action: "admin_channel_delete",
      targetType: "channel",
      targetId: channelId,
      summary: `채널 "${channel.title}"을 삭제했습니다.`,
      metadata: { roomId: channel.roomId, previousStatus: channel.status },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_channel_delete");
    response.json({ ok: true, channelId, roomId: channel.roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users/:userId/profile", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const targetUserId = String(request.params.userId ?? "");
    const profile = request.body?.profile ?? {};
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (actor.id !== target.id && !canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }

    const displayName = String(profile.displayName ?? target.displayName).trim().slice(0, 24);
    const title = String(profile.title ?? target.title).trim().slice(0, 60);
    if (!displayName || !title) {
      errorResponse(response, 400, "invalid_profile_payload");
      return;
    }
    const photoInput = Object.prototype.hasOwnProperty.call(profile, "photoUrl")
      ? profile.photoUrl
      : target.photoUrl;
    const photoResult = await resolveProfilePhotoUrl(target.id, photoInput);
    if (!photoResult.ok) {
      errorResponse(
        response,
        photoResult.error === "profile_photo_upload_failed" ? 500 : 400,
        photoResult.error,
      );
      return;
    }

    const nextUser = {
      ...target,
      displayName,
      title,
      bio: String(profile.bio ?? target.bio).trim().slice(0, 600),
      photoUrl: photoResult.photoUrl,
      accentColor: isAllowedProfileStyle(String(profile.accentColor ?? target.accentColor), ["blue", "mint", "violet", "amber", "rose"], target.accentColor ?? "blue"),
      profileFrame: isAllowedProfileStyle(String(profile.profileFrame ?? target.profileFrame), ["clean", "solid", "glow"], target.profileFrame ?? "clean"),
      bannerStyle: isAllowedProfileStyle(String(profile.bannerStyle ?? target.bannerStyle), ["plain", "gradient", "midnight"], target.bannerStyle ?? "plain"),
      featuredBadge: String(profile.featuredBadge ?? target.featuredBadge).trim().slice(0, 32) || "신규 토론러",
      claims: sanitizeProfileClaims(profile.claims, target.claims, {
        preserveSubmittedStatus: canManagePlatform(actor),
      }),
    };
    const baseNextState = {
      ...payload.state,
      users: payload.state.users.map((user) => (user.id === target.id ? nextUser : user)),
      currentUserId: payload.state.currentUserId,
    };
    const nextState =
      actor.id === target.id
        ? baseNextState
        : addAuditLog(baseNextState, actor, {
            action: "admin_profile_update",
            targetType: "user",
            targetId: target.id,
            summary: `${target.displayName}님의 프로필을 운영자가 수정했습니다.`,
            metadata: { displayName, title },
          });
    const saved = await writeStateAndBroadcast(nextState, "profile_update");
    response.json({ ok: true, userId: target.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users/:userId/claims/:claimId/request-verification", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const submittedReason = sanitizeClaimText(request.body?.reason, 300);
    const evidenceText = sanitizeClaimText(request.body?.evidenceText, 1000);
    const evidenceUrl = sanitizeClaimEvidenceUrl(request.body?.evidenceUrl);
    const targetUserId = String(request.params.userId ?? "");
    const claimId = String(request.params.claimId ?? "");
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (actor.id !== target.id && !canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const claim = (target.claims ?? []).find((item) => item.id === claimId);
    if (!claim) {
      errorResponse(response, 404, "claim_not_found");
      return;
    }
    if (claim.status === "verified") {
      response.json({ ok: true, userId: target.id, state: sanitizeState(payload.state), alreadyVerified: true });
      return;
    }
    if (!submittedReason) {
      errorResponse(response, 400, "missing_claim_reason");
      return;
    }
    if (evidenceUrl === null) {
      errorResponse(response, 400, "invalid_claim_evidence");
      return;
    }
    const submittedAt = new Date().toISOString();

    const nextState = notifyPlatformManagers({
      ...payload.state,
      users: payload.state.users.map((user) =>
        user.id === target.id
          ? {
              ...user,
              claims: user.claims.map((item) =>
                item.id === claimId
                  ? {
                      ...item,
                      status: "pending",
                      submittedReason,
                      evidenceText,
                      evidenceUrl,
                      submittedAt,
                      reviewerId: "",
                      reviewerName: "",
                      reviewedAt: "",
                      reviewMemo: "",
                    }
                  : item,
              ),
            }
          : user,
      ),
    }, {
      kind: "profile",
      title: "프로필 인증 요청",
      body: `${target.displayName}님이 ${claim.label} 인증 검토를 요청했습니다. 사유: ${submittedReason}`,
      view: "admin",
    }, actor.id);
    const saved = await writeStateAndBroadcast(nextState, "claim_verification_request");
    response.json({ ok: true, userId: target.id, claimId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/:userId/data-export", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.params.userId ?? "");
    const user = requireSessionUser(request, response, payload.state);
    if (!user) return;
    if (user.id !== userId) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    response.json(buildUserDataExport(payload.state, user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/users/:userId/privacy/delete-request", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.params.userId ?? "");
    const reason = String(request.body?.reason ?? "").trim().slice(0, 500);
    const user = requireSessionUser(request, response, payload.state);
    if (!user) return;
    if (user.id !== userId) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    const existingRequest = jsonArray(payload.state.privacyRequests).find(
      (item) => item.userId === user.id && ["pending", "reviewing"].includes(item.status),
    );
    if (existingRequest) {
      response.json({
        ok: true,
        requestId: existingRequest.id,
        alreadyOpen: true,
        state: sanitizeState(payload.state),
      });
      return;
    }
    const privacyRequest = normalizePrivacyRequest({
      id: uid("privacy"),
      userId: user.id,
      userName: user.displayName,
      reason: reason || "사용자 삭제 요청",
      status: "pending",
      createdAt: nowLabel(),
    });
    let nextState = notifyPlatformManagers({
      ...payload.state,
      privacyRequests: [privacyRequest, ...jsonArray(payload.state.privacyRequests)],
    }, {
      kind: "system",
      title: "개인정보 삭제 요청 접수",
      body: `${user.displayName}님이 계정 데이터 삭제 요청을 접수했습니다.`,
      view: "admin",
    }, user.id);
    nextState = addAuditLog(nextState, user, {
      action: "privacy_delete_request_create",
      targetType: "privacy_request",
      targetId: privacyRequest.id,
      summary: `${user.displayName}님이 개인정보 삭제 요청을 접수했습니다.`,
      metadata: { reason: privacyRequest.reason },
    });
    const saved = await writeStateAndBroadcast(nextState, "privacy_delete_request_create");
    response.json({ ok: true, requestId: privacyRequest.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/privacy-requests/:requestId/resolve", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const requestId = String(request.params.requestId ?? "");
    const actorId = String(request.body?.actorId ?? "");
    const nextStatus = String(request.body?.status ?? "resolved");
    const reviewMemo = String(request.body?.reviewMemo ?? "").trim().slice(0, 500);
    const actor = findStateUser(payload.state, actorId);
    const privacyRequest = jsonArray(payload.state.privacyRequests).find((item) => item.id === requestId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!privacyRequest) {
      errorResponse(response, 404, "privacy_request_not_found");
      return;
    }
    if (!["reviewing", "resolved", "dismissed"].includes(nextStatus)) {
      errorResponse(response, 400, "invalid_privacy_request_status");
      return;
    }
    if ((nextStatus === "resolved" || nextStatus === "dismissed") && !reviewMemo) {
      errorResponse(response, 400, "missing_review_memo");
      return;
    }
    const handledAt = nowLabel();
    const nextRequest = normalizePrivacyRequest({
      ...privacyRequest,
      status: nextStatus,
      reviewedAt: handledAt,
      reviewerId: actor.id,
      reviewerName: actor.displayName,
      reviewMemo,
    });
    const finalStatus = nextStatus === "resolved" || nextStatus === "dismissed";
    const notification = finalStatus
      ? createNotification({
          userId: privacyRequest.userId,
          kind: "system",
          title: `개인정보 삭제 요청: ${nextStatus === "resolved" ? "처리 완료" : "보류/기각"}`,
          body: reviewMemo,
          view: "profile",
        })
      : null;
    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      privacyRequests: jsonArray(payload.state.privacyRequests).map((item) =>
        item.id === requestId ? nextRequest : item,
      ),
    }, [notification]), actor, {
      action: "admin_privacy_request_update",
      targetType: "privacy_request",
      targetId: requestId,
      summary: `${privacyRequest.userName || privacyRequest.userId}님의 개인정보 요청을 ${nextStatus} 상태로 변경했습니다.`,
      metadata: { nextStatus, reviewMemo },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_privacy_request_update");
    response.json({ ok: true, requestId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/shop/purchase", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.body?.userId ?? "");
    const itemId = String(request.body?.itemId ?? "");
    const user = findStateUser(payload.state, userId);
    const item = shopItems.find((shopItem) => shopItem.id === itemId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!item) {
      errorResponse(response, 404, "shop_item_not_found");
      return;
    }
    const ownedItemIds = Array.isArray(user.ownedItemIds) ? user.ownedItemIds : [];
    if (ownedItemIds.includes(item.id)) {
      errorResponse(response, 409, "shop_item_already_owned");
      return;
    }
    if (Number(user.coins ?? 0) < item.price) {
      errorResponse(response, 409, "insufficient_coins");
      return;
    }

    const nextUser = {
      ...user,
      coins: Number(user.coins ?? 0) - item.price,
      ownedItemIds: [...ownedItemIds, item.id],
      featuredBadge: item.category === "badge" ? item.name : user.featuredBadge,
      profileFrame: item.id === "profile_glow" ? "glow" : user.profileFrame,
    };
    const ledgerItem = {
      id: uid("ledger"),
      type: "shop_purchase",
      userId: user.id,
      amount: -item.price,
      memo: `상점 구매: ${item.name}`,
      createdAt: nowLabel(),
    };
    const nextState = addNotifications({
      ...payload.state,
      users: payload.state.users.map((stateUser) => (stateUser.id === user.id ? nextUser : stateUser)),
      ledger: [...payload.state.ledger, ledgerItem],
      currentUserId: payload.state.currentUserId,
    }, [
      createNotification({
        userId: user.id,
        kind: "shop",
        title: "상점 구매 완료",
        body: `${item.name} 아이템을 구매했습니다. ${item.price}코인이 차감되었습니다.`,
        view: "wallet",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "shop_purchase");
    response.json({ ok: true, userId: user.id, itemId: item.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:userId/coins", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const actorId = String(request.body?.actorId ?? "");
    const targetUserId = String(request.params.userId ?? "");
    const amount = Math.round(Number(request.body?.amount ?? 0));
    const reason = String(request.body?.reason ?? "").trim().slice(0, 200);
    const actor = findStateUser(payload.state, actorId);
    const target = findStateUser(payload.state, targetUserId);
    if (!actor || !target) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (actor.role !== "admin") {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) {
      errorResponse(response, 400, "invalid_coin_adjustment");
      return;
    }
    if (!reason) {
      errorResponse(response, 400, "missing_adjustment_reason");
      return;
    }
    const previousCoins = Number(target.coins ?? 0);
    const nextCoins = previousCoins + amount;
    if (nextCoins < 0) {
      errorResponse(response, 409, "negative_coin_balance");
      return;
    }
    const handledAt = nowLabel();
    const ledgerItem = {
      id: uid("ledger"),
      type: "admin_grant",
      userId: target.id,
      amount,
      memo: `운영자 수동 조정: ${reason}`,
      createdAt: handledAt,
    };
    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      users: payload.state.users.map((user) => (user.id === target.id ? { ...user, coins: nextCoins } : user)),
      ledger: [...payload.state.ledger, ledgerItem],
    }, [
      createNotification({
        userId: target.id,
        kind: "shop",
        title: amount > 0 ? "코인이 지급되었습니다" : "코인이 차감되었습니다",
        body: `${Math.abs(amount).toLocaleString()}코인 ${amount > 0 ? "지급" : "차감"} · 사유: ${reason}`,
        view: "wallet",
      }),
    ]), actor, {
      action: "admin_coin_adjust",
      targetType: "user",
      targetId: target.id,
      summary: `${target.displayName}님의 코인을 ${amount > 0 ? "지급" : "차감"}했습니다.`,
      metadata: { amount, reason, previousCoins, nextCoins },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_coin_adjust");
    response.json({ ok: true, userId: target.id, amount, balance: nextCoins, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/notifications/read-all", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    const readAt = nowLabel();
    const nextState = {
      ...payload.state,
      notifications: jsonArray(payload.state.notifications).map((notification) =>
        notification.userId === user.id && !notification.readAt
          ? { ...notification, readAt }
          : notification,
      ),
      currentUserId: payload.state.currentUserId,
    };
    const saved = await writeStateAndBroadcast(nextState, "notifications_read_all");
    response.json({ ok: true, userId: user.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/notifications/:notificationId/read", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.body?.userId ?? "");
    const notificationId = String(request.params.notificationId ?? "");
    const user = findStateUser(payload.state, userId);
    const notification = jsonArray(payload.state.notifications).find((item) => item.id === notificationId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!notification) {
      errorResponse(response, 404, "notification_not_found");
      return;
    }
    if (notification.userId !== user.id) {
      errorResponse(response, 403, "not_notification_owner");
      return;
    }
    const nextState = {
      ...payload.state,
      notifications: jsonArray(payload.state.notifications).map((item) =>
        item.id === notificationId && !item.readAt ? { ...item, readAt: nowLabel() } : item,
      ),
      currentUserId: payload.state.currentUserId,
    };
    const saved = await writeStateAndBroadcast(nextState, "notification_read");
    response.json({ ok: true, notificationId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", async (request, response, next) => {
  try {
    const state = request.body?.state;
    if (!looksLikeAppState(state)) {
      response.status(400).json({ error: "Invalid app state payload" });
      return;
    }
    const currentPayload = await readState();
    if (!currentPayload?.state && !OPEN_STATE_WRITE_ENABLED) {
      errorResponse(response, 403, "state_write_disabled");
      return;
    }
    if (currentPayload?.state) {
      const actor = requireSessionUser(request, response, currentPayload.state);
      if (!actor) return;
      if (!canManagePlatform(actor)) {
        errorResponse(response, 403, "not_authorized");
        return;
      }
      if (!validateCsrfRequest(request, response)) return;
    }
    const stateWithSecrets = preserveUserSecrets(state, currentPayload?.state);
    const saved = await writeStateAndBroadcast(stateWithSecrets, "state_put");
    response.json({
      ok: true,
      savedAt: saved.savedAt,
      storage: supabase ? "supabase" : "file",
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

function buildInviteCode(channels) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `NB-${Math.floor(1000 + Math.random() * 9000)}`;
    if (
      !channels.some(
        (channel) => channel.inviteCode === code || jsonArray(channel.disabledInviteCodes).includes(code),
      )
    ) return code;
  }
  return `NB-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function canManageChannelInvite(user, channel) {
  return Boolean(user && channel && (channel.createdBy === user.id || canManagePlatform(user)));
}

function findStateUser(state, userId) {
  return state.users.find((user) => user.id === userId);
}

function buildUserDataExport(state, user) {
  const exportedAt = new Date().toISOString();
  const channels = jsonArray(state.channels)
    .filter((channel) =>
      channel.createdBy === user.id ||
      jsonArray(channel.participantIds).includes(user.id) ||
      jsonArray(channel.spectatorIds).includes(user.id) ||
      jsonArray(channel.debateMessages).some((message) => message.authorId === user.id) ||
      jsonArray(channel.spectatorMessages).some((message) => message.authorId === user.id) ||
      jsonArray(channel.votes).some((vote) => vote.voterId === user.id || vote.targetUserId === user.id),
    )
    .map((channel) => ({
      id: channel.id,
      roomId: channel.roomId,
      title: channel.title,
      topic: channel.topic,
      visibility: channel.visibility,
      status: channel.status,
      createdBy: channel.createdBy === user.id ? user.id : "",
      createdAt: channel.createdAt,
      participantIds: jsonArray(channel.participantIds).filter((participantId) => participantId === user.id),
      spectatorIds: jsonArray(channel.spectatorIds).filter((spectatorId) => spectatorId === user.id),
      debateMessages: jsonArray(channel.debateMessages).filter((message) => message.authorId === user.id),
      spectatorMessages: jsonArray(channel.spectatorMessages).filter((message) => message.authorId === user.id),
      votes: jsonArray(channel.votes).filter((vote) => vote.voterId === user.id || vote.targetUserId === user.id),
      reactions: jsonArray(channel.reactions).filter((reaction) => reaction.userId === user.id || reaction.targetUserId === user.id),
      finalResult: jsonArray(channel.participantIds).includes(user.id) ? channel.finalResult : undefined,
    }));
  return {
    ok: true,
    exportedAt,
    filename: `nosu-best-user-data-${user.id}-${exportedAt.slice(0, 10)}.json`,
    user: sanitizeUser(user),
    ledger: jsonArray(state.ledger).filter((item) => item.userId === user.id),
    notifications: jsonArray(state.notifications).filter((notification) => notification.userId === user.id),
    reports: jsonArray(state.reports).filter(
      (report) => report.reporterId === user.id || (report.targetType === "user" && report.targetId === user.id),
    ),
    sanctions: jsonArray(state.sanctions).filter((sanction) => sanction.userId === user.id),
    aiAppeals: jsonArray(state.aiAppeals).filter((appeal) => appeal.userId === user.id),
    privacyRequests: jsonArray(state.privacyRequests).filter((request) => request.userId === user.id),
    channels,
  };
}

function findStateChannel(state, channelId) {
  return state.channels.find((channel) => channel.id === channelId);
}

function elapsedSeconds(startedAt, nowMs = Date.now()) {
  return startedAt ? Math.max(0, (nowMs - startedAt) / 1000) : 0;
}

function activeRemainingSeconds(channel, userId, nowMs = Date.now(), settings = DEFAULT_PLATFORM_SETTINGS) {
  const debateSettings = settings?.debate ?? DEFAULT_PLATFORM_SETTINGS.debate;
  if (channel.phase === "opening" || channel.phase === "closing") {
    if (channel.activeSpeakerId !== userId) {
      return channel.phase === "opening" ? debateSettings.openingSeconds : debateSettings.closingSeconds;
    }
    return Math.max(0, ((channel.phaseEndsAt ?? nowMs) - nowMs) / 1000);
  }

  const base = channel.remainingSecondsByUser?.[userId] ?? debateSettings.crossfireSeconds;
  if (channel.phase !== "crossfire" || channel.activeSpeakerId !== userId) return base;
  return Math.max(0, base - elapsedSeconds(channel.turnStartedAt, nowMs));
}

function captureCrossfireClock(channel, nowMs = Date.now(), settings = DEFAULT_PLATFORM_SETTINGS) {
  const remainingSecondsByUser = { ...(channel.remainingSecondsByUser ?? {}) };
  if (channel.phase !== "crossfire" || !channel.activeSpeakerId) return remainingSecondsByUser;
  return {
    ...remainingSecondsByUser,
    [channel.activeSpeakerId]: Math.max(
      0,
      activeRemainingSeconds(channel, channel.activeSpeakerId, nowMs, settings),
    ),
  };
}

function advanceDebateChannel(channel, nowMs = Date.now(), settings = DEFAULT_PLATFORM_SETTINGS) {
  const debateSettings = settings?.debate ?? DEFAULT_PLATFORM_SETTINGS.debate;
  const [firstId, secondId] = channel.participantIds;
  if (!firstId || !secondId) return channel;

  if (channel.phase === "ready") {
    return {
      ...channel,
      status: "live",
      phase: "opening",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + debateSettings.openingSeconds * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "opening" && channel.activeSpeakerId === firstId) {
    return {
      ...channel,
      activeSpeakerId: secondId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + debateSettings.openingSeconds * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "opening") {
    return {
      ...channel,
      phase: "crossfire",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: undefined,
      turnStartedAt: nowMs,
      remainingSecondsByUser: {
        ...(channel.remainingSecondsByUser ?? {}),
        [firstId]: channel.remainingSecondsByUser?.[firstId] ?? debateSettings.crossfireSeconds,
        [secondId]: channel.remainingSecondsByUser?.[secondId] ?? debateSettings.crossfireSeconds,
      },
    };
  }

  if (channel.phase === "crossfire") {
    return {
      ...channel,
      phase: "closing",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + debateSettings.closingSeconds * 1000,
      turnStartedAt: nowMs,
      remainingSecondsByUser: captureCrossfireClock(channel, nowMs, settings),
    };
  }

  if (channel.phase === "closing" && channel.activeSpeakerId === firstId) {
    return {
      ...channel,
      activeSpeakerId: secondId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + debateSettings.closingSeconds * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "closing") {
    return {
      ...channel,
      status: "voting",
      phase: "voting",
      activeSpeakerId: undefined,
      phaseStartedAt: nowMs,
      phaseEndsAt: undefined,
      turnStartedAt: undefined,
    };
  }

  return channel;
}

function passDebateTurn(channel, nowMs = Date.now(), settings = DEFAULT_PLATFORM_SETTINGS) {
  if (channel.phase !== "crossfire" || !channel.activeSpeakerId) return channel;
  const nextSpeakerId = channel.participantIds.find((participantId) => participantId !== channel.activeSpeakerId);
  if (!nextSpeakerId) return channel;
  return {
    ...channel,
    activeSpeakerId: nextSpeakerId,
    turnStartedAt: nowMs,
    remainingSecondsByUser: captureCrossfireClock(channel, nowMs, settings),
  };
}

function advanceChannelIfExpired(channel, nowMs = Date.now(), settings = DEFAULT_PLATFORM_SETTINGS) {
  if (channel.status !== "live") return { channel, advanced: false };

  if ((channel.phase === "opening" || channel.phase === "closing") && channel.phaseEndsAt && channel.phaseEndsAt <= nowMs) {
    return { channel: advanceDebateChannel(channel, nowMs, settings), advanced: true };
  }

  if (channel.phase === "crossfire" && channel.activeSpeakerId) {
    const activeRemaining = activeRemainingSeconds(channel, channel.activeSpeakerId, nowMs, settings);
    if (activeRemaining <= 0) {
      return { channel: advanceDebateChannel(channel, nowMs, settings), advanced: true };
    }
  }

  return { channel, advanced: false };
}

function canControlDebate(user, channel) {
  return Boolean(user && channel.participantIds.includes(user.id));
}

function canForceVoting(user, channel) {
  return Boolean(
    user &&
      (user.role === "admin" ||
        user.role === "moderator" ||
        (user.role !== "member" && channel.participantIds.includes(user.id))),
  );
}

function canFinalizeDebate(user, channel) {
  if (isPendingAiJudgement(channel)) {
    return canManagePlatform(user);
  }
  return Boolean(
    user &&
      (user.role === "admin" ||
        user.role === "moderator" ||
        channel.participantIds.includes(user.id)),
  );
}

function canManagePlatform(user) {
  if (!isActiveUser(user) || !["admin", "moderator"].includes(user.role)) return false;
  if (!IS_PRODUCTION_RUNTIME) return true;
  if (!PLATFORM_ADMIN_ALLOWLIST_CONFIGURED) return false;
  return PLATFORM_ADMIN_USER_IDS.has(user.id) || PLATFORM_ADMIN_LOGIN_IDS.has(user.loginId);
}

function canManageRoles(user) {
  return Boolean(canManagePlatform(user) && user.role === "admin");
}

function isSanctionActive(sanction, nowMs = Date.now()) {
  if (!sanction || sanction.revokedAt) return false;
  if (sanction.expiresAt === undefined || sanction.expiresAt === null) {
    return sanction.type !== "suspension";
  }
  return Number(sanction.expiresAt) > nowMs;
}

function getActiveSuspension(state, userId, nowMs = Date.now()) {
  return (state.sanctions ?? []).find(
    (sanction) => sanction.userId === userId && sanction.type === "suspension" && isSanctionActive(sanction, nowMs),
  );
}

function isUserSuspended(state, userId) {
  return Boolean(getActiveSuspension(state, userId));
}

function ensureUserCanInteract(response, state, user) {
  if (!isUserSuspended(state, user.id)) return true;
  errorResponse(response, 403, "user_suspended");
  return false;
}

function canSpectatorInteract(user, channel) {
  return Boolean(user && channel.spectatorIds.includes(user.id) && !channel.participantIds.includes(user.id));
}

function isAllowedProfileStyle(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function sanitizeClaimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sanitizeClaimEvidenceUrl(value) {
  const trimmed = sanitizeClaimText(value, 500);
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function sanitizeClaimReviewMetadata(source) {
  const evidenceUrl = sanitizeClaimEvidenceUrl(source?.evidenceUrl);
  return {
    submittedReason: sanitizeClaimText(source?.submittedReason, 300),
    evidenceText: sanitizeClaimText(source?.evidenceText, 1000),
    evidenceUrl: evidenceUrl ?? "",
    submittedAt: sanitizeClaimText(source?.submittedAt, 64),
    reviewerId: sanitizeClaimText(source?.reviewerId, 64),
    reviewerName: sanitizeClaimText(source?.reviewerName, 80),
    reviewedAt: sanitizeClaimText(source?.reviewedAt, 64),
    reviewMemo: sanitizeClaimText(source?.reviewMemo, 500),
  };
}

function sanitizeProfileClaims(nextClaims, previousClaims, { preserveSubmittedStatus = false } = {}) {
  const previousById = new Map((previousClaims ?? []).map((claim) => [claim.id, claim]));
  const seenIds = new Set();
  return (Array.isArray(nextClaims) ? nextClaims : [])
    .map((claim) => {
      const label = String(claim?.label ?? "").trim().slice(0, 24);
      const value = String(claim?.value ?? "").trim().slice(0, 80);
      if (!label || !value) return null;
      const rawId = String(claim?.id ?? "").trim();
      const previous = previousById.get(rawId);
      const id = previous && !seenIds.has(previous.id) ? previous.id : uid("claim");
      seenIds.add(id);
      const previousUnchanged = previous?.label === label && previous?.value === value;
      const submittedStatus = String(claim?.status ?? "");
      const status =
        preserveSubmittedStatus && ["verified", "pending", "self_reported", "rejected"].includes(submittedStatus)
          ? submittedStatus
          : previousUnchanged
            ? previous.status
            : "self_reported";
      const metadataSource = previousUnchanged
        ? {
            ...previous,
            evidenceText: claim?.evidenceText ?? previous?.evidenceText,
            evidenceUrl: claim?.evidenceUrl ?? previous?.evidenceUrl,
          }
        : claim;
      const reviewMetadata = sanitizeClaimReviewMetadata(metadataSource);
      if (!previousUnchanged) {
        reviewMetadata.submittedReason = "";
        reviewMetadata.submittedAt = "";
        reviewMetadata.reviewerId = "";
        reviewMetadata.reviewerName = "";
        reviewMetadata.reviewedAt = "";
        reviewMetadata.reviewMemo = "";
      }
      return { id, label, value, status, ...reviewMetadata };
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function resolveProfilePhotoUrl(userId, photoUrl) {
  const value = String(photoUrl ?? "").trim();
  if (!value) return { ok: true, photoUrl: "" };
  if (!value.startsWith("data:image/")) {
    return { ok: true, photoUrl: value.slice(0, 2000) };
  }
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, error: "invalid_profile_photo" };
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_PROFILE_PHOTO_BYTES) {
    return { ok: false, error: "profile_photo_too_large" };
  }
  if (!supabase) {
    return { ok: true, photoUrl: value };
  }

  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  }[mimeType];
  if (!extension) return { ok: false, error: "invalid_profile_photo" };

  try {
    const bucketResult = await supabase.storage.createBucket(PROFILE_PHOTO_BUCKET, {
      public: true,
      fileSizeLimit: MAX_PROFILE_PHOTO_BYTES,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
    if (
      bucketResult.error &&
      !String(bucketResult.error.message ?? "").toLowerCase().includes("already exists")
    ) {
      throw bucketResult.error;
    }
    const storagePath = `${userId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(storagePath);
    return { ok: true, photoUrl: data.publicUrl };
  } catch (error) {
    console.warn("Profile photo upload failed:", error?.message ?? error);
    return { ok: false, error: "profile_photo_upload_failed" };
  }
}

function channelActionPayload(saved, channel) {
  return {
    ok: true,
    channelId: channel.id,
    roomId: channel.roomId,
    savedAt: saved.savedAt,
    state: saved.state,
  };
}

function replaceChannel(state, channelId, nextChannel) {
  return {
    ...state,
    channels: state.channels.map((channel) => (channel.id === channelId ? nextChannel : channel)),
  };
}

app.post("/api/channels", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const roomId = String(request.body?.roomId ?? "");
    const title = String(request.body?.title ?? "").trim();
    const visibility = String(request.body?.visibility ?? "public");
    const format = String(request.body?.format ?? "text");
    const settings = platformSettingsForState(payload.state);
    const requestedCoinStake = Number(request.body?.coinStake ?? settings.debate.defaultCoinStake);
    const coinStake = Math.max(
      PLATFORM_SETTING_LIMITS.defaultCoinStake.min,
      Math.min(
        PLATFORM_SETTING_LIMITS.defaultCoinStake.max,
        Math.round(Number.isFinite(requestedCoinStake) ? requestedCoinStake : settings.debate.defaultCoinStake),
      ),
    );
    const userId = String(request.body?.userId ?? "");
    const creator = findStateUser(payload.state, userId);
    const room = payload.state.rooms.find((item) => item.id === roomId);
    if (!creator) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, creator)) return;
    if (!room) {
      errorResponse(response, 404, "room_not_found");
      return;
    }
    if (!title || !["public", "private"].includes(visibility) || !["text", "voice"].includes(format)) {
      errorResponse(response, 400, "invalid_channel_payload");
      return;
    }

    const channel = {
      id: uid("debate"),
      roomId,
      title,
      visibility,
      inviteCode: visibility === "private" ? buildInviteCode(payload.state.channels) : undefined,
      disabledInviteCodes: [],
      format,
      status: "waiting",
      phase: "ready",
      createdBy: creator.id,
      participantLimit: 2,
      participantIds: [creator.id],
      readyUserIds: [],
      participantSnapshots: { [creator.id]: snapshotUser(creator) },
      stanceByUser: { [creator.id]: "agree" },
      activeSpeakerId: undefined,
      phaseStartedAt: undefined,
      phaseEndsAt: undefined,
      turnStartedAt: undefined,
      remainingSecondsByUser: { [creator.id]: settings.debate.crossfireSeconds },
      voiceStateByUser: { [creator.id]: { muted: true, handRaised: false, updatedAt: nowLabel() } },
      spectatorIds: [],
      debateMessages: [],
      spectatorMessages: [],
      votes: [],
      reactions: [],
      coinStake,
      createdAt: nowLabel(),
    };
    const nextState = { ...payload.state, channels: [channel, ...payload.state.channels] };
    const saved = await writeStateAndBroadcast(nextState, "channel_create");
    response.json({ ok: true, channelId: channel.id, roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

function addParticipantToChannel(channel, user, { allowPrivate = false, crossfireSeconds = CROSSFIRE_SECONDS } = {}) {
  if (channel.participantIds.includes(user.id)) return { ok: true, channel };
  if (channel.status !== "waiting" || channel.phase !== "ready") return { ok: false, error: "channel_not_joinable" };
  if (channel.visibility === "private" && !allowPrivate) return { ok: false, error: "private_channel_requires_code" };
  if (channel.participantIds.length >= channel.participantLimit) return { ok: false, error: "channel_full" };
  return {
    ok: true,
    channel: {
      ...channel,
      spectatorIds: channel.spectatorIds.filter((spectatorId) => spectatorId !== user.id),
      participantIds: [...channel.participantIds, user.id],
      readyUserIds: (channel.readyUserIds ?? []).filter((participantId) =>
        channel.participantIds.includes(participantId),
      ),
      stanceByUser: {
        ...channel.stanceByUser,
        [user.id]: channel.participantIds.length === 0 ? "agree" : "disagree",
      },
      remainingSecondsByUser: {
        ...channel.remainingSecondsByUser,
        [user.id]: crossfireSeconds,
      },
      voiceStateByUser: {
        ...(channel.voiceStateByUser ?? {}),
        [user.id]: { muted: true, handRaised: false, updatedAt: nowLabel() },
      },
      participantSnapshots: {
        ...channel.participantSnapshots,
        [user.id]: snapshotUser(user),
      },
    },
  };
}

function removeVoiceUserFromSession(channelId, userId) {
  const session = voiceSessions.get(channelId);
  if (!session?.has(userId)) return;
  const peer = session.get(userId);
  session.delete(userId);
  const targetSocket = io.sockets.sockets.get(peer.socketId);
  targetSocket?.leave(voiceRoomKey(channelId));
  if (targetSocket) {
    targetSocket.to(voiceRoomKey(channelId)).emit("voice:peer-left", { channelId, userId: peer.userId });
  } else {
    io.to(voiceRoomKey(channelId)).emit("voice:peer-left", { channelId, userId: peer.userId });
  }
  if (session.size === 0) voiceSessions.delete(channelId);
}

app.post("/api/channels/:channelId/join", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = payload.state.channels.find((item) => item.id === channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    const settings = platformSettingsForState(payload.state);
    const result = addParticipantToChannel(channel, user, { crossfireSeconds: settings.debate.crossfireSeconds });
    if (!result.ok) {
      errorResponse(response, result.error === "channel_full" ? 409 : 400, result.error);
      return;
    }
    const nextState = {
      ...payload.state,
      channels: payload.state.channels.map((item) => (item.id === channelId ? result.channel : item)),
    };
    const saved = await writeStateAndBroadcast(nextState, "channel_join");
    response.json({ ok: true, channelId, roomId: channel.roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/channels/join-code", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const code = String(request.body?.code ?? "").trim().toUpperCase();
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = payload.state.channels.find((item) => item.inviteCode === code);
    const inactiveChannel = payload.state.channels.find((item) => jsonArray(item.disabledInviteCodes).includes(code));
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      if (inactiveChannel) {
        errorResponse(response, 410, "inactive_invite_code");
        return;
      }
      errorResponse(response, 404, "invalid_invite_code");
      return;
    }
    const settings = platformSettingsForState(payload.state);
    const result = addParticipantToChannel(channel, user, {
      allowPrivate: true,
      crossfireSeconds: settings.debate.crossfireSeconds,
    });
    if (!result.ok) {
      errorResponse(response, result.error === "channel_full" ? 409 : 400, result.error);
      return;
    }
    const nextState = {
      ...payload.state,
      channels: payload.state.channels.map((item) => (item.id === channel.id ? result.channel : item)),
    };
    const saved = await writeStateAndBroadcast(nextState, "channel_join_code");
    response.json({ ok: true, channelId: channel.id, roomId: channel.roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/channels/:channelId/invite-code", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const actorId = String(request.body?.actorId ?? "");
    const action = String(request.body?.action ?? "").trim();
    const actor = findStateUser(payload.state, actorId);
    const channel = payload.state.channels.find((item) => item.id === channelId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canManageChannelInvite(actor, channel)) {
      errorResponse(response, 403, "not_channel_manager");
      return;
    }
    if (channel.visibility !== "private") {
      errorResponse(response, 400, "channel_invite_not_available");
      return;
    }
    if (!["regenerate", "disable"].includes(action)) {
      errorResponse(response, 400, "invalid_channel_payload");
      return;
    }

    const disabledInviteCodes = [
      ...new Set(
        [
          ...jsonArray(channel.disabledInviteCodes),
          ...(channel.inviteCode ? [channel.inviteCode] : []),
        ]
          .map((code) => String(code).trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const nextChannel =
      action === "regenerate"
        ? { ...channel, inviteCode: buildInviteCode(payload.state.channels), disabledInviteCodes }
        : { ...channel, inviteCode: undefined, disabledInviteCodes };
    const nextState = addAuditLog(replaceChannel(payload.state, channelId, nextChannel), actor, {
      action: action === "regenerate" ? "channel_invite_regenerate" : "channel_invite_disable",
      targetType: "channel",
      targetId: channelId,
      summary:
        action === "regenerate"
          ? `${channel.title} 채널의 비공개 입장 코드를 재생성했습니다.`
          : `${channel.title} 채널의 비공개 입장 코드를 비활성화했습니다.`,
      metadata: {
        roomId: channel.roomId,
        previousActive: Boolean(channel.inviteCode),
        nextActive: action === "regenerate",
      },
    });
    const saved = await writeStateAndBroadcast(nextState, `channel_invite_${action}`);
    response.json({
      ok: true,
      channelId,
      roomId: channel.roomId,
      inviteCode: nextChannel.inviteCode,
      savedAt: saved.savedAt,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/channels/:channelId/spectate", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = payload.state.channels.find((item) => item.id === channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    const nextChannel =
      channel.participantIds.includes(user.id) || channel.spectatorIds.includes(user.id)
        ? channel
        : { ...channel, spectatorIds: [...channel.spectatorIds, user.id] };
    const nextState = {
      ...payload.state,
      channels: payload.state.channels.map((item) => (item.id === channelId ? nextChannel : item)),
    };
    const saved = await writeStateAndBroadcast(nextState, "channel_spectate");
    response.json({ ok: true, channelId, roomId: channel.roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/channels/:channelId/leave", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = payload.state.channels.find((item) => item.id === channelId);
    const actor = requireSessionUser(request, response, payload.state);
    if (!actor) return;
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (actor.id !== user.id && !canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }

    const isParticipant = channel.participantIds.includes(user.id);
    const isSpectator = channel.spectatorIds.includes(user.id);
    if (!isParticipant && !isSpectator) {
      errorResponse(response, 400, "not_channel_member");
      return;
    }
    if (isParticipant && (channel.status !== "waiting" || channel.phase !== "ready")) {
      errorResponse(response, 409, "channel_leave_locked");
      return;
    }

    const nextParticipantSnapshots = { ...(channel.participantSnapshots ?? {}) };
    const nextStanceByUser = { ...(channel.stanceByUser ?? {}) };
    const nextRemainingSecondsByUser = { ...(channel.remainingSecondsByUser ?? {}) };
    const nextVoiceStateByUser = { ...(channel.voiceStateByUser ?? {}) };
    if (isParticipant) {
      delete nextParticipantSnapshots[user.id];
      delete nextStanceByUser[user.id];
      delete nextRemainingSecondsByUser[user.id];
      delete nextVoiceStateByUser[user.id];
    }

    const nextChannel = {
      ...channel,
      participantIds: isParticipant
        ? channel.participantIds.filter((participantId) => participantId !== user.id)
        : channel.participantIds,
      readyUserIds: (channel.readyUserIds ?? []).filter((participantId) => participantId !== user.id),
      spectatorIds: channel.spectatorIds.filter((spectatorId) => spectatorId !== user.id),
      participantSnapshots: nextParticipantSnapshots,
      stanceByUser: nextStanceByUser,
      remainingSecondsByUser: nextRemainingSecondsByUser,
      voiceStateByUser: nextVoiceStateByUser,
      reactions: (channel.reactions ?? []).filter((reaction) => reaction.spectatorId !== user.id),
    };
    removeVoiceUserFromSession(channelId, user.id);

    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "channel_leave");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/stance", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const stance = String(request.body?.stance ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!channel.participantIds.includes(user.id)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status !== "waiting" || channel.phase !== "ready") {
      errorResponse(response, 400, "channel_not_ready_phase");
      return;
    }
    if (!["agree", "disagree"].includes(stance)) {
      errorResponse(response, 400, "invalid_stance");
      return;
    }

    const previousStance = channel.stanceByUser?.[user.id];
    const nextChannel = {
      ...channel,
      stanceByUser: {
        ...(channel.stanceByUser ?? {}),
        [user.id]: stance,
      },
      readyUserIds:
        previousStance === stance
          ? (channel.readyUserIds ?? [])
          : (channel.readyUserIds ?? []).filter((readyUserId) => readyUserId !== user.id),
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_stance_update");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/ready", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const ready = Boolean(request.body?.ready);
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!channel.participantIds.includes(user.id)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status !== "waiting" || channel.phase !== "ready") {
      errorResponse(response, 400, "channel_not_ready_phase");
      return;
    }
    if (ready && channel.participantIds.length < channel.participantLimit) {
      errorResponse(response, 409, "not_enough_participants");
      return;
    }

    const readySet = new Set(channel.readyUserIds ?? []);
    if (ready) {
      readySet.add(user.id);
    } else {
      readySet.delete(user.id);
    }
    const nextChannel = {
      ...channel,
      readyUserIds: channel.participantIds.filter((participantId) => readySet.has(participantId)),
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_ready_update");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/voice", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const requestedMuted = typeof request.body?.muted === "boolean" ? request.body.muted : true;
    const handRaised = Boolean(request.body?.handRaised);
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (channel.format !== "voice") {
      errorResponse(response, 400, "not_voice_channel");
      return;
    }
    if (!channel.participantIds.includes(user.id)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status === "finished") {
      errorResponse(response, 400, "channel_finished");
      return;
    }

    const forcedMuted =
      channel.status === "live" &&
      Boolean(channel.activeSpeakerId) &&
      channel.activeSpeakerId !== user.id;
    const nextChannel = {
      ...channel,
      voiceStateByUser: {
        ...(channel.voiceStateByUser ?? {}),
        [user.id]: {
          muted: forcedMuted ? true : requestedMuted,
          handRaised,
          updatedAt: nowLabel(),
        },
      },
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_voice_update");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/start", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canControlDebate(user, channel)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.participantIds.length < 2) {
      errorResponse(response, 409, "not_enough_participants");
      return;
    }
    if (channel.status !== "waiting" || channel.phase !== "ready") {
      errorResponse(response, 400, "invalid_debate_phase");
      return;
    }
    const readyUserIds = channel.readyUserIds ?? [];
    if (!channel.participantIds.every((participantId) => readyUserIds.includes(participantId))) {
      errorResponse(response, 409, "not_all_ready");
      return;
    }

    const settings = platformSettingsForState(payload.state);
    const nextChannel = advanceDebateChannel(channel, Date.now(), settings);
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_start");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/advance", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canControlDebate(user, channel)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status !== "live") {
      errorResponse(response, 400, "debate_not_live");
      return;
    }

    const settings = platformSettingsForState(payload.state);
    const nextChannel = advanceDebateChannel(channel, Date.now(), settings);
    if (nextChannel === channel) {
      errorResponse(response, 400, "invalid_debate_phase");
      return;
    }
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_advance");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/pass", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canControlDebate(user, channel)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status !== "live") {
      errorResponse(response, 400, "debate_not_live");
      return;
    }
    if (channel.phase !== "crossfire" || !channel.activeSpeakerId) {
      errorResponse(response, 400, "turn_not_passable");
      return;
    }
    if (channel.activeSpeakerId !== user.id) {
      errorResponse(response, 403, "not_active_speaker");
      return;
    }

    const settings = platformSettingsForState(payload.state);
    const nextChannel = passDebateTurn(channel, Date.now(), settings);
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_pass_turn");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/voting", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canForceVoting(user, channel)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (channel.status !== "live") {
      errorResponse(response, 400, "debate_not_live");
      return;
    }

    const nextChannel = {
      ...channel,
      status: "voting",
      phase: "voting",
      activeSpeakerId: undefined,
      phaseEndsAt: undefined,
      turnStartedAt: undefined,
      remainingSecondsByUser: captureCrossfireClock(channel, Date.now(), platformSettingsForState(payload.state)),
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_move_to_voting");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/messages", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const body = String(request.body?.body ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "debate_message",
        keyParts: [userId, channelId],
        max: RATE_LIMIT_MESSAGE_MAX,
        windowSeconds: RATE_LIMIT_WRITE_WINDOW_SECONDS,
      })
    ) return;
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!body) {
      errorResponse(response, 400, "empty_message");
      return;
    }
    const settings = platformSettingsForState(payload.state);
    const messageLimit =
      channel.phase === "opening" ? settings.debate.maxOpeningChars : settings.debate.maxDebateChars;
    if (body.length > messageLimit) {
      errorResponse(response, 400, "message_too_long");
      return;
    }
    if (!channel.participantIds.includes(user.id)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (channel.status !== "live") {
      errorResponse(response, 400, "debate_not_live");
      return;
    }
    if (channel.activeSpeakerId !== user.id) {
      errorResponse(response, 403, "not_active_speaker");
      return;
    }
    if (activeRemainingSeconds(channel, user.id, Date.now(), settings) <= 0) {
      errorResponse(response, 400, "speaking_time_over");
      return;
    }

    const nextChannel = {
      ...channel,
      debateMessages: [
        ...(channel.debateMessages ?? []),
        { id: uid("msg"), authorId: user.id, body, phase: channel.phase, createdAt: nowLabel() },
      ],
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "debate_message_create");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/spectator-messages", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const body = String(request.body?.body ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "spectator_message",
        keyParts: [userId, channelId],
        max: RATE_LIMIT_MESSAGE_MAX,
        windowSeconds: RATE_LIMIT_WRITE_WINDOW_SECONDS,
      })
    ) return;
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!body) {
      errorResponse(response, 400, "empty_message");
      return;
    }
    if (body.length > MAX_SPECTATOR_CHARS) {
      errorResponse(response, 400, "message_too_long");
      return;
    }
    if (channel.status === "finished") {
      errorResponse(response, 400, "channel_finished");
      return;
    }
    if (!channel.participantIds.includes(user.id) && !channel.spectatorIds.includes(user.id)) {
      errorResponse(response, 403, "not_spectator");
      return;
    }

    const nextChannel = {
      ...channel,
      spectatorMessages: [
        ...(channel.spectatorMessages ?? []),
        { id: uid("spec"), authorId: user.id, body, createdAt: nowLabel() },
      ],
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "spectator_message_create");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/votes", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const targetUserId = String(request.body?.targetUserId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (channel.status !== "voting") {
      errorResponse(response, 400, "voting_not_open");
      return;
    }
    if (judgingChannels.has(channelId)) {
      errorResponse(response, 409, "judge_in_progress");
      return;
    }
    if (!channel.participantIds.includes(targetUserId)) {
      errorResponse(response, 400, "invalid_vote_target");
      return;
    }
    if (!canSpectatorInteract(user, channel)) {
      errorResponse(response, 403, channel.participantIds.includes(user.id) ? "participant_cannot_vote" : "not_spectator");
      return;
    }
    if ((channel.votes ?? []).some((vote) => vote.voterId === user.id)) {
      errorResponse(response, 409, "duplicate_vote");
      return;
    }

    const nextChannel = {
      ...channel,
      votes: [
        ...(channel.votes ?? []),
        { id: uid("vote"), voterId: user.id, targetUserId, createdAt: nowLabel() },
      ],
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "vote_create");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/reactions", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const targetUserId = String(request.body?.targetUserId ?? "");
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (channel.status === "finished") {
      errorResponse(response, 400, "channel_finished");
      return;
    }
    if (!channel.participantIds.includes(targetUserId)) {
      errorResponse(response, 400, "invalid_reaction_target");
      return;
    }
    if (!canSpectatorInteract(user, channel)) {
      errorResponse(response, 403, channel.participantIds.includes(user.id) ? "participant_cannot_react" : "not_spectator");
      return;
    }

    const reactions = (channel.reactions ?? []).filter((reaction) => reaction.spectatorId !== user.id);
    const nextChannel = {
      ...channel,
      reactions: [
        ...reactions,
        { id: uid("react"), spectatorId: user.id, targetUserId, createdAt: nowLabel() },
      ],
    };
    const saved = await writeStateAndBroadcast(replaceChannel(payload.state, channelId, nextChannel), "reaction_upsert");
    response.json(channelActionPayload(saved, nextChannel));
  } catch (error) {
    next(error);
  }
});

function findReportTarget(state, { targetType, targetId, channelId }) {
  if (targetType === "channel") {
    const channel = findStateChannel(state, targetId);
    return channel ? { ok: true, channelId: channel.id, roomId: channel.roomId } : { ok: false };
  }
  if (targetType === "user") {
    const channel = channelId ? findStateChannel(state, channelId) : null;
    return findStateUser(state, targetId) ? { ok: true, channelId, roomId: channel?.roomId } : { ok: false };
  }
  if (targetType === "debate_message" || targetType === "spectator_message") {
    const messageKey = targetType === "debate_message" ? "debateMessages" : "spectatorMessages";
    const channel = state.channels.find((item) =>
      (item[messageKey] ?? []).some((message) => message.id === targetId),
    );
    return channel ? { ok: true, channelId: channel.id, roomId: channel.roomId } : { ok: false };
  }
  return { ok: false };
}

function findReportTargetUserForNotification(state, report) {
  if (report.targetType === "user") {
    return findStateUser(state, report.targetId);
  }
  const channel = findStateChannel(state, report.channelId) ?? findStateChannel(state, report.targetId);
  if (!channel) return undefined;
  if (report.targetType === "channel") {
    return findStateUser(state, channel.createdBy);
  }
  const message =
    report.targetType === "debate_message"
      ? channel.debateMessages.find((item) => item.id === report.targetId)
      : channel.spectatorMessages.find((item) => item.id === report.targetId);
  return findStateUser(state, message?.authorId);
}

app.post("/api/reports", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const userId = String(request.body?.userId ?? "");
    const targetType = String(request.body?.targetType ?? "");
    const targetId = String(request.body?.targetId ?? "");
    const channelId = request.body?.channelId ? String(request.body.channelId) : undefined;
    const rawReason = String(request.body?.reason ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "report_create",
        keyParts: [userId],
        max: RATE_LIMIT_REPORT_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const user = findStateUser(payload.state, userId);
    const settings = platformSettingsForState(payload.state);
    const reason = rawReason.slice(0, settings.debate.maxReportReasonChars);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!["channel", "debate_message", "spectator_message", "user"].includes(targetType)) {
      errorResponse(response, 400, "invalid_report_target");
      return;
    }
    if (!targetId) {
      errorResponse(response, 400, "invalid_report_target");
      return;
    }
    const target = findReportTarget(payload.state, { targetType, targetId, channelId });
    if (!target.ok) {
      errorResponse(response, 404, "report_target_not_found");
      return;
    }
    const duplicate = (payload.state.reports ?? []).some(
      (report) =>
        ["open", "reviewing"].includes(normalizeReportStatus(report.status)) &&
        report.reporterId === user.id &&
        report.targetType === targetType &&
        report.targetId === targetId,
    );
    if (duplicate) {
      errorResponse(response, 409, "duplicate_report");
      return;
    }

    const report = {
      id: uid("report"),
      reporterId: user.id,
      targetType,
      targetId,
      channelId: target.channelId,
      reason: reason || "신고 사유 미입력",
      status: "open",
      createdAt: nowLabel(),
      assigneeId: "",
      assigneeName: "",
      assignedAt: "",
      reviewMemo: "",
      statusHistory: [
        {
          status: "open",
          actorId: user.id,
          actorName: user.displayName,
          memo: reason || "신고 사유 미입력",
          createdAt: nowLabel(),
        },
      ],
    };
    const nextState = notifyPlatformManagers({
      ...payload.state,
      reports: [report, ...(payload.state.reports ?? [])],
    }, {
      kind: "report",
      title: "운영 처리 필요: 새 신고",
      body: `${user.displayName}님이 신고했습니다. 사유: ${report.reason}`,
      view: "admin",
      channelId: target.channelId,
      roomId: target.roomId,
    }, user.id);
    const saved = await writeStateAndBroadcast(nextState, "report_create");
    response.json({ ok: true, reportId: report.id, channelId: target.channelId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const loginId = String(request.body?.loginId ?? "").trim();
    const password = String(request.body?.password ?? "");
    if (
      !consumeRateLimit(request, response, {
        scope: "auth_login",
        keyParts: [loginId],
        max: RATE_LIMIT_LOGIN_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = payload.state.users.find(
      (item) => item.authProvider === "local" && item.loginId === loginId && isActiveUser(item),
    );
    if (!user || !verifyPassword(user, password)) {
      errorResponse(response, 401, "invalid_credentials");
      return;
    }

    const nextUsers = payload.state.users.map((item) => {
      if (item.id !== user.id) return item;
      if (item.passwordHash && item.passwordSalt) return item;
      return { ...item, ...hashPassword(password), password: "" };
    });
    const nextState = { ...payload.state, users: nextUsers, currentUserId: user.id };
    const saved = await writeStateAndBroadcast(nextState, "auth_login");
    const csrfToken = setAuthCookie(response, user.id);
    response.json({ ok: true, userId: user.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/signup", async (request, response, next) => {
  try {
    const loginId = String(request.body?.loginId ?? "").trim();
    const password = String(request.body?.password ?? "");
    const displayName = String(request.body?.displayName ?? "").trim();
    const phone = String(request.body?.phone ?? "").trim();
    const accentColor = String(request.body?.accentColor ?? "blue");
    if (
      !consumeRateLimit(request, response, {
        scope: "auth_signup",
        keyParts: [loginId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_SIGNUP_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    if (!loginId || !password || !displayName || !phone) {
      errorResponse(response, 400, "missing_required_fields");
      return;
    }
    if (password.length < 6) {
      errorResponse(response, 400, "weak_password");
      return;
    }
    if (!/^010-?\d{4}-?\d{4}$/.test(phone)) {
      errorResponse(response, 400, "invalid_phone");
      return;
    }
    if (payload.state.users.some((user) => user.loginId === loginId)) {
      errorResponse(response, 409, "duplicate_login_id");
      return;
    }
    if (findVerifiedPhoneOwner(payload.state, phone)) {
      errorResponse(response, 409, "duplicate_phone");
      return;
    }

    const user = {
      id: uid("user"),
      loginId,
      password: "",
      ...hashPassword(password),
      authProvider: "local",
      phone,
      phoneVerified: false,
      displayName,
      title: "신규 토론러",
      bio: "아직 소개를 작성하지 않았습니다.",
      photoUrl: "",
      role: "member",
      coins: 500,
      accentColor,
      profileFrame: "clean",
      bannerStyle: "plain",
      featuredBadge: "신규 토론러",
      ownedItemIds: [],
      claims: [{ id: uid("claim"), label: "관심 분야", value: "자유 토론", status: "self_reported" }],
      stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
      agreements: createRequiredAgreementState({ accepted: false }),
    };
    const nextState = addNotifications({
      ...payload.state,
      users: [...payload.state.users, user],
      ledger: [
        ...payload.state.ledger,
        {
          id: uid("ledger"),
          type: "signup",
          userId: user.id,
          amount: 500,
          memo: "가입 보너스",
          createdAt: nowLabel(),
        },
      ],
      currentUserId: user.id,
    }, [
      createNotification({
        userId: user.id,
        kind: "system",
        title: "노수베스트 가입 완료",
        body: "전화번호 인증을 마치면 토론장, 프로필, 코인 기능을 사용할 수 있습니다.",
        view: "profile",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "auth_signup");
    const csrfToken = setAuthCookie(response, user.id);
    response.json({ ok: true, userId: user.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/request-code", async (request, response, next) => {
  try {
    const loginId = String(request.body?.loginId ?? "").trim();
    const phone = String(request.body?.phone ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "password_reset_request",
        keyParts: [loginId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_PASSWORD_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    if (!loginId || !isValidKoreanPhone(phone)) {
      errorResponse(response, 400, !loginId ? "missing_required_fields" : "invalid_phone");
      return;
    }
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = payload.state.users.find((item) => item.loginId === loginId && isActiveUser(item));
    if (!user || normalizePhoneNumber(user.phone) !== normalizePhoneNumber(phone)) {
      errorResponse(response, 404, "invalid_reset_identity");
      return;
    }
    if (user.authProvider !== "local") {
      errorResponse(response, 400, "provider_password_disabled");
      return;
    }

    const now = Date.now();
    const previous = passwordResetCodes.get(user.id);
    if (previous && now - previous.sentAt < PHONE_CODE_RESEND_SECONDS * 1000) {
      response.status(429).json({
        error: "phone_code_rate_limited",
        resendAfterSeconds: Math.ceil((PHONE_CODE_RESEND_SECONDS * 1000 - (now - previous.sentAt)) / 1000),
      });
      return;
    }

    const code = createPhoneCode();
    const record = {
      phone: normalizePhoneNumber(phone),
      codeHash: hashPhoneCode(`password-reset:${user.id}`, phone, code),
      attempts: 0,
      sentAt: now,
      expiresAt: now + PHONE_CODE_TTL_SECONDS * 1000,
    };
    const delivery = await sendPhoneVerificationCode(phone, code);
    if (!delivery.sent && (delivery.provider === "solapi" || !EXPOSE_PHONE_DEBUG_CODE)) {
      errorResponse(response, delivery.error === "sms_send_failed" ? 502 : 503, delivery.error ?? "sms_send_failed");
      return;
    }
    passwordResetCodes.set(user.id, record);
    response.json(publicPhoneCodePayload(code, record, delivery));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset/confirm", async (request, response, next) => {
  try {
    const loginId = String(request.body?.loginId ?? "").trim();
    const phone = String(request.body?.phone ?? "").trim();
    const code = String(request.body?.code ?? "").trim();
    const newPassword = String(request.body?.newPassword ?? "");
    if (
      !consumeRateLimit(request, response, {
        scope: "password_reset_confirm",
        keyParts: [loginId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_PASSWORD_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    if (!loginId || !code || !newPassword) {
      errorResponse(response, 400, "missing_required_fields");
      return;
    }
    if (!isValidKoreanPhone(phone)) {
      errorResponse(response, 400, "invalid_phone");
      return;
    }
    if (newPassword.length < 6) {
      errorResponse(response, 400, "weak_password");
      return;
    }
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = payload.state.users.find((item) => item.loginId === loginId && isActiveUser(item));
    if (!user || normalizePhoneNumber(user.phone) !== normalizePhoneNumber(phone)) {
      errorResponse(response, 404, "invalid_reset_identity");
      return;
    }
    if (user.authProvider !== "local") {
      errorResponse(response, 400, "provider_password_disabled");
      return;
    }
    const record = passwordResetCodes.get(user.id);
    if (!record) {
      errorResponse(response, 400, "password_reset_code_not_requested");
      return;
    }
    if (record.expiresAt <= Date.now()) {
      passwordResetCodes.delete(user.id);
      errorResponse(response, 400, "password_reset_code_expired");
      return;
    }
    if (record.phone !== normalizePhoneNumber(phone)) {
      errorResponse(response, 400, "invalid_password_reset_code");
      return;
    }
    if (!safeEqualString(record.codeHash, hashPhoneCode(`password-reset:${user.id}`, phone, code))) {
      record.attempts += 1;
      if (record.attempts >= PHONE_CODE_MAX_ATTEMPTS) {
        passwordResetCodes.delete(user.id);
        errorResponse(response, 429, "password_reset_code_too_many_attempts");
        return;
      }
      errorResponse(response, 400, "invalid_password_reset_code");
      return;
    }

    passwordResetCodes.delete(user.id);
    const nextState = addNotifications({
      ...payload.state,
      users: payload.state.users.map((item) =>
        item.id === user.id ? { ...item, ...hashPassword(newPassword), password: "", phoneVerified: true } : item,
      ),
      currentUserId: user.id,
    }, [
      createNotification({
        userId: user.id,
        kind: "system",
        title: "비밀번호 재설정 완료",
        body: "전화번호 인증으로 비밀번호가 재설정되었습니다. 본인이 요청하지 않았다면 즉시 다시 변경해주세요.",
        view: "profile",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "password_reset_confirm");
    const csrfToken = setAuthCookie(response, user.id);
    response.json({ ok: true, userId: user.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

function supportedOAuthProvider(provider) {
  return Object.prototype.hasOwnProperty.call(providerLabels, provider) ? provider : "";
}

function oauthProviderFromSupabaseUser(supabaseUser, requestedProvider = "") {
  const identities = Array.isArray(supabaseUser?.identities) ? supabaseUser.identities : [];
  const identityProvider = identities.map((identity) => String(identity.provider ?? "")).find(supportedOAuthProvider);
  return (
    supportedOAuthProvider(String(requestedProvider ?? "")) ||
    supportedOAuthProvider(String(supabaseUser?.app_metadata?.provider ?? "")) ||
    identityProvider ||
    ""
  );
}

function oauthUserDisplayName(supabaseUser, provider) {
  const metadata = supabaseUser?.user_metadata ?? {};
  const email = String(supabaseUser?.email ?? "");
  const fallbackName = email.includes("@") ? email.split("@")[0] : `${providerLabels[provider]} 유저`;
  return String(
    metadata.full_name ??
      metadata.name ??
      metadata.preferred_username ??
      metadata.user_name ??
      metadata.nickname ??
      fallbackName,
  ).trim().slice(0, 30) || fallbackName;
}

function oauthUserPhotoUrl(supabaseUser) {
  const metadata = supabaseUser?.user_metadata ?? {};
  return String(metadata.avatar_url ?? metadata.picture ?? metadata.photo_url ?? "").trim();
}

function oauthUserPhone(supabaseUser) {
  const phone = String(supabaseUser?.phone ?? supabaseUser?.user_metadata?.phone ?? "").trim();
  return isValidKoreanPhone(phone) ? phone : "";
}

function oauthLoginId(provider, supabaseUserId) {
  return `oauth:${provider}:${supabaseUserId}`;
}

function oauthClaims(provider, supabaseUser) {
  const claims = [
    { id: uid("claim"), label: "가입 방식", value: providerLabels[provider], status: "verified" },
  ];
  const email = String(supabaseUser?.email ?? "").trim();
  if (email) {
    claims.push({
      id: uid("claim"),
      label: "이메일",
      value: email,
      status: supabaseUser?.email_confirmed_at ? "verified" : "self_reported",
    });
  }
  return claims;
}

function createOAuthAppUser({ provider, supabaseUser, phone, phoneVerified }) {
  const label = providerLabels[provider];
  return {
    id: uid("user"),
    loginId: oauthLoginId(provider, supabaseUser.id),
    password: "",
    authProvider: provider,
    phone,
    phoneVerified,
    displayName: oauthUserDisplayName(supabaseUser, provider),
    title: `${label} 로그인 가입자`,
    bio: "프로필 소개를 작성하면 토론 채널 입장 전 화면에 표시됩니다.",
    photoUrl: oauthUserPhotoUrl(supabaseUser),
    role: "member",
    coins: 500,
    accentColor: provider === "kakao" ? "amber" : provider === "naver" ? "mint" : provider === "apple" ? "violet" : "blue",
    profileFrame: "clean",
    bannerStyle: "plain",
    featuredBadge: `${label} 인증`,
    ownedItemIds: [],
    claims: oauthClaims(provider, supabaseUser),
    stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
    agreements: createRequiredAgreementState({ accepted: false }),
  };
}

app.post("/api/auth/oauth/session", async (request, response, next) => {
  try {
    const accessToken = String(request.body?.accessToken ?? "").trim();
    const requestedProvider = String(request.body?.provider ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "auth_oauth",
        keyParts: [requestedProvider, accessToken.slice(0, 16)],
        max: RATE_LIMIT_SOCIAL_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    if (!supabase) {
      errorResponse(response, 503, "supabase_not_configured");
      return;
    }
    if (!accessToken) {
      errorResponse(response, 401, "invalid_oauth_session");
      return;
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      errorResponse(response, 401, "invalid_oauth_session");
      return;
    }
    const supabaseUser = data.user;
    const provider = oauthProviderFromSupabaseUser(supabaseUser, requestedProvider);
    if (!provider) {
      errorResponse(response, 400, "invalid_provider");
      return;
    }

    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }

    const loginId = oauthLoginId(provider, supabaseUser.id);
    const existing = payload.state.users.find((user) => user.loginId === loginId);
    if (existing && !isActiveUser(existing)) {
      errorResponse(response, 403, "account_deactivated");
      return;
    }
    if (existing) {
      const nextUsers = payload.state.users.map((user) => {
        if (user.id !== existing.id) return user;
        const phone = user.phone || oauthUserPhone(supabaseUser);
        const phoneVerified =
          user.phoneVerified ||
          Boolean(phone && supabaseUser.phone_confirmed_at && !findVerifiedPhoneOwner(payload.state, phone, user.id));
        return {
          ...user,
          phone,
          phoneVerified,
          photoUrl: user.photoUrl || oauthUserPhotoUrl(supabaseUser),
        };
      });
      const nextState = { ...payload.state, users: nextUsers, currentUserId: existing.id };
      const saved = await writeStateAndBroadcast(nextState, "auth_oauth_login");
      const csrfToken = setAuthCookie(response, existing.id);
      response.json({ ok: true, userId: existing.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
      return;
    }

    const phone = oauthUserPhone(supabaseUser);
    const phoneVerified =
      Boolean(phone && supabaseUser.phone_confirmed_at) && !findVerifiedPhoneOwner(payload.state, phone);
    if (phone && phoneVerified === false && findVerifiedPhoneOwner(payload.state, phone)) {
      errorResponse(response, 409, "duplicate_phone");
      return;
    }
    const user = createOAuthAppUser({ provider, supabaseUser, phone, phoneVerified });
    const nextState = addNotifications({
      ...payload.state,
      users: [...payload.state.users, user],
      ledger: [
        ...payload.state.ledger,
        {
          id: uid("ledger"),
          type: "signup",
          userId: user.id,
          amount: 500,
          memo: "OAuth 가입 보너스",
          createdAt: nowLabel(),
        },
      ],
      currentUserId: user.id,
    }, [
      createNotification({
        userId: user.id,
        kind: "system",
        title: "간편 로그인 가입 완료",
        body: phoneVerified ? "프로필을 완성하고 바로 토론에 참여할 수 있습니다." : "전화번호 인증을 마치면 토론장, 프로필, 코인 기능을 사용할 수 있습니다.",
        view: phoneVerified ? "arena" : "profile",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "auth_oauth_signup");
    const csrfToken = setAuthCookie(response, user.id);
    response.json({ ok: true, userId: user.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/social", async (request, response, next) => {
  try {
    const provider = String(request.body?.provider ?? "");
    if (
      !consumeRateLimit(request, response, {
        scope: "auth_social",
        keyParts: [provider],
        max: RATE_LIMIT_SOCIAL_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(providerLabels, provider)) {
      errorResponse(response, 400, "invalid_provider");
      return;
    }
    const existing = payload.state.users.find((user) => user.authProvider === provider);
    if (existing && !isActiveUser(existing)) {
      errorResponse(response, 403, "account_deactivated");
      return;
    }
    if (existing) {
      const nextState = { ...payload.state, currentUserId: existing.id };
      const saved = await writeStateAndBroadcast(nextState, "auth_social_login");
      const csrfToken = setAuthCookie(response, existing.id);
      response.json({ ok: true, userId: existing.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
      return;
    }

    const label = providerLabels[provider];
    const user = {
      id: uid("user"),
      loginId: `${provider}_${Date.now()}`,
      password: "",
      authProvider: provider,
      phone: "",
      phoneVerified: false,
      displayName: `${label} 유저`,
      title: "간편 로그인 가입자",
      bio: "프로필 소개를 작성하면 토론 채널 입장 전 화면에 표시됩니다.",
      photoUrl: "",
      role: "member",
      coins: 500,
      accentColor: provider === "kakao" ? "amber" : provider === "naver" ? "mint" : "blue",
      profileFrame: "clean",
      bannerStyle: "plain",
      featuredBadge: `${label} 가입`,
      ownedItemIds: [],
      claims: [{ id: uid("claim"), label: "가입 방식", value: label, status: "verified" }],
      stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
      agreements: createRequiredAgreementState({ accepted: false }),
    };
    const nextState = addNotifications({
      ...payload.state,
      users: [...payload.state.users, user],
      ledger: [
        ...payload.state.ledger,
        {
          id: uid("ledger"),
          type: "signup",
          userId: user.id,
          amount: 500,
          memo: "가입 보너스",
          createdAt: nowLabel(),
        },
      ],
      currentUserId: user.id,
    }, [
      createNotification({
        userId: user.id,
        kind: "system",
        title: "간편 로그인 가입 완료",
        body: "전화번호 인증을 마치면 토론장, 프로필, 코인 기능을 사용할 수 있습니다.",
        view: "profile",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "auth_social_signup");
    const csrfToken = setAuthCookie(response, user.id);
    response.json({ ok: true, userId: user.id, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/select-demo", async (request, response, next) => {
  try {
    if (!DEMO_AUTH_ENABLED) {
      errorResponse(response, 403, "demo_auth_disabled");
      return;
    }
    const userId = String(request.body?.userId ?? "");
    if (
      !consumeRateLimit(request, response, {
        scope: "auth_demo",
        keyParts: [userId],
        max: RATE_LIMIT_DEMO_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    if (!payload.state.users.some((user) => user.id === userId && isActiveUser(user))) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    const nextState = { ...payload.state, currentUserId: userId };
    const saved = await writeStateAndBroadcast(nextState, "auth_select_demo");
    const csrfToken = setAuthCookie(response, userId);
    response.json({ ok: true, userId, csrfToken, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (request, response, next) => {
  try {
    response.setHeader("Cache-Control", "no-store");
    const session = getSignedSession(request);
    if (!session.userId) {
      response.json({ ok: true, authenticated: false, csrfToken: null, user: null, session: null });
      return;
    }

    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }

    const user = findStateUser(payload.state, session.userId);
    if (!isActiveUser(user)) {
      clearAuthCookie(response);
      response.json({
        ok: true,
        authenticated: false,
        csrfToken: null,
        user: null,
        session: null,
        reason: user ? "account_inactive" : "user_not_found",
      });
      return;
    }

    const expiresInSeconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
    response.json({
      ok: true,
      authenticated: true,
      userId: user.id,
      user: sessionUserPayload(user),
      csrfToken: request.csrfToken || createCsrfToken(session.token),
      session: {
        expiresAt: new Date(session.expiresAt).toISOString(),
        expiresInSeconds,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
      },
      savedAt: payload.savedAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/agreements/accept", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = requireSessionUser(request, response, payload.state);
    if (!user) return;

    const acceptedAt = new Date().toISOString();
    const nextAgreementState = createRequiredAgreementState({
      accepted: true,
      acceptedAt,
      acceptedIp: getClientAddress(request),
    });
    const nextUsers = payload.state.users.map((item) =>
      item.id === user.id ? { ...item, agreements: nextAgreementState } : item,
    );
    const nextState = { ...payload.state, users: nextUsers, currentUserId: user.id };
    const saved = await writeStateAndBroadcast(nextState, "auth_agreements_accept");
    response.json({
      ok: true,
      userId: user.id,
      agreements: nextAgreementState,
      savedAt: saved.savedAt,
      state: saved.state,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (_request, response) => {
  clearAuthCookie(response);
  response.json({ ok: true });
});

app.post("/api/auth/phone/change", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId ?? "");
    const phone = String(request.body?.phone ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "phone_change",
        keyParts: [userId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_PHONE_REQUEST_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = findStateUser(payload.state, userId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!isValidKoreanPhone(phone)) {
      errorResponse(response, 400, "invalid_phone");
      return;
    }
    const normalizedPhone = normalizePhoneNumber(phone);
    const previousPhone = normalizePhoneNumber(user.phone);
    if (findVerifiedPhoneOwner(payload.state, phone, user.id)) {
      errorResponse(response, 409, "duplicate_phone");
      return;
    }
    if (normalizedPhone === previousPhone && user.phoneVerified) {
      response.json({ ok: true, userId: user.id, state: sanitizeState(payload.state), alreadyVerified: true });
      return;
    }

    phoneVerificationCodes.delete(user.id);
    const nextState = addNotifications({
      ...payload.state,
      users: payload.state.users.map((stateUser) =>
        stateUser.id === user.id ? { ...stateUser, phone, phoneVerified: false } : stateUser,
      ),
      currentUserId: user.id,
    }, [
      createNotification({
        userId: user.id,
        kind: "system",
        title: "전화번호 재인증 필요",
        body: "새 전화번호로 변경되었습니다. 인증번호 확인을 마치면 서비스를 다시 이용할 수 있습니다.",
        view: "profile",
      }),
    ]);
    const saved = await writeStateAndBroadcast(nextState, "phone_change_request");
    response.json({ ok: true, userId: user.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/phone/request-code", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId ?? "");
    const phone = String(request.body?.phone ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "phone_request",
        keyParts: [userId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_PHONE_REQUEST_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = findStateUser(payload.state, userId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!isValidKoreanPhone(phone)) {
      errorResponse(response, 400, "invalid_phone");
      return;
    }
    if (findVerifiedPhoneOwner(payload.state, phone, user.id)) {
      errorResponse(response, 409, "duplicate_phone");
      return;
    }

    const now = Date.now();
    const previous = phoneVerificationCodes.get(user.id);
    if (previous && now - previous.sentAt < PHONE_CODE_RESEND_SECONDS * 1000) {
      response.status(429).json({
        error: "phone_code_rate_limited",
        resendAfterSeconds: Math.ceil((PHONE_CODE_RESEND_SECONDS * 1000 - (now - previous.sentAt)) / 1000),
      });
      return;
    }

    const code = createPhoneCode();
    const record = {
      phone: normalizePhoneNumber(phone),
      codeHash: hashPhoneCode(user.id, phone, code),
      attempts: 0,
      sentAt: now,
      expiresAt: now + PHONE_CODE_TTL_SECONDS * 1000,
    };
    const delivery = await sendPhoneVerificationCode(phone, code);
    if (!delivery.sent && (delivery.provider === "solapi" || !EXPOSE_PHONE_DEBUG_CODE)) {
      errorResponse(response, delivery.error === "sms_send_failed" ? 502 : 503, delivery.error ?? "sms_send_failed");
      return;
    }
    phoneVerificationCodes.set(user.id, record);
    response.json(publicPhoneCodePayload(code, record, delivery));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/phone/verify", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId ?? "");
    const phone = String(request.body?.phone ?? "").trim();
    const code = String(request.body?.code ?? "").trim();
    if (
      !consumeRateLimit(request, response, {
        scope: "phone_verify",
        keyParts: [userId, normalizePhoneNumber(phone)],
        max: RATE_LIMIT_PHONE_VERIFY_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = findStateUser(payload.state, userId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!isValidKoreanPhone(phone)) {
      errorResponse(response, 400, "invalid_phone");
      return;
    }
    if (findVerifiedPhoneOwner(payload.state, phone, user.id)) {
      errorResponse(response, 409, "duplicate_phone");
      return;
    }
    const record = phoneVerificationCodes.get(user.id);
    if (!record) {
      errorResponse(response, 400, "phone_code_not_requested");
      return;
    }
    if (record.expiresAt <= Date.now()) {
      phoneVerificationCodes.delete(user.id);
      errorResponse(response, 400, "phone_code_expired");
      return;
    }
    if (record.phone !== normalizePhoneNumber(phone)) {
      errorResponse(response, 400, "invalid_phone_code");
      return;
    }
    if (!safeEqualString(record.codeHash, hashPhoneCode(user.id, phone, code))) {
      record.attempts += 1;
      if (record.attempts >= PHONE_CODE_MAX_ATTEMPTS) {
        phoneVerificationCodes.delete(user.id);
        errorResponse(response, 429, "phone_code_too_many_attempts");
        return;
      }
      errorResponse(response, 400, "invalid_phone_code");
      return;
    }
    phoneVerificationCodes.delete(user.id);
    const nextState = {
      ...payload.state,
      users: payload.state.users.map((user) =>
        user.id === userId ? { ...user, phone, phoneVerified: true } : user,
      ),
      currentUserId: userId,
    };
    const saved = await writeStateAndBroadcast(nextState, "phone_verify");
    response.json({ ok: true, userId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId ?? "");
    const currentPassword = String(request.body?.currentPassword ?? "");
    const newPassword = String(request.body?.newPassword ?? "");
    if (
      !consumeRateLimit(request, response, {
        scope: "password_change",
        keyParts: [userId],
        max: RATE_LIMIT_PASSWORD_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = payload.state.users.find((item) => item.id === userId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (user.authProvider !== "local") {
      errorResponse(response, 400, "provider_password_disabled");
      return;
    }
    if (!verifyPassword(user, currentPassword)) {
      errorResponse(response, 401, "invalid_current_password");
      return;
    }
    if (newPassword.length < 6) {
      errorResponse(response, 400, "weak_password");
      return;
    }
    const nextState = {
      ...payload.state,
      users: payload.state.users.map((item) =>
        item.id === userId ? { ...item, ...hashPassword(newPassword), password: "" } : item,
      ),
      currentUserId: userId,
    };
    const saved = await writeStateAndBroadcast(nextState, "password_change");
    response.json({ ok: true, userId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/account/deactivate", async (request, response, next) => {
  try {
    const userId = String(request.body?.userId ?? "");
    const password = String(request.body?.password ?? "");
    const confirmation = String(request.body?.confirmation ?? "").trim();
    const reason = String(request.body?.reason ?? "").trim().slice(0, 140);
    if (
      !consumeRateLimit(request, response, {
        scope: "account_deactivate",
        keyParts: [userId],
        max: RATE_LIMIT_PASSWORD_MAX,
        windowSeconds: RATE_LIMIT_AUTH_WINDOW_SECONDS,
      })
    ) return;
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = requireSessionUser(request, response, payload.state);
    if (!user) return;
    if (confirmation !== "탈퇴") {
      errorResponse(response, 400, "invalid_account_deactivation_confirmation");
      return;
    }
    if (user.authProvider === "local" && !verifyPassword(user, password)) {
      errorResponse(response, 401, "invalid_current_password");
      return;
    }
    const activeManagers = payload.state.users.filter(canManagePlatform);
    if (canManagePlatform(user) && activeManagers.length <= 1) {
      errorResponse(response, 409, "cannot_deactivate_last_admin");
      return;
    }
    const activeDebate = payload.state.channels.find(
      (channel) =>
        ["live", "voting"].includes(channel.status) &&
        channel.participantIds.includes(user.id),
    );
    if (activeDebate) {
      errorResponse(response, 409, "account_has_active_debate");
      return;
    }

    const deactivatedAt = new Date().toISOString();
    const anonymizedLoginId = `deactivated:${user.id}`;
    const nextUsers = payload.state.users.map((item) => {
      if (item.id !== user.id) return item;
      const { passwordHash, passwordSalt, ...userWithoutSecrets } = item;
      return {
        ...userWithoutSecrets,
        loginId: anonymizedLoginId,
        password: "",
        phone: "",
        phoneVerified: false,
        displayName: "탈퇴한 사용자",
        title: "탈퇴한 계정",
        bio: "사용자가 계정을 탈퇴했습니다.",
        photoUrl: "",
        role: "member",
        deactivatedAt,
        deactivationReason: reason || "사용자 요청",
      };
    });
    passwordResetCodes.delete(user.id);
    phoneVerificationCodes.delete(user.id);
    let nextState = {
      ...payload.state,
      users: nextUsers,
      currentUserId: null,
    };
    nextState = addAuditLog(nextState, user, {
      action: "auth_account_deactivate",
      targetType: "user",
      targetId: user.id,
      summary: `${user.displayName} 계정이 탈퇴 처리되었습니다.`,
      metadata: { reason: reason || "사용자 요청" },
    });
    nextState = notifyPlatformManagers(nextState, {
      kind: "system",
      title: "계정 탈퇴 발생",
      body: `${user.displayName} 계정이 사용자 요청으로 탈퇴 처리되었습니다.`,
      view: "admin",
    }, user.id);
    const saved = await writeStateAndBroadcast(nextState, "account_deactivate");
    clearAuthCookie(response);
    response.json({ ok: true, userId: user.id, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/debate/:channelId/appeals", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const channelId = String(request.params.channelId ?? "");
    const userId = String(request.body?.userId ?? "");
    const reason = String(request.body?.reason ?? "").trim().slice(0, 500);
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (channel.status !== "finished" || !channel.aiJudgement || !channel.finalResult) {
      errorResponse(response, 400, "debate_result_not_ready");
      return;
    }
    if (!channel.participantIds.includes(user.id)) {
      errorResponse(response, 403, "not_participant");
      return;
    }
    if (!reason) {
      errorResponse(response, 400, "missing_appeal_reason");
      return;
    }
    const duplicate = jsonArray(payload.state.aiAppeals).some(
      (appeal) => appeal.channelId === channelId && appeal.userId === user.id,
    );
    if (duplicate) {
      errorResponse(response, 409, "duplicate_ai_appeal");
      return;
    }
    const appeal = normalizeAiAppeal({
      id: uid("appeal"),
      channelId,
      userId: user.id,
      userName: user.displayName,
      reason,
      status: "pending",
      createdAt: nowLabel(),
    });
    const nextState = notifyPlatformManagers({
      ...payload.state,
      aiAppeals: [appeal, ...jsonArray(payload.state.aiAppeals)],
    }, {
      kind: "debate",
      title: "AI 판정 이의제기 접수",
      body: `${user.displayName}님이 "${channel.title}" 결과 재검토를 요청했습니다.`,
      view: "admin",
      channelId,
      roomId: channel.roomId,
    }, user.id);
    const saved = await writeStateAndBroadcast(nextState, "ai_appeal_create");
    response.json({ ok: true, appealId: appeal.id, channelId, roomId: channel.roomId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai-appeals/:appealId/resolve", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const appealId = String(request.params.appealId ?? "");
    const actorId = String(request.body?.actorId ?? "");
    const nextStatus = String(request.body?.status ?? "resolved");
    const reviewMemo = String(request.body?.reviewMemo ?? "").trim().slice(0, 500);
    const actor = findStateUser(payload.state, actorId);
    const appeal = jsonArray(payload.state.aiAppeals).find((item) => item.id === appealId);
    if (!actor) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!canManagePlatform(actor)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (!appeal) {
      errorResponse(response, 404, "ai_appeal_not_found");
      return;
    }
    if (!["reviewing", "resolved", "dismissed"].includes(nextStatus)) {
      errorResponse(response, 400, "invalid_ai_appeal_status");
      return;
    }
    if (nextStatus === "dismissed" && !reviewMemo) {
      errorResponse(response, 400, "missing_review_memo");
      return;
    }
    const handledAt = nowLabel();
    const channel = findStateChannel(payload.state, appeal.channelId);
    const nextAppeal = normalizeAiAppeal({
      ...appeal,
      status: nextStatus,
      reviewedAt: handledAt,
      reviewerId: actor.id,
      reviewerName: actor.displayName,
      reviewMemo,
    });
    const finalStatus = nextStatus === "resolved" || nextStatus === "dismissed";
    const notification = finalStatus
      ? createNotification({
          userId: appeal.userId,
          kind: "debate",
          title: `AI 판정 이의제기: ${aiAppealStatusLabels[nextStatus] ?? nextStatus}`,
          body: reviewMemo || `"${channel?.title ?? appeal.channelId}" 결과 재검토가 완료되었습니다.`,
          view: "arena",
          channelId: appeal.channelId,
          roomId: channel?.roomId,
        })
      : null;
    const nextState = addAuditLog(addNotifications({
      ...payload.state,
      aiAppeals: jsonArray(payload.state.aiAppeals).map((item) => (item.id === appealId ? nextAppeal : item)),
    }, [notification]), actor, {
      action: "admin_ai_appeal_update",
      targetType: "ai_appeal",
      targetId: appealId,
      summary: `${appeal.userName || appeal.userId}님의 AI 판정 이의제기를 ${aiAppealStatusLabels[nextStatus] ?? nextStatus} 상태로 변경했습니다.`,
      metadata: { channelId: appeal.channelId, nextStatus, reviewMemo },
    });
    const saved = await writeStateAndBroadcast(nextState, "admin_ai_appeal_update");
    response.json({ ok: true, appealId, channelId: appeal.channelId, savedAt: saved.savedAt, state: saved.state });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/judge", async (request, response, next) => {
  const channelId = String(request.body?.channelId ?? "");
  try {
    const userId = String(request.body?.userId ?? "");
    const payload = await readState();
    if (!payload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const user = findStateUser(payload.state, userId);
    const channel = findStateChannel(payload.state, channelId);
    if (!user) {
      errorResponse(response, 404, "user_not_found");
      return;
    }
    if (!ensureUserCanInteract(response, payload.state, user)) return;
    if (!channel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (!canFinalizeDebate(user, channel)) {
      errorResponse(response, 403, "not_authorized");
      return;
    }
    if (channel.participantIds.length < 2) {
      errorResponse(response, 400, "not_enough_participants");
      return;
    }
    if (hasFinalDebateResult(channel)) {
      response.json({ ok: true, state: sanitizeState(payload.state), source: "existing", alreadyFinalized: true });
      return;
    }
    if (channel.status !== "voting") {
      errorResponse(response, 400, "voting_not_open");
      return;
    }
    if (judgingChannels.has(channelId)) {
      errorResponse(response, 409, "judge_in_progress");
      return;
    }

    judgingChannels.add(channelId);
    let parsed = null;
    let source = "fallback";
    let judgeFailureCode = "";
    const aiStatus = getAiJudgeStatus();
    const forceLocalJudge = AI_JUDGE_FORCE_LOCAL || (!IS_PRODUCTION_RUNTIME && Boolean(request.body?.forceLocal));
    try {
      if (forceLocalJudge) {
        judgeFailureCode = AI_JUDGE_FORCE_LOCAL ? "local_judge_forced" : "local_judge_requested";
      } else if (!aiStatus.configured) {
        judgeFailureCode = "missing_openai_config";
      } else {
        parsed = await judgeWithOpenAI(channel);
        if (parsed) source = "openai";
      }
    } catch (error) {
      judgeFailureCode = error?.name === "AbortError" ? "openai_judge_timeout" : "openai_judge_failed";
      console.warn("OpenAI judge failed", {
        reason: judgeFailureCode,
        message: String(error?.message ?? "").slice(0, 160),
      });
    }

    const latestPayload = await readState();
    if (!latestPayload?.state) {
      errorResponse(response, 409, "state_not_ready");
      return;
    }
    const latestChannel = findStateChannel(latestPayload.state, channelId);
    if (!latestChannel) {
      errorResponse(response, 404, "channel_not_found");
      return;
    }
    if (hasFinalDebateResult(latestChannel)) {
      response.json({ ok: true, state: sanitizeState(latestPayload.state), source: "existing", alreadyFinalized: true });
      return;
    }
    if (latestChannel.status !== "voting") {
      errorResponse(response, 400, "voting_not_open");
      return;
    }

    if (IS_PRODUCTION_RUNTIME && !parsed) {
      const attemptedAt = nowLabel();
      const pendingJudgement = pendingAiReviewJudgement(judgeFailureCode || "openai_judge_unavailable", attemptedAt);
      const pendingState = addNotifications({
        ...latestPayload.state,
        channels: latestPayload.state.channels.map((item) =>
          item.id === channelId
            ? { ...item, status: "voting", phase: "voting", aiJudgement: pendingJudgement, finalResult: undefined }
            : item,
        ),
      }, latestChannel.participantIds.map((participantId) =>
        createNotification({
          userId: participantId,
          kind: "debate",
          title: "AI 판정 보류",
          body: `"${latestChannel.title}" 판정이 자동 확정되지 않아 운영자 재판정을 기다립니다.`,
          view: "arena",
          channelId: latestChannel.id,
          roomId: latestChannel.roomId,
        }),
      ));
      const managerNotifiedState = notifyPlatformManagers(pendingState, {
        kind: "debate",
        title: "AI 판정 재검토 필요",
        body: `"${latestChannel.title}" 판정이 ${pendingJudgement.failureCode} 상태로 보류되었습니다.`,
        view: "admin",
        channelId: latestChannel.id,
        roomId: latestChannel.roomId,
      });
      const auditedState = addAuditLog(managerNotifiedState, user, {
        action: "ai_judge_pending_review",
        targetType: "channel",
        targetId: channelId,
        summary: `AI 판정이 자동 확정되지 않아 "${latestChannel.title}" 채널을 보류 상태로 전환했습니다.`,
        metadata: { reason: pendingJudgement.failureCode, model: aiStatus.model, timeoutMs: aiStatus.timeoutMs },
      });
      const saved = await writeStateAndBroadcast(auditedState, "ai_judge_pending_review");
      response.json({ ok: true, source: "pending_review", pendingReview: true, state: saved.state });
      return;
    }

    const judged = normalizeJudgePayload(latestChannel, parsed);
    const settings = platformSettingsForState(latestPayload.state);
    const rewardCoins = Math.max(
      settings.debate.minWinnerRewardCoins,
      Math.round(latestChannel.coinStake * settings.debate.winnerRewardRate),
    );
    const judgedAt = nowLabel();
    const aiJudgement = {
      status: "final",
      source: judged.source,
      winnerId: judged.winnerId,
      userScores: judged.userScores,
      categoryScores: judged.categoryScores,
      voteScores: judged.voteScores,
      finalScores: judged.finalScores,
      decidedAt: judgedAt,
      reasoning: judged.reasoning,
    };
    const result = {
      winnerId: judged.winnerId,
      loserId: judged.loserId,
      transferredCoins: rewardCoins,
      resolvedAt: judgedAt,
    };
    const rewardMemo = `[${latestChannel.id}] "${latestChannel.title}" 승리 플랫폼 보상`;
    const resultMemo = `[${latestChannel.id}] "${latestChannel.title}" 결과 기록 - 코인 차감 없음`;

    const nextState = addNotifications({
      ...latestPayload.state,
      users: latestPayload.state.users.map((stateUser) => {
        if (stateUser.id === judged.winnerId) {
          return {
            ...stateUser,
            coins: stateUser.coins + rewardCoins,
            stats: {
              ...stateUser.stats,
              wins: stateUser.stats.wins + 1,
              aiRating: Math.round((stateUser.stats.aiRating + judged.userScores[stateUser.id]) / 2),
            },
          };
        }
        if (stateUser.id === judged.loserId) {
          return {
            ...stateUser,
            stats: {
              ...stateUser.stats,
              losses: stateUser.stats.losses + 1,
              aiRating: Math.round((stateUser.stats.aiRating + judged.userScores[stateUser.id]) / 2),
            },
          };
        }
        return stateUser;
      }),
      channels: latestPayload.state.channels.map((item) =>
        item.id === channelId
          ? { ...item, status: "finished", phase: "finished", aiJudgement, finalResult: result }
          : item,
      ),
      ledger: [
        ...latestPayload.state.ledger,
        {
          id: uid("ledger"),
          type: "debate_reward",
          userId: judged.winnerId,
          amount: rewardCoins,
          memo: rewardMemo,
          createdAt: judgedAt,
        },
        {
          id: uid("ledger"),
          type: "debate_result",
          userId: judged.loserId,
          amount: 0,
          memo: resultMemo,
          createdAt: judgedAt,
        },
      ],
    }, [
      createNotification({
        userId: judged.winnerId,
        kind: "debate",
        title: "토론 승리",
        body: `"${latestChannel.title}"에서 승리해 ${rewardCoins}코인을 받았습니다.`,
        view: "arena",
        channelId: latestChannel.id,
        roomId: latestChannel.roomId,
      }),
      judged.loserId
        ? createNotification({
            userId: judged.loserId,
            kind: "debate",
            title: "토론 결과가 확정되었습니다",
            body: `"${latestChannel.title}" 결과가 확정되었습니다. AI 판정과 관전자 투표를 확인해보세요.`,
            view: "arena",
            channelId: latestChannel.id,
            roomId: latestChannel.roomId,
          })
        : null,
    ]);
    const saved = await writeStateAndBroadcast(nextState, "ai_judge");
    response.json({ ok: true, source, state: saved.state });
  } catch (error) {
    next(error);
  } finally {
    if (channelId) judgingChannels.delete(channelId);
  }
});

app.delete("/api/state", async (request, response, next) => {
  try {
    const payload = await readState();
    if (!payload?.state && !OPEN_STATE_WRITE_ENABLED) {
      errorResponse(response, 403, "state_write_disabled");
      return;
    }
    if (payload?.state) {
      const actor = requireSessionUser(request, response, payload.state);
      if (!actor) return;
      if (!canManagePlatform(actor)) {
        errorResponse(response, 403, "not_authorized");
        return;
      }
      if (!validateCsrfRequest(request, response)) return;
    }
    if (usesNormalizedSupabase) {
      await deleteNormalizedRows();
    } else if (supabase) {
      const { error } = await supabase.from(SUPABASE_TABLE).delete().eq("id", STATE_ID);
      if (error) throw error;
    } else {
      await rm(STATE_FILE, { force: true });
    }
    io.emit("state-reset", {
      ...storagePayload(),
      now: new Date().toISOString(),
    });
    response.json({ ok: true, storage: supabase ? "supabase" : "file" });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "not_found" });
});

if (SERVE_STATIC_APP) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: IS_PRODUCTION_RUNTIME ? "1h" : 0,
    }),
  );

  app.use((request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      next();
      return;
    }
    if (request.path.startsWith("/api") || request.path.startsWith("/socket.io")) {
      next();
      return;
    }
    const indexPath = path.join(DIST_DIR, "index.html");
    if (!existsSync(indexPath)) {
      response.status(503).json({ error: "static_app_not_built" });
      return;
    }
    response.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  if (error?.type === "entity.parse.failed") {
    response.status(400).json({ error: "invalid_json" });
    return;
  }
  response.status(error?.statusCode ?? error?.status ?? 500).json({ error: "Internal server error" });
});

let clockTickRunning = false;

function voiceRoomKey(channelId) {
  return `voice:${channelId}`;
}

function getVoiceSession(channelId) {
  if (!voiceSessions.has(channelId)) voiceSessions.set(channelId, new Map());
  return voiceSessions.get(channelId);
}

function voiceSessionPeers(channelId, exceptSocketId = "") {
  return [...(voiceSessions.get(channelId)?.values() ?? [])]
    .filter((peer) => peer.socketId !== exceptSocketId)
    .map((peer) => ({
      userId: peer.userId,
      displayName: peer.displayName,
      joinedAt: peer.joinedAt,
    }));
}

async function validateVoiceSocket(socket, channelId) {
  const payload = await readState();
  if (!payload?.state) return { ok: false, error: "state_not_ready" };
  const userId = socket.data.userId || "";
  const user = findStateUser(payload.state, userId);
  if (!user) return { ok: false, error: "not_authenticated" };
  const channel = findStateChannel(payload.state, channelId);
  if (!channel) return { ok: false, error: "channel_not_found" };
  if (channel.format !== "voice") return { ok: false, error: "not_voice_channel" };
  if (!channel.participantIds.includes(user.id)) return { ok: false, error: "not_participant" };
  if (channel.status === "finished") return { ok: false, error: "channel_finished" };
  return { ok: true, user, channel };
}

function cleanupVoiceSocket(socket) {
  for (const [channelId, session] of voiceSessions.entries()) {
    const peer = [...session.values()].find((item) => item.socketId === socket.id);
    if (!peer) continue;
    session.delete(peer.userId);
    socket.to(voiceRoomKey(channelId)).emit("voice:peer-left", {
      channelId,
      userId: peer.userId,
    });
    if (session.size === 0) voiceSessions.delete(channelId);
  }
}

async function runDebateClockTick() {
  if (clockTickRunning) return;
  clockTickRunning = true;
  try {
    const payload = await readState();
    if (!payload?.state) return;
    const nowMs = Date.now();
    const settings = platformSettingsForState(payload.state);
    let changed = false;
    const channels = payload.state.channels.map((channel) => {
      if (judgingChannels.has(channel.id)) return channel;
      const result = advanceChannelIfExpired(channel, nowMs, settings);
      if (result.advanced) changed = true;
      return result.channel;
    });
    if (!changed) return;
    await writeStateAndBroadcast({ ...payload.state, channels }, "debate_clock_tick");
  } catch (error) {
    console.warn("Debate clock tick failed:", error?.message ?? error);
  } finally {
    clockTickRunning = false;
  }
}

io.on("connection", (socket) => {
  socket.data.userId = getSignedSessionUserId(socket.request);
  socket.emit("server-ready", {
    ...storagePayload(),
    now: new Date().toISOString(),
  });

  socket.on("voice:join", async (payload, callback) => {
    try {
      const channelId = String(payload?.channelId ?? "");
      const validation = await validateVoiceSocket(socket, channelId);
      if (!validation.ok) {
        callback?.({ ok: false, error: validation.error });
        return;
      }
      const session = getVoiceSession(channelId);
      const joinedAt = new Date().toISOString();
      session.set(validation.user.id, {
        userId: validation.user.id,
        displayName: validation.user.displayName,
        socketId: socket.id,
        joinedAt,
      });
      socket.join(voiceRoomKey(channelId));
      socket.to(voiceRoomKey(channelId)).emit("voice:peer-joined", {
        channelId,
        userId: validation.user.id,
        displayName: validation.user.displayName,
        joinedAt,
      });
      callback?.({
        ok: true,
        channelId,
        userId: validation.user.id,
        peers: voiceSessionPeers(channelId, socket.id),
      });
    } catch (error) {
      callback?.({ ok: false, error: "voice_signal_failed" });
    }
  });

  socket.on("voice:signal", async (payload, callback) => {
    try {
      const channelId = String(payload?.channelId ?? "");
      const toUserId = String(payload?.toUserId ?? "");
      const validation = await validateVoiceSocket(socket, channelId);
      if (!validation.ok) {
        callback?.({ ok: false, error: validation.error });
        return;
      }
      const session = voiceSessions.get(channelId);
      const target = session?.get(toUserId);
      if (!target || target.socketId === socket.id) {
        callback?.({ ok: false, error: "voice_peer_not_found" });
        return;
      }
      io.to(target.socketId).emit("voice:signal", {
        channelId,
        fromUserId: validation.user.id,
        type: String(payload?.type ?? ""),
        description: payload?.description ?? null,
        candidate: payload?.candidate ?? null,
      });
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, error: "voice_signal_failed" });
    }
  });

  socket.on("voice:leave", (payload, callback) => {
    const channelId = String(payload?.channelId ?? "");
    const userId = socket.data.userId || "";
    const session = voiceSessions.get(channelId);
    if (session?.has(userId)) {
      session.delete(userId);
      socket.leave(voiceRoomKey(channelId));
      socket.to(voiceRoomKey(channelId)).emit("voice:peer-left", { channelId, userId });
      if (session.size === 0) voiceSessions.delete(channelId);
    }
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    cleanupVoiceSocket(socket);
  });
});

function closeSocketServer() {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
}

function closeHttpServer() {
  return new Promise((resolve) => {
    httpServer.close((error) => {
      if (error) console.error("HTTP server close failed:", error.message);
      resolve();
    });
  });
}

async function requestShutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownStartedAt = new Date().toISOString();
  console.log("Nosu Best API shutdown requested", {
    reason,
    shutdownStartedAt,
    shutdownGraceMs: SHUTDOWN_GRACE_MS,
  });
  if (debateClockTimer) {
    clearInterval(debateClockTimer);
    debateClockTimer = null;
  }
  const forceExit = setTimeout(() => {
    console.error("Nosu Best API shutdown timed out", { reason, shutdownGraceMs: SHUTDOWN_GRACE_MS });
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref?.();
  await Promise.all([closeSocketServer(), closeHttpServer()]);
  clearTimeout(forceExit);
  console.log("Nosu Best API shutdown complete", { reason });
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void requestShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void requestShutdown("SIGTERM");
});

process.on("message", (message) => {
  if (message && typeof message === "object" && message.type === "shutdown") {
    void requestShutdown("ipc");
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void requestShutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  void requestShutdown("unhandledRejection", 1);
});

httpServer.listen(PORT, API_HOST, () => {
  console.log(`Nosu Best API running at http://${API_HOST}:${PORT}`);
  console.log(`Realtime: Socket.IO enabled`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(
    `Storage: ${
      usesNormalizedSupabase
        ? `Supabase normalized tables "${SUPABASE_TABLE_PREFIX}*"`
        : supabase
          ? `Supabase snapshot table "${SUPABASE_TABLE}"`
          : "local JSON file"
    }`,
  );
  if (!supabase) {
    console.log("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to enable Supabase storage.");
  }
  if (supabase && !usesNormalizedSupabase) {
    console.log("Set SUPABASE_STORAGE_MODE=normalized after running supabase/normalized-schema.sql to use real tables.");
  }
  debateClockTimer = setInterval(() => {
    void runDebateClockTick();
  }, DEBATE_CLOCK_TICK_MS);
});
