import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const API_PORT = Number(process.env.SMOKE_AUTH_PORT ?? 0) || 5200 + Math.floor(Math.random() * 1000);
const API_HOST = process.env.SMOKE_AUTH_HOST ?? "127.0.0.1";
const BASE_URL = `http://${API_HOST}:${API_PORT}`;
const TIMEOUT_MS = Number(process.env.SMOKE_AUTH_TIMEOUT_MS ?? 180_000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyState() {
  return {
    users: [],
    rooms: [],
    channels: [],
    ledger: [],
    reports: [],
    sanctions: [],
    notifications: [],
    auditLogs: [],
    currentUserId: null,
  };
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

async function putJson(url, body = {}, headers = {}) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function sessionHeaders(session) {
  return {
    cookie: session.cookie,
    "x-csrf-token": session.csrfToken,
  };
}

function sessionFromResponse(response, payload, label) {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.includes("nb_session="), `${label} should set an auth session cookie`);
  assert(typeof payload.csrfToken === "string" && payload.csrfToken.length > 0, `${label} should return csrfToken`);
  return { cookie: cookie.split(";")[0], csrfToken: payload.csrfToken };
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
  const dataDir = await mkdtemp(path.join(tmpdir(), "nosu-auth-smoke-"));
  const logs = [];
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      API_HOST,
      API_PORT: String(API_PORT),
      DATA_DIR: dataDir,
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_ANON_KEY: "",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      SUPABASE_STORAGE_MODE: "snapshot",
      ENABLE_DEMO_AUTH: "false",
      ENABLE_OPEN_STATE_WRITE: "true",
      SMS_PROVIDER: "dev",
      PHONE_CODE_HIDE_DEBUG: "false",
      PHONE_CODE_RESEND_SECONDS: "1",
      PHONE_CODE_TTL_SECONDS: "120",
      RATE_LIMIT_AUTH_WINDOW_SECONDS: "60",
      RATE_LIMIT_SIGNUP_MAX: "20",
      RATE_LIMIT_PHONE_REQUEST_MAX: "20",
      RATE_LIMIT_PHONE_VERIFY_MAX: "20",
      RATE_LIMIT_PASSWORD_MAX: "20",
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
    assert(health.storage === "file", "auth smoke should use isolated file storage");
    assert(health.smsProvider === "dev", "auth smoke should use dev SMS provider");
    assert(health.phoneDebugCodeExposed === true, "auth smoke should expose dev phone codes");
    assert(health.runtime?.phoneDebugCodeExposed === true, "runtime should expose dev phone codes");

    const init = await putJson(`${BASE_URL}/api/state`, { state: emptyState() });
    assert(init.response.ok, "auth smoke should initialize isolated state");

    const loginLimit = Number(health.runtime?.rateLimits?.loginMax ?? 0);
    assert(loginLimit > 0, "runtime should expose a positive login rate limit");
    const blockedLoginId = `blocked_${Date.now().toString(36)}`;
    let loginRateLimited = null;
    for (let attempt = 0; attempt <= loginLimit; attempt += 1) {
      const blockedLogin = await writeJson(`${BASE_URL}/api/auth/login`, {
        loginId: blockedLoginId,
        password: "wrong-password",
      });
      if (blockedLogin.response.status === 429) {
        loginRateLimited = blockedLogin;
        break;
      }
      assert(blockedLogin.response.status === 401, "bad login before the limit should report invalid credentials");
      assert(blockedLogin.payload.error === "invalid_credentials", "bad login should report invalid_credentials");
    }
    assert(loginRateLimited, "bad login attempts should eventually be rate limited");
    assert(loginRateLimited.payload.error === "rate_limited", "rate limited login should report rate_limited");
    assert(Number(loginRateLimited.payload.retryAfterSeconds) > 0, "rate limited login should include retryAfterSeconds");
    assert(loginRateLimited.response.headers.get("retry-after"), "rate limited login should include Retry-After header");

    const anonymousSession = await readJson(`${BASE_URL}/api/auth/session`);
    assert(anonymousSession.response.ok, "anonymous session check should succeed");
    assert(anonymousSession.payload.authenticated === false, "anonymous session should report authenticated=false");
    assert(anonymousSession.payload.csrfToken === null, "anonymous session should not return csrfToken");

    const loginId = `smoke_auth_${Date.now().toString(36)}`;
    const originalPassword = "smoke123";
    const resetPassword = "smoke456";
    const phone = "010-1234-5678";
    const signup = await writeJson(`${BASE_URL}/api/auth/signup`, {
      loginId,
      password: originalPassword,
      displayName: "Smoke Auth",
      phone,
      accentColor: "mint",
    });
    assert(signup.response.ok, "signup should succeed in isolated auth smoke");
    assert(signup.payload.ok === true, "signup payload should report ok=true");
    assert(typeof signup.payload.userId === "string" && signup.payload.userId.length > 0, "signup should return userId");
    const signupSession = sessionFromResponse(signup.response, signup.payload, "signup");
    const signupUser = signup.payload.state?.users?.find((user) => user.id === signup.payload.userId);
    assert(signupUser?.agreements?.requiredAccepted === false, "new signup should require agreement acceptance");
    assert(signupUser?.agreements?.requiredVersion, "new signup should include the required agreement version");

    const signedInSession = await readJson(`${BASE_URL}/api/auth/session`, { cookie: signupSession.cookie });
    assert(signedInSession.response.ok, "signed-in session check should succeed");
    assert(signedInSession.payload.authenticated === true, "signed-in session should report authenticated=true");
    assert(signedInSession.payload.userId === signup.payload.userId, "signed-in session should return the active user id");
    assert(signedInSession.payload.user?.displayName === "Smoke Auth", "signed-in session should return a safe user summary");
    assert(signedInSession.payload.user?.agreements?.requiredAccepted === false, "session should expose pending agreement state");
    assert(!("passwordHash" in (signedInSession.payload.user ?? {})), "signed-in session should not expose passwordHash");
    assert(!("passwordSalt" in (signedInSession.payload.user ?? {})), "signed-in session should not expose passwordSalt");
    assert(typeof signedInSession.payload.csrfToken === "string" && signedInSession.payload.csrfToken.length > 0, "signed-in session should return csrfToken");
    assert(signedInSession.payload.session?.expiresInSeconds > 0, "signed-in session should return a positive expiry window");

    const missingCsrfAgreement = await writeJson(
      `${BASE_URL}/api/auth/agreements/accept`,
      {},
      { cookie: signupSession.cookie },
    );
    assert(missingCsrfAgreement.response.status === 403, "agreement acceptance should require CSRF with a session");
    assert(missingCsrfAgreement.payload.error === "csrf_invalid", "missing agreement CSRF should report csrf_invalid");

    const agreementAccept = await writeJson(
      `${BASE_URL}/api/auth/agreements/accept`,
      {},
      sessionHeaders(signupSession),
    );
    assert(agreementAccept.response.ok, "agreement acceptance should succeed with session and CSRF");
    assert(agreementAccept.payload.agreements?.requiredAccepted === true, "agreement acceptance should return accepted=true");
    assert(agreementAccept.payload.agreements?.acceptedAt, "agreement acceptance should record acceptedAt");
    const acceptedUser = agreementAccept.payload.state?.users?.find((user) => user.id === signup.payload.userId);
    assert(acceptedUser?.agreements?.requiredAccepted === true, "agreement acceptance should persist on the user");

    const acceptedSession = await readJson(`${BASE_URL}/api/auth/session`, { cookie: signupSession.cookie });
    assert(acceptedSession.response.ok, "accepted session check should succeed");
    assert(acceptedSession.payload.user?.agreements?.requiredAccepted === true, "session should expose accepted agreement state");

    const unauthenticatedPhone = await writeJson(`${BASE_URL}/api/auth/phone/request-code`, {
      userId: signup.payload.userId,
      phone,
    });
    assert(unauthenticatedPhone.response.status === 401, "phone code request should require an authenticated session");
    assert(unauthenticatedPhone.payload.error === "not_authenticated", "unauthenticated phone request should report not_authenticated");

    const missingCsrfPhone = await writeJson(
      `${BASE_URL}/api/auth/phone/request-code`,
      { userId: signup.payload.userId, phone },
      { cookie: signupSession.cookie },
    );
    assert(missingCsrfPhone.response.status === 403, "phone code request should require CSRF with a session");
    assert(missingCsrfPhone.payload.error === "csrf_invalid", "missing CSRF should report csrf_invalid");

    const phoneCode = await writeJson(
      `${BASE_URL}/api/auth/phone/request-code`,
      { userId: signup.payload.userId, phone },
      sessionHeaders(signupSession),
    );
    assert(phoneCode.response.ok, "authenticated phone code request should succeed");
    assert(/^\d{6}$/.test(phoneCode.payload.devCode ?? ""), "phone code request should return a six digit devCode");
    assert(phoneCode.payload.smsProvider === "dev", "phone code request should report dev provider");
    assert(phoneCode.payload.smsSent === false, "dev phone code request should not claim SMS delivery");

    const badPhoneVerify = await writeJson(
      `${BASE_URL}/api/auth/phone/verify`,
      { userId: signup.payload.userId, phone, code: phoneCode.payload.devCode },
      { cookie: signupSession.cookie },
    );
    assert(badPhoneVerify.response.status === 403, "phone verify should require CSRF with a session");
    assert(badPhoneVerify.payload.error === "csrf_invalid", "missing CSRF verify should report csrf_invalid");

    const phoneVerify = await writeJson(
      `${BASE_URL}/api/auth/phone/verify`,
      { userId: "spoofed-user-id", phone, code: phoneCode.payload.devCode },
      sessionHeaders(signupSession),
    );
    assert(phoneVerify.response.ok, "phone verify should succeed with session user even if body userId is spoofed");
    const verifiedUser = phoneVerify.payload.state?.users?.find((user) => user.id === signup.payload.userId);
    assert(verifiedUser?.phoneVerified === true, "phone verify should mark the signed-in user as verified");

    const logoutMissingCsrf = await writeJson(
      `${BASE_URL}/api/auth/logout`,
      {},
      { cookie: signupSession.cookie },
    );
    assert(logoutMissingCsrf.response.status === 403, "logout should require CSRF with a session");
    assert(logoutMissingCsrf.payload.error === "csrf_invalid", "logout without CSRF should report csrf_invalid");

    const logout = await writeJson(`${BASE_URL}/api/auth/logout`, {}, sessionHeaders(signupSession));
    assert(logout.response.ok, "logout should succeed with session and CSRF");
    const clearedCookie = logout.response.headers.get("set-cookie") ?? "";
    assert(clearedCookie.includes("nb_session=;"), "logout should clear the auth session cookie");
    assert(clearedCookie.includes("Max-Age=0"), "logout should expire the auth session cookie");

    const postLogoutSession = await readJson(`${BASE_URL}/api/auth/session`);
    assert(postLogoutSession.response.ok, "post-logout anonymous session check should succeed");
    assert(postLogoutSession.payload.authenticated === false, "post-logout session should report authenticated=false when browser cookie is cleared");

    const postLogoutPhone = await writeJson(
      `${BASE_URL}/api/auth/phone/request-code`,
      { userId: signup.payload.userId, phone },
      { "x-csrf-token": signupSession.csrfToken },
    );
    assert(postLogoutPhone.response.status === 401, "post-logout protected request should require a fresh session cookie");
    assert(postLogoutPhone.payload.error === "not_authenticated", "post-logout protected request should report not_authenticated");

    const resetRequest = await writeJson(`${BASE_URL}/api/auth/password-reset/request-code`, { loginId, phone });
    assert(resetRequest.response.ok, "password reset code request should succeed");
    assert(/^\d{6}$/.test(resetRequest.payload.devCode ?? ""), "password reset request should return a six digit devCode");

    const wrongReset = await writeJson(`${BASE_URL}/api/auth/password-reset/confirm`, {
      loginId,
      phone,
      code: resetRequest.payload.devCode === "000000" ? "111111" : "000000",
      newPassword: resetPassword,
    });
    assert(wrongReset.response.status === 400, "wrong password reset code should be rejected");
    assert(wrongReset.payload.error === "invalid_password_reset_code", "wrong reset code should report invalid_password_reset_code");

    const resetConfirm = await writeJson(`${BASE_URL}/api/auth/password-reset/confirm`, {
      loginId,
      phone,
      code: resetRequest.payload.devCode,
      newPassword: resetPassword,
    });
    assert(resetConfirm.response.ok, "password reset confirm should succeed with the issued code");
    const resetSession = sessionFromResponse(resetConfirm.response, resetConfirm.payload, "password reset confirm");
    assert(resetSession.cookie.includes("nb_session="), "password reset should leave the user signed in");

    const oldLogin = await writeJson(`${BASE_URL}/api/auth/login`, { loginId, password: originalPassword });
    assert(oldLogin.response.status === 401, "old password should no longer work after reset");
    assert(oldLogin.payload.error === "invalid_credentials", "old password login should report invalid_credentials");

    const newLogin = await writeJson(`${BASE_URL}/api/auth/login`, { loginId, password: resetPassword });
    assert(newLogin.response.ok, "new password should work after reset");
    assert(newLogin.payload.userId === signup.payload.userId, "new password login should return the same user");
    const newLoginSession = sessionFromResponse(newLogin.response, newLogin.payload, "new password login");
    const newLoginSessionCheck = await readJson(`${BASE_URL}/api/auth/session`, { cookie: newLoginSession.cookie });
    assert(newLoginSessionCheck.response.ok, "new login session check should succeed");
    assert(newLoginSessionCheck.payload.authenticated === true, "new login session should report authenticated=true");
    assert(newLoginSessionCheck.payload.userId === signup.payload.userId, "new login session should return the same user");
    assert(newLoginSessionCheck.payload.user?.agreements?.requiredAccepted === true, "new login should preserve accepted agreements");

    console.log("Auth flow smoke passed", {
      api: BASE_URL,
      dataDir,
      loginId,
      userId: signup.payload.userId,
      storage: health.storage,
      smsProvider: health.smsProvider,
      agreementsAccepted: true,
      phoneVerified: true,
      passwordReset: true,
    });
  } catch (error) {
    console.error("Auth flow smoke failed:", error.message);
    if (logs.length) console.error(logs.join("\n"));
    process.exitCode = 1;
  } finally {
    await stopServer(server);
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Auth flow smoke failed:", error.message);
  process.exitCode = 1;
});
