import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const API_PORT = Number(process.env.SMOKE_STORAGE_PORT ?? 0) || 6200 + Math.floor(Math.random() * 1000);
const API_HOST = process.env.SMOKE_STORAGE_HOST ?? "127.0.0.1";
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const TIMEOUT_MS = Number(process.env.SMOKE_STORAGE_TIMEOUT_MS ?? 600_000);
const SECURE_BACKUP_CONFIRMATION = "EXPORT FULL BACKUP";
const RESTORE_BACKUP_CONFIRMATION = "RESTORE FULL BACKUP";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function staleAdminState() {
  return {
    users: [
      {
        id: "u_admin",
        loginId: "nosu",
        password: "demo",
        authProvider: "local",
        phone: "010-0000-2026",
        phoneVerified: true,
        displayName: "노수",
        title: "운영자",
        bio: "테스트용 오래된 운영자 상태",
        photoUrl: "",
        role: "admin",
        coins: 1200,
        claims: [],
        stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
      },
    ],
    rooms: [
      {
        id: "r_ai_labor",
        title: "AI와 노동시장",
        topic: "오래된 저장소 복구용 주제",
        createdBy: "u_admin",
        createdAt: "06.07 00:10",
      },
    ],
    channels: [],
    ledger: [],
    currentUserId: null,
  };
}

async function readJson(url, headers = {}) {
  return fetchJson(url, { headers: { accept: "application/json", ...headers } });
}

async function writeJson(url, body = {}, headers = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function putJson(url, body = {}, headers = {}) {
  return fetchJson(url, {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function fetchJson(url, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } catch (error) {
      lastError = error;
      await delay(150 * (attempt + 1));
    }
  }
  throw lastError ?? new Error(`fetch failed: ${url}`);
}

function sessionFromResponse(response, payload, label) {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.includes("nb_session="), `${label} should set an auth session cookie`);
  assert(typeof payload.csrfToken === "string" && payload.csrfToken.length > 0, `${label} should return csrfToken`);
  return { cookie: cookie.split(";")[0], csrfToken: payload.csrfToken };
}

function sessionHeaders(session) {
  return {
    cookie: session.cookie,
    "x-csrf-token": session.csrfToken,
  };
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
  const dataDir = await mkdtemp(path.join(tmpdir(), "nosu-storage-smoke-"));
  const logs = [];
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      API_HOST,
      API_PORT: String(API_PORT),
      DATA_DIR: dataDir,
      SUPABASE_URL: "https://your-project-ref.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "your-service-role-or-secret-key",
      SUPABASE_SECRET_KEY: "your-service-role-or-secret-key",
      SUPABASE_ANON_KEY: "your-supabase-anon-key",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      ENABLE_DEMO_AUTH: "false",
      ENABLE_OPEN_STATE_WRITE: "true",
      AI_JUDGE_FORCE_LOCAL: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  server.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
  server.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));

  try {
    const health = await waitForHealth(`${BASE_URL}/api/health`, Date.now() + TIMEOUT_MS);
    assert(health.storage === "file", "storage seed smoke should use isolated file storage");

    const init = await putJson(`${BASE_URL}/api/state`, { state: staleAdminState() });
    assert(init.response.ok, "storage seed smoke should initialize stale state");
    assert(init.payload.state?.channels?.length === 0, "stale state should start without channels");

    const login = await writeJson(`${BASE_URL}/api/auth/login`, { loginId: "nosu", password: "demo" });
    assert(login.response.ok, "stale admin login should succeed");
    const session = sessionFromResponse(login.response, login.payload, "stale admin login");

    const unauthenticatedSeed = await writeJson(`${BASE_URL}/api/admin/seed-demo-state`);
    assert(unauthenticatedSeed.response.status === 401, "demo seed should require authentication");
    assert(unauthenticatedSeed.payload.error === "not_authenticated", "unauthenticated seed should report not_authenticated");

    const missingCsrfSeed = await writeJson(`${BASE_URL}/api/admin/seed-demo-state`, {}, { cookie: session.cookie });
    assert(missingCsrfSeed.response.status === 403, "demo seed should require CSRF");
    assert(missingCsrfSeed.payload.error === "csrf_invalid", "missing CSRF seed should report csrf_invalid");

    const seeded = await writeJson(`${BASE_URL}/api/admin/seed-demo-state`, {}, sessionHeaders(session));
    assert(seeded.response.ok, "authenticated demo seed should succeed");
    assert(seeded.payload.ok === true, "demo seed payload should report ok=true");
    assert(seeded.payload.state?.users?.length >= 4, "demo seed should restore demo users");
    assert(seeded.payload.state?.rooms?.length >= 3, "demo seed should restore demo rooms");
    assert(seeded.payload.state?.channels?.some((channel) => channel.id === "d_ai_private"), "demo seed should restore voice invite channel");
    assert(seeded.payload.state?.channels?.some((channel) => channel.inviteCode === "NB-2046"), "demo seed should restore NB-2046 invite code");
    assert(seeded.payload.storageCheck?.ok === true, "demo seed should include storage check result");
    assert(seeded.payload.storageCheck?.appState?.channels >= 2, "storage check should count restored channels");
    assert(
      seeded.payload.state?.auditLogs?.some((log) => log.action === "admin_seed_demo_state"),
      "demo seed should write an audit log",
    );

    const stateAfter = await readJson(`${BASE_URL}/api/state`, { cookie: session.cookie });
    assert(stateAfter.response.ok, "state after seed should be readable");
    assert(stateAfter.payload.state?.channels?.length >= 2, "state after seed should retain restored channels");
    assert(stateAfter.payload.state?.users?.every((user) => !("passwordHash" in user)), "state response should not leak passwordHash");
    assert(stateAfter.payload.state?.serviceNotice === null, "fresh demo seed should start without a service notice");

    const unauthenticatedNotice = await writeJson(`${BASE_URL}/api/admin/service-notice`, {
      title: "Smoke notice",
      body: "This should be blocked without a session.",
      tone: "info",
      active: true,
    });
    assert(unauthenticatedNotice.response.status === 401, "service notice should require authentication");
    assert(
      unauthenticatedNotice.payload.error === "not_authenticated",
      "unauthenticated notice should report not_authenticated",
    );

    const missingCsrfNotice = await writeJson(
      `${BASE_URL}/api/admin/service-notice`,
      { title: "Smoke notice", body: "Missing CSRF should fail.", tone: "warning", active: true },
      { cookie: session.cookie },
    );
    assert(missingCsrfNotice.response.status === 403, "service notice should require CSRF");
    assert(missingCsrfNotice.payload.error === "csrf_invalid", "missing CSRF notice should report csrf_invalid");

    const invalidNotice = await writeJson(
      `${BASE_URL}/api/admin/service-notice`,
      { title: "", body: "", tone: "warning", active: true },
      sessionHeaders(session),
    );
    assert(invalidNotice.response.status === 400, "active service notice should require title and body");
    assert(invalidNotice.payload.error === "invalid_service_notice", "invalid notice should report invalid_service_notice");

    const expiredNotice = await writeJson(
      `${BASE_URL}/api/admin/service-notice`,
      {
        title: "지난 점검",
        body: "이미 끝난 점검 공지는 새로 게시하지 않습니다.",
        tone: "warning",
        active: true,
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      sessionHeaders(session),
    );
    assert(expiredNotice.response.status === 400, "service notice should reject an already-expired expiry");
    assert(expiredNotice.payload.error === "invalid_service_notice", "expired notice should report invalid_service_notice");

    const noticeExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const notice = await writeJson(
      `${BASE_URL}/api/admin/service-notice`,
      {
        title: "점검 안내",
        body: "오늘 23:00부터 10분간 토론장 점검이 진행됩니다.",
        tone: "warning",
        active: true,
        expiresAt: noticeExpiresAt,
      },
      sessionHeaders(session),
    );
    assert(notice.response.ok, "authenticated service notice publish should succeed");
    assert(notice.payload.ok === true, "service notice publish should report ok=true");
    assert(notice.payload.serviceNotice?.tone === "warning", "service notice should preserve warning tone");
    assert(notice.payload.serviceNotice?.expiresAt === noticeExpiresAt, "service notice should preserve expiry");
    assert(notice.payload.state?.serviceNotice?.title === "점검 안내", "state should include the published service notice");
    assert(
      notice.payload.state?.auditLogs?.some((log) => log.action === "admin_service_notice_update"),
      "service notice publish should write an audit log",
    );

    const stateAfterNotice = await readJson(`${BASE_URL}/api/state`, { cookie: session.cookie });
    assert(stateAfterNotice.response.ok, "state after service notice should be readable");
    assert(stateAfterNotice.payload.state?.serviceNotice?.active === true, "state should expose active service notice");
    assert(stateAfterNotice.payload.state?.serviceNotice?.expiresAt === noticeExpiresAt, "state service notice should include the expiry");
    assert(
      stateAfterNotice.payload.state?.serviceNotice?.body?.includes("토론장 점검"),
      "state service notice should include the published body",
    );

    const clearedNotice = await writeJson(
      `${BASE_URL}/api/admin/service-notice`,
      { active: false },
      sessionHeaders(session),
    );
    assert(clearedNotice.response.ok, "service notice clear should succeed");
    assert(clearedNotice.payload.ok === true, "service notice clear should report ok=true");
    assert(clearedNotice.payload.serviceNotice === null, "cleared service notice should be null");
    assert(clearedNotice.payload.state?.serviceNotice === null, "state should clear the service notice");
    assert(
      clearedNotice.payload.state?.auditLogs?.some((log) => log.action === "admin_service_notice_clear"),
      "service notice clear should write an audit log",
    );

    const unauthenticatedExport = await readJson(`${BASE_URL}/api/admin/state-export`);
    assert(unauthenticatedExport.response.status === 401, "state export should require authentication");
    assert(unauthenticatedExport.payload.error === "not_authenticated", "unauthenticated export should report not_authenticated");

    const unauthenticatedAuditExport = await readJson(`${BASE_URL}/api/admin/audit-export`);
    assert(unauthenticatedAuditExport.response.status === 401, "audit export should require authentication");
    assert(unauthenticatedAuditExport.payload.error === "not_authenticated", "unauthenticated audit export should report not_authenticated");

    const auditExport = await readJson(`${BASE_URL}/api/admin/audit-export`, { cookie: session.cookie });
    assert(auditExport.response.ok, "authenticated audit export should succeed");
    assert(auditExport.payload.ok === true, "audit export should report ok=true");
    assert(auditExport.response.headers.get("content-disposition")?.includes("nosu-best-audit-"), "audit export should suggest a JSON filename");
    assert(auditExport.response.headers.get("cache-control")?.includes("no-store"), "audit export should not be cacheable");
    assert(auditExport.payload.csvFilename?.endsWith(".csv"), "audit export should include a CSV filename");
    assert(auditExport.payload.count >= 1, "audit export should include at least the demo seed audit log");
    assert(Array.isArray(auditExport.payload.auditLogs), "audit export should include audit log rows");
    assert(auditExport.payload.auditLogs.some((log) => log.action === "admin_seed_demo_state"), "audit export should include the seed audit action");
    assert(auditExport.payload.csv?.includes("admin_seed_demo_state"), "audit export CSV should include the seed audit action");
    assert(!JSON.stringify(auditExport.payload).includes("passwordHash"), "audit export should not leak password hashes");

    const backup = await readJson(`${BASE_URL}/api/admin/state-export`, { cookie: session.cookie });
    assert(backup.response.ok, "authenticated state export should succeed");
    assert(backup.payload.ok === true, "state export should report ok=true");
    assert(backup.response.headers.get("content-disposition")?.includes("nosu-best-state-"), "state export should suggest a backup filename");
    assert(backup.payload.secretsIncluded === false, "state export should explicitly exclude secrets");
    assert(backup.payload.counts?.users >= 4, "state export should include user counts");
    assert(backup.payload.counts?.channels >= 2, "state export should include channel counts");
    assert(backup.payload.counts?.auditLogs >= 1, "state export should include audit log counts");
    assert(backup.payload.state?.currentUserId === null, "state export should not preserve active session user");
    assert(backup.payload.state?.users?.every((user) => !("passwordHash" in user) && !("passwordSalt" in user)), "state export should not leak password secrets");
    assert(!JSON.stringify(backup.payload).includes("your-service-role-or-secret-key"), "state export should not leak configured service keys");

    const unauthenticatedValidation = await writeJson(`${BASE_URL}/api/admin/state-export/validate`, {
      backup: backup.payload,
    });
    assert(unauthenticatedValidation.response.status === 401, "state backup validation should require authentication");
    assert(
      unauthenticatedValidation.payload.error === "not_authenticated",
      "unauthenticated validation should report not_authenticated",
    );

    const missingCsrfValidation = await writeJson(
      `${BASE_URL}/api/admin/state-export/validate`,
      { backup: backup.payload },
      { cookie: session.cookie },
    );
    assert(missingCsrfValidation.response.status === 403, "state backup validation should require CSRF");
    assert(missingCsrfValidation.payload.error === "csrf_invalid", "missing CSRF validation should report csrf_invalid");

    const validation = await writeJson(
      `${BASE_URL}/api/admin/state-export/validate`,
      { backup: backup.payload },
      sessionHeaders(session),
    );
    assert(validation.response.ok, "state backup validation should succeed for an exported backup");
    assert(validation.payload.ok === true, "state backup validation payload should report ok=true");
    assert(validation.payload.valid === true, "exported backup should validate as restorable state shape");
    assert(validation.payload.secretsIncluded === false, "exported backup validation should recognize redacted secrets");
    assert(validation.payload.warnings?.includes("password_secrets_redacted"), "redacted backup validation should warn about password reset needs");
    assert(validation.payload.counts?.users === backup.payload.counts.users, "backup validation should preserve user counts");
    assert(validation.payload.counts?.channels === backup.payload.counts.channels, "backup validation should preserve channel counts");
    assert(validation.payload.currentCounts?.users >= 4, "backup validation should include current app counts");

    const invalidValidation = await writeJson(
      `${BASE_URL}/api/admin/state-export/validate`,
      { backup: { state: { users: [] } } },
      sessionHeaders(session),
    );
    assert(invalidValidation.response.ok, "invalid backup validation should return a report instead of failing the request");
    assert(invalidValidation.payload.valid === false, "invalid backup should be marked invalid");
    assert(
      invalidValidation.payload.errors?.includes("missing_rooms_array"),
      "invalid backup should report missing required arrays",
    );

    const unauthenticatedSecureBackup = await writeJson(`${BASE_URL}/api/admin/state-export/secure`, {
      confirmation: SECURE_BACKUP_CONFIRMATION,
    });
    assert(unauthenticatedSecureBackup.response.status === 401, "secure state export should require authentication");
    assert(
      unauthenticatedSecureBackup.payload.error === "not_authenticated",
      "unauthenticated secure export should report not_authenticated",
    );

    const missingCsrfSecureBackup = await writeJson(
      `${BASE_URL}/api/admin/state-export/secure`,
      { confirmation: SECURE_BACKUP_CONFIRMATION },
      { cookie: session.cookie },
    );
    assert(missingCsrfSecureBackup.response.status === 403, "secure state export should require CSRF");
    assert(missingCsrfSecureBackup.payload.error === "csrf_invalid", "missing CSRF secure export should report csrf_invalid");

    const wrongConfirmationSecureBackup = await writeJson(
      `${BASE_URL}/api/admin/state-export/secure`,
      { confirmation: "EXPORT BACKUP" },
      sessionHeaders(session),
    );
    assert(wrongConfirmationSecureBackup.response.status === 400, "secure state export should require exact confirmation");
    assert(
      wrongConfirmationSecureBackup.payload.error === "secure_backup_confirmation_required",
      "wrong secure export confirmation should report a confirmation error",
    );

    const secureBackup = await writeJson(
      `${BASE_URL}/api/admin/state-export/secure`,
      { confirmation: SECURE_BACKUP_CONFIRMATION },
      sessionHeaders(session),
    );
    assert(secureBackup.response.ok, "authenticated secure state export should succeed");
    assert(secureBackup.payload.ok === true, "secure state export should report ok=true");
    assert(secureBackup.payload.secure === true, "secure state export should identify itself as secure");
    assert(secureBackup.payload.secretsIncluded === true, "secure state export should explicitly include password secrets");
    assert(secureBackup.payload.secretCounts?.passwordSecrets >= 1, "secure state export should include restorable password secrets");
    assert(secureBackup.payload.state?.users?.some((user) => user.passwordHash && user.passwordSalt), "secure backup users should include password hashes");
    assert(secureBackup.payload.state?.users?.every((user) => user.password === ""), "secure backup should not include plaintext passwords");
    assert(secureBackup.response.headers.get("content-disposition")?.includes("nosu-best-secure-state-"), "secure export should suggest a secure backup filename");
    assert(secureBackup.response.headers.get("cache-control")?.includes("no-store"), "secure export should not be cacheable");
    assert(!JSON.stringify(secureBackup.payload).includes("your-service-role-or-secret-key"), "secure export should not leak configured service keys");
    assert(
      secureBackup.payload.state?.auditLogs?.some((log) => log.action === "admin_secure_state_export"),
      "secure export should write an audit log",
    );

    const secureValidation = await writeJson(
      `${BASE_URL}/api/admin/state-export/validate`,
      { backup: secureBackup.payload },
      sessionHeaders(session),
    );
    assert(secureValidation.response.ok, "secure backup validation should succeed");
    assert(secureValidation.payload.valid === true, "secure backup should validate as restorable");
    assert(secureValidation.payload.secretsIncluded === true, "secure backup validation should recognize included secrets");
    assert(secureValidation.payload.restoreMode === "full-state", "secure backup should validate as full-state restore mode");

    const unauthenticatedRestore = await writeJson(`${BASE_URL}/api/admin/state-restore`, {
      backup: secureBackup.payload,
      confirmation: RESTORE_BACKUP_CONFIRMATION,
    });
    assert(unauthenticatedRestore.response.status === 401, "state restore should require authentication");
    assert(unauthenticatedRestore.payload.error === "not_authenticated", "unauthenticated restore should report not_authenticated");

    const missingCsrfRestore = await writeJson(
      `${BASE_URL}/api/admin/state-restore`,
      { backup: secureBackup.payload, confirmation: RESTORE_BACKUP_CONFIRMATION },
      { cookie: session.cookie },
    );
    assert(missingCsrfRestore.response.status === 403, "state restore should require CSRF");
    assert(missingCsrfRestore.payload.error === "csrf_invalid", "missing CSRF restore should report csrf_invalid");

    const wrongRestoreConfirmation = await writeJson(
      `${BASE_URL}/api/admin/state-restore`,
      { backup: secureBackup.payload, confirmation: "RESTORE BACKUP" },
      sessionHeaders(session),
    );
    assert(wrongRestoreConfirmation.response.status === 400, "state restore should require exact confirmation");
    assert(
      wrongRestoreConfirmation.payload.error === "state_restore_confirmation_required",
      "wrong restore confirmation should report confirmation error",
    );

    const redactedRestore = await writeJson(
      `${BASE_URL}/api/admin/state-restore`,
      { backup: backup.payload, confirmation: RESTORE_BACKUP_CONFIRMATION },
      sessionHeaders(session),
    );
    assert(redactedRestore.response.status === 400, "state restore should reject redacted backups");
    assert(
      redactedRestore.payload.error === "state_restore_requires_secure_backup",
      "redacted restore should report secure backup requirement",
    );

    const restoreProbeState = {
      ...staleAdminState(),
      rooms: [
        {
          id: "r_restore_probe",
          title: "Restore probe",
          topic: "Full backup restore should replace this stale state",
          createdBy: "u_admin",
          createdAt: "06.21 01:00",
        },
      ],
      channels: [],
      reports: [],
      sanctions: [],
      notifications: [],
      auditLogs: [],
    };
    const staleBeforeRestore = await putJson(
      `${BASE_URL}/api/state`,
      { state: restoreProbeState },
      sessionHeaders(session),
    );
    assert(staleBeforeRestore.response.ok, "restore smoke should be able to stage stale state");
    assert(staleBeforeRestore.payload.state?.channels?.length === 0, "restore probe should start without channels");

    const restored = await writeJson(
      `${BASE_URL}/api/admin/state-restore`,
      { backup: secureBackup.payload, confirmation: RESTORE_BACKUP_CONFIRMATION },
      sessionHeaders(session),
    );
    assert(restored.response.ok, "state restore should accept a secure backup");
    assert(restored.payload.ok === true, "state restore should report ok=true");
    assert(restored.payload.validation?.restoreMode === "full-state", "state restore should preserve full-state validation");
    assert(restored.payload.counts?.channels >= 2, "state restore should restore backed up channels");
    assert(restored.payload.storageCheck?.ok === true, "state restore should include storage check result");
    assert(
      restored.payload.state?.auditLogs?.some((log) => log.action === "admin_state_restore"),
      "state restore should append an audit log",
    );
    assert(
      restored.payload.state?.users?.every((user) => !("passwordHash" in user) && !("passwordSalt" in user)),
      "state restore response should not leak password secrets",
    );
    const stateAfterRestore = await readJson(`${BASE_URL}/api/state`, { cookie: session.cookie });
    assert(stateAfterRestore.response.ok, "state after restore should be readable");
    assert(stateAfterRestore.payload.state?.channels?.length >= 2, "state after restore should retain restored channels");
    assert(
      stateAfterRestore.payload.state?.users?.every((user) => !("passwordHash" in user) && !("passwordSalt" in user)),
      "state after restore should not leak password secrets",
    );

    console.log("Storage seed smoke passed", {
      api: BASE_URL,
      dataDir,
      storage: health.storage,
      users: seeded.payload.state.users.length,
      rooms: seeded.payload.state.rooms.length,
      channels: seeded.payload.state.channels.length,
      inviteCode: "NB-2046",
      backup: backup.payload.filename,
      auditExport: auditExport.payload.filename,
      backupValid: validation.payload.valid,
      secureBackup: secureBackup.payload.filename,
      secureBackupSecrets: secureBackup.payload.secretCounts.passwordSecrets,
      restoredChannels: restored.payload.counts.channels,
      serviceNoticeAudited: Boolean(
        clearedNotice.payload.state?.auditLogs?.some((log) => log.action === "admin_service_notice_clear"),
      ),
      auditLogged: true,
    });
  } catch (error) {
    console.error("Storage seed smoke failed:", error.message);
    if (logs.length) console.error(logs.join("\n"));
    process.exitCode = 1;
  } finally {
    await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Storage seed smoke failed:", error.message);
  process.exitCode = 1;
});
