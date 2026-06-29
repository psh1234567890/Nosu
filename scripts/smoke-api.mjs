const API_HEALTH_URL = process.env.SMOKE_API_HEALTH_URL ?? "http://127.0.0.1:4000/api/health";
const API_STATUS_URL = process.env.SMOKE_API_STATUS_URL ?? new URL("/api/status", API_HEALTH_URL).toString();
const API_STATE_URL = process.env.SMOKE_API_STATE_URL ?? "http://127.0.0.1:4000/api/state";
const API_AUTH_DEMO_URL =
  process.env.SMOKE_API_AUTH_DEMO_URL ?? new URL("/api/auth/select-demo", API_HEALTH_URL).toString();
const API_ADMIN_READINESS_URL =
  process.env.SMOKE_API_ADMIN_READINESS_URL ?? "http://127.0.0.1:4000/api/admin/readiness";
const API_ADMIN_PLATFORM_SETTINGS_URL =
  process.env.SMOKE_API_ADMIN_PLATFORM_SETTINGS_URL ?? new URL("/api/admin/platform-settings", API_HEALTH_URL).toString();
const API_ADMIN_STORAGE_CHECK_URL =
  process.env.SMOKE_API_ADMIN_STORAGE_CHECK_URL ?? "http://127.0.0.1:4000/api/admin/storage-check";
const API_ADMIN_SYNC_NORMALIZED_URL =
  process.env.SMOKE_API_ADMIN_SYNC_NORMALIZED_URL ?? "http://127.0.0.1:4000/api/admin/sync-normalized";
const VITE_HEALTH_URL = process.env.SMOKE_VITE_HEALTH_URL ?? "http://127.0.0.1:5173/api/health";
const APP_URL = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:5173/";
const SMOKE_ORIGIN = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:5173";
const SMOKE_BLOCKED_ORIGIN = process.env.SMOKE_BLOCKED_ORIGIN ?? "http://blocked.example.test";

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function readJsonResponse(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function writeJsonResponse(url, body = {}, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function readText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
}

async function readCorsHeaders(url, origin) {
  const response = await fetch(url, { headers: { accept: "application/json", origin } });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} during CORS check`);
  }
  return {
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArray(value, name) {
  assert(Array.isArray(value), `${name} must be an array`);
}

function assertHealthRuntime(payload, label = "health") {
  assert(payload.runtime && typeof payload.runtime === "object", `${label} must include runtime metadata`);
  assert(typeof payload.runtime.nodeEnv === "string" && payload.runtime.nodeEnv.length > 0, `${label}.runtime.nodeEnv is required`);
  assert(typeof payload.runtime.apiHost === "string" && payload.runtime.apiHost.length > 0, `${label}.runtime.apiHost is required`);
  assertArray(payload.runtime.allowedOrigins, `${label}.runtime.allowedOrigins`);
  assert(
    payload.runtime.allowedOrigins.includes(SMOKE_ORIGIN),
    `${label}.runtime.allowedOrigins should include smoke origin ${SMOKE_ORIGIN}`,
  );
  assert(typeof payload.runtime.production === "boolean", `${label}.runtime.production must be boolean`);
  assert(typeof payload.runtime.demoAuthEnabled === "boolean", `${label}.runtime.demoAuthEnabled must be boolean`);
  assert(typeof payload.runtime.openStateWriteEnabled === "boolean", `${label}.runtime.openStateWriteEnabled must be boolean`);
  assert(typeof payload.runtime.phoneDebugCodeExposed === "boolean", `${label}.runtime.phoneDebugCodeExposed must be boolean`);
  assert(typeof payload.runtime.aiJudgeForceLocal === "boolean", `${label}.runtime.aiJudgeForceLocal must be boolean`);
  assert(typeof payload.runtime.staticAppEnabled === "boolean", `${label}.runtime.staticAppEnabled must be boolean`);
  assert(typeof payload.runtime.staticAppAvailable === "boolean", `${label}.runtime.staticAppAvailable must be boolean`);
  assert(payload.runtime.release && typeof payload.runtime.release === "object", `${label}.runtime.release is required`);
  assert(typeof payload.runtime.release.version === "string" && payload.runtime.release.version.length > 0, `${label}.runtime.release.version is required`);
  assert(typeof payload.runtime.release.commit === "string" && payload.runtime.release.commit.length > 0, `${label}.runtime.release.commit is required`);
  assert(
    typeof payload.runtime.release.commitShort === "string" && payload.runtime.release.commitShort.length > 0,
    `${label}.runtime.release.commitShort is required`,
  );
  assert(typeof payload.runtime.release.channel === "string" && payload.runtime.release.channel.length > 0, `${label}.runtime.release.channel is required`);
  assert(typeof payload.runtime.release.configured === "boolean", `${label}.runtime.release.configured must be boolean`);
  if (payload.runtime.release.buildTime !== null) {
    assert(typeof payload.runtime.release.buildTime === "string", `${label}.runtime.release.buildTime must be string or null`);
  }
  assert(payload.runtime.process && typeof payload.runtime.process === "object", `${label}.runtime.process is required`);
  assert(Number.isFinite(payload.runtime.process.pid) && payload.runtime.process.pid > 0, `${label}.runtime.process.pid must be positive`);
  assert(typeof payload.runtime.process.startedAt === "string", `${label}.runtime.process.startedAt must be string`);
  assert(
    Number.isFinite(payload.runtime.process.uptimeSeconds) && payload.runtime.process.uptimeSeconds >= 0,
    `${label}.runtime.process.uptimeSeconds must be non-negative`,
  );
  assert(typeof payload.runtime.process.shuttingDown === "boolean", `${label}.runtime.process.shuttingDown must be boolean`);
  assert(
    Number.isFinite(payload.runtime.process.shutdownGraceMs) && payload.runtime.process.shutdownGraceMs > 0,
    `${label}.runtime.process.shutdownGraceMs must be positive`,
  );
  assert(payload.runtime.rateLimits && typeof payload.runtime.rateLimits === "object", `${label}.runtime.rateLimits is required`);
  for (const key of [
    "authWindowSeconds",
    "writeWindowSeconds",
    "loginMax",
    "signupMax",
    "phoneRequestMax",
    "phoneVerifyMax",
    "passwordMax",
    "messageMax",
    "reportMax",
    "phoneCodeTtlSeconds",
    "phoneCodeResendSeconds",
    "phoneCodeMaxAttempts",
  ]) {
    assert(
      Number.isFinite(payload.runtime.rateLimits[key]) && payload.runtime.rateLimits[key] > 0,
      `${label}.runtime.rateLimits.${key} must be a positive number`,
    );
  }
  assert(
    Number.isFinite(payload.runtime.rateLimits.activeBuckets) && payload.runtime.rateLimits.activeBuckets >= 0,
    `${label}.runtime.rateLimits.activeBuckets must be a non-negative number`,
  );
  assert(
    payload.runtime.providerDiagnostics && typeof payload.runtime.providerDiagnostics === "object",
    `${label}.runtime.providerDiagnostics is required`,
  );
  const providers = payload.runtime.providerDiagnostics;
  assert(providers.sms && typeof providers.sms === "object", `${label}.runtime.providerDiagnostics.sms is required`);
  assert(typeof providers.sms.provider === "string" && providers.sms.provider.length > 0, `${label}.runtime.providerDiagnostics.sms.provider is required`);
  assert(typeof providers.sms.configured === "boolean", `${label}.runtime.providerDiagnostics.sms.configured must be boolean`);
  assert(typeof providers.sms.realProvider === "boolean", `${label}.runtime.providerDiagnostics.sms.realProvider must be boolean`);
  assert(typeof providers.sms.senderConfigured === "boolean", `${label}.runtime.providerDiagnostics.sms.senderConfigured must be boolean`);
  assert(typeof providers.sms.debugCodeExposed === "boolean", `${label}.runtime.providerDiagnostics.sms.debugCodeExposed must be boolean`);
  assert(typeof providers.sms.productionReady === "boolean", `${label}.runtime.providerDiagnostics.sms.productionReady must be boolean`);
  assert(providers.oauth && typeof providers.oauth === "object", `${label}.runtime.providerDiagnostics.oauth is required`);
  assert(typeof providers.oauth.serverConfigured === "boolean", `${label}.runtime.providerDiagnostics.oauth.serverConfigured must be boolean`);
  assert(typeof providers.oauth.clientConfigured === "boolean", `${label}.runtime.providerDiagnostics.oauth.clientConfigured must be boolean`);
  assert(typeof providers.oauth.anonKeyPresent === "boolean", `${label}.runtime.providerDiagnostics.oauth.anonKeyPresent must be boolean`);
  assert(typeof providers.oauth.productionReady === "boolean", `${label}.runtime.providerDiagnostics.oauth.productionReady must be boolean`);
  assert(providers.ai && typeof providers.ai === "object", `${label}.runtime.providerDiagnostics.ai is required`);
  assert(typeof providers.ai.configured === "boolean", `${label}.runtime.providerDiagnostics.ai.configured must be boolean`);
  assert(typeof providers.ai.model === "string" && providers.ai.model.length > 0, `${label}.runtime.providerDiagnostics.ai.model is required`);
  assert(typeof providers.ai.forceLocal === "boolean", `${label}.runtime.providerDiagnostics.ai.forceLocal must be boolean`);
  assert(typeof providers.ai.productionReady === "boolean", `${label}.runtime.providerDiagnostics.ai.productionReady must be boolean`);
  assert(providers.storage && typeof providers.storage === "object", `${label}.runtime.providerDiagnostics.storage is required`);
  assert(["supabase", "file"].includes(providers.storage.storage), `${label}.runtime.providerDiagnostics.storage.storage is invalid`);
  assert(
    ["normalized", "snapshot", "file"].includes(providers.storage.storageMode),
    `${label}.runtime.providerDiagnostics.storage.storageMode is invalid`,
  );
  assert(typeof providers.storage.supabaseConfigured === "boolean", `${label}.runtime.providerDiagnostics.storage.supabaseConfigured must be boolean`);
  assert(typeof providers.storage.normalized === "boolean", `${label}.runtime.providerDiagnostics.storage.normalized must be boolean`);
  assert(typeof providers.storage.productionReady === "boolean", `${label}.runtime.providerDiagnostics.storage.productionReady must be boolean`);
  assert(typeof payload.runtime.permissionsPolicy === "string", `${label}.runtime.permissionsPolicy must be string`);
  assert(
    payload.runtime.permissionsPolicy.includes("microphone=(self)"),
    `${label}.runtime.permissionsPolicy should allow same-origin microphone for voice debates`,
  );
}

function assertPlatformSettings(settings, label = "platformSettings") {
  assert(settings && typeof settings === "object", `${label} must be an object`);
  assert(settings.debate && typeof settings.debate === "object", `${label}.debate is required`);
  assert(settings.moderation && typeof settings.moderation === "object", `${label}.moderation is required`);
  assert(settings.debate.openingSeconds >= 30 && settings.debate.openingSeconds <= 600, `${label}.debate.openingSeconds is out of range`);
  assert(settings.debate.closingSeconds >= 30 && settings.debate.closingSeconds <= 600, `${label}.debate.closingSeconds is out of range`);
  assert(settings.debate.crossfireSeconds >= 30 && settings.debate.crossfireSeconds <= 600, `${label}.debate.crossfireSeconds is out of range`);
  assert(settings.debate.defaultCoinStake >= 0 && settings.debate.defaultCoinStake <= 10000, `${label}.debate.defaultCoinStake is out of range`);
  assert(settings.debate.minWinnerRewardCoins >= 0 && settings.debate.minWinnerRewardCoins <= 10000, `${label}.debate.minWinnerRewardCoins is out of range`);
  assert(settings.debate.winnerRewardRate >= 0 && settings.debate.winnerRewardRate <= 1, `${label}.debate.winnerRewardRate is out of range`);
  assert(settings.moderation.reportReviewThreshold >= 1 && settings.moderation.reportReviewThreshold <= 20, `${label}.moderation.reportReviewThreshold is out of range`);
  assert(settings.moderation.suspensionDefaultHours >= 1 && settings.moderation.suspensionDefaultHours <= 720, `${label}.moderation.suspensionDefaultHours is out of range`);
}

function assertReadinessPayload(payload) {
  assert(payload?.ok === true, "Readiness must report ok=true");
  assert(payload.summary && typeof payload.summary === "object", "Readiness must include summary");
  assertArray(payload.checks, "readiness.checks");
  assert(payload.summary.total === payload.checks.length, "Readiness summary.total must match checks length");
  assert(
    payload.summary.ready + payload.summary.warning + payload.summary.blocked === payload.summary.total,
    "Readiness summary counts must add up to total",
  );
  assert(payload.runtime && typeof payload.runtime === "object", "Readiness must include runtime");
  assertHealthRuntime(payload, "readiness");
  assert(payload.service && typeof payload.service === "object", "Readiness must include service");
  assert(typeof payload.service.smsConfigured === "boolean", "Readiness service.smsConfigured must be boolean");
  assert(typeof payload.service.oauthConfigured === "boolean", "Readiness service.oauthConfigured must be boolean");
  assert(typeof payload.service.aiJudgeConfigured === "boolean", "Readiness service.aiJudgeConfigured must be boolean");
  assertPlatformSettings(payload.service.platformSettings, "readiness.service.platformSettings");

  const validStatuses = new Set(["ready", "warning", "blocked"]);
  const validPriorities = new Set(["required", "recommended"]);
  const expectedCheckIds = new Set([
    "process_lifecycle",
    "release_identity",
    "storage",
    "oauth",
    "sms",
    "ai_judge",
    "security",
    "abuse_limits",
    "security_headers",
    "static_app",
    "origins",
    "voice_permissions",
    "realtime",
  ]);
  const actualCheckIds = new Set(payload.checks.map((item) => item.id));
  for (const id of expectedCheckIds) {
    assert(actualCheckIds.has(id), `Readiness checks should include ${id}`);
  }
  for (const item of payload.checks) {
    assert(item.id && typeof item.id === "string", "Readiness check must include id");
    assert(item.label && typeof item.label === "string", `Readiness check ${item.id} must include label`);
    assert(validStatuses.has(item.status), `Readiness check ${item.id} has invalid status ${item.status}`);
    assert(typeof item.detail === "string" && item.detail.length > 0, `Readiness check ${item.id} must include detail`);
    assert(typeof item.phase === "string" && item.phase.length > 0, `Readiness check ${item.id} must include phase`);
    assert(validPriorities.has(item.priority), `Readiness check ${item.id} has invalid priority ${item.priority}`);
    assert(typeof item.required === "boolean", `Readiness check ${item.id} must include required flag`);
  }

  assert(payload.launch && typeof payload.launch === "object", "Readiness must include launch summary");
  assert(validStatuses.has(payload.launch.status), `Launch status is invalid: ${payload.launch.status}`);
  assert(typeof payload.launch.label === "string" && payload.launch.label.length > 0, "Launch label is required");
  assert(typeof payload.launch.headline === "string" && payload.launch.headline.length > 0, "Launch headline is required");
  assertArray(payload.launch.blockers, "readiness.launch.blockers");
  assertArray(payload.launch.warnings, "readiness.launch.warnings");
  assertArray(payload.launch.requiredOpen, "readiness.launch.requiredOpen");
  assertArray(payload.launch.recommendedOpen, "readiness.launch.recommendedOpen");
  assertArray(payload.launch.phaseSummary, "readiness.launch.phaseSummary");
  assertArray(payload.launch.nextActions, "readiness.launch.nextActions");
  assertArray(payload.launch.env, "readiness.launch.env");
  assert(typeof payload.launch.envTemplate === "string", "readiness.launch.envTemplate must be a string");
  assertArray(payload.launch.commands, "readiness.launch.commands");
  const launchCommandIds = new Set(payload.launch.commands.map((item) => item.id));
  for (const id of [
    "verify",
    "release-env",
    "release-env-json",
    "build",
    "start-release",
    "release-preflight",
    "release-evidence",
    "release-rehearsal",
    "promotion-refresh",
    "promotion-refresh-strict",
    "full-smoke",
  ]) {
    assert(launchCommandIds.has(id), `readiness.launch.commands should include ${id}`);
  }
  for (const item of payload.launch.commands) {
    assert(typeof item.id === "string" && item.id.length > 0, "Launch command must include id");
    assert(typeof item.label === "string" && item.label.length > 0, `Launch command ${item.id} must include label`);
    assert(
      typeof item.command === "string" && item.command.includes("npm.cmd"),
      `Launch command ${item.id} must include an npm.cmd command`,
    );
    assert(typeof item.detail === "string" && item.detail.length > 0, `Launch command ${item.id} must include detail`);
  }
  assert(payload.launch.evidence && typeof payload.launch.evidence === "object", "readiness.launch.evidence is required");
  assert(
    typeof payload.launch.evidence.packageFilename === "string" &&
      payload.launch.evidence.packageFilename.startsWith("nosu-best-launch-evidence-") &&
      payload.launch.evidence.packageFilename.endsWith(".json"),
    "readiness.launch.evidence must include a launch evidence package filename",
  );
  assertArray(payload.launch.evidence.checklist, "readiness.launch.evidence.checklist");
  const evidenceIds = new Set(payload.launch.evidence.checklist.map((item) => item.id));
  for (const id of [
    "readiness-report",
    "readiness-json",
    "env-draft",
    "release-env-json",
    "release-preflight-json",
    "release-preflight-markdown",
    "release-smoke-json",
    "release-smoke-markdown",
    "launch-evidence-json",
    "launch-evidence-markdown",
    "launch-rehearsal-json",
    "launch-rehearsal-markdown",
  ]) {
    assert(evidenceIds.has(id), `readiness.launch.evidence.checklist should include ${id}`);
  }
  for (const item of payload.launch.evidence.checklist) {
    assert(typeof item.label === "string" && item.label.length > 0, `Evidence item ${item.id} must include label`);
    assert(typeof item.artifact === "string" && item.artifact.length > 0, `Evidence item ${item.id} must include artifact`);
    assert(typeof item.required === "boolean", `Evidence item ${item.id} must include required flag`);
  }
  assert(payload.launch.promotionGate && typeof payload.launch.promotionGate === "object", "readiness.launch.promotionGate is required");
  assert(
    ["ready", "partial", "blocked"].includes(payload.launch.promotionGate.status),
    `Promotion gate status is invalid: ${payload.launch.promotionGate.status}`,
  );
  assert(
    typeof payload.launch.promotionGate.label === "string" && payload.launch.promotionGate.label.length > 0,
    "Promotion gate label is required",
  );
  assert(
    typeof payload.launch.promotionGate.detail === "string" && payload.launch.promotionGate.detail.length > 0,
    "Promotion gate detail is required",
  );
  assert(
    Number.isFinite(payload.launch.promotionGate.maxAgeHours) && payload.launch.promotionGate.maxAgeHours > 0,
    "Promotion gate must expose a positive freshness window",
  );
  assertArray(payload.launch.promotionGate.artifacts, "readiness.launch.promotionGate.artifacts");
  assertArray(payload.launch.promotionGate.nextActions, "readiness.launch.promotionGate.nextActions");
  assert(
    payload.launch.promotionGate.strict && typeof payload.launch.promotionGate.strict === "object",
    "readiness.launch.promotionGate.strict is required",
  );
  assert(
    ["ready", "pending", "blocked"].includes(payload.launch.promotionGate.strict.status),
    `Promotion strict status is invalid: ${payload.launch.promotionGate.strict.status}`,
  );
  assert(
    typeof payload.launch.promotionGate.strict.label === "string" && payload.launch.promotionGate.strict.label.length > 0,
    "Promotion strict label is required",
  );
  assert(
    typeof payload.launch.promotionGate.strict.detail === "string" && payload.launch.promotionGate.strict.detail.length > 0,
    "Promotion strict detail is required",
  );
  assert(
    typeof payload.launch.promotionGate.strict.command === "string" &&
      payload.launch.promotionGate.strict.command.includes("release:promotion-refresh:strict"),
    "Promotion strict command should point to the strict refresh command",
  );
  assert(payload.launch.promotionGate.strict.artifactId === "launch-rehearsal", "Promotion strict artifact should be launch-rehearsal");
  assert(typeof payload.launch.promotionGate.strict.currentMode === "string", "Promotion strict currentMode is required");
  assert(typeof payload.launch.promotionGate.strict.ready === "boolean", "Promotion strict ready flag is required");
  assert(typeof payload.launch.promotionGate.strict.localReady === "boolean", "Promotion strict localReady flag is required");
  const promotionArtifactIds = new Set(payload.launch.promotionGate.artifacts.map((item) => item.id));
  for (const id of ["release-preflight", "smoke-full", "launch-evidence", "launch-rehearsal", "promotion-refresh"]) {
    assert(promotionArtifactIds.has(id), `promotion gate should include ${id}`);
  }
  for (const artifact of payload.launch.promotionGate.artifacts) {
    assert(typeof artifact.label === "string" && artifact.label.length > 0, `Promotion artifact ${artifact.id} must include label`);
    assert(typeof artifact.path === "string" && artifact.path.startsWith("output/"), `Promotion artifact ${artifact.id} must include output path`);
    assert(typeof artifact.command === "string" && artifact.command.includes("npm.cmd"), `Promotion artifact ${artifact.id} must include command`);
    assert(typeof artifact.required === "boolean", `Promotion artifact ${artifact.id} must include required flag`);
    assert(typeof artifact.exists === "boolean", `Promotion artifact ${artifact.id} must include exists flag`);
    assert(typeof artifact.fresh === "boolean", `Promotion artifact ${artifact.id} must include fresh flag`);
    assert(typeof artifact.ok === "boolean", `Promotion artifact ${artifact.id} must include ok flag`);
    assert(typeof artifact.blocking === "boolean", `Promotion artifact ${artifact.id} must include blocking flag`);
    assert(typeof artifact.status === "string" && artifact.status.length > 0, `Promotion artifact ${artifact.id} must include status`);
    assert(typeof artifact.detail === "string" && artifact.detail.length > 0, `Promotion artifact ${artifact.id} must include detail`);
  }
  assert(payload.launch.handoff && typeof payload.launch.handoff === "object", "readiness.launch.handoff is required");
  assert(
    typeof payload.launch.handoff.filename === "string" &&
      payload.launch.handoff.filename.startsWith("nosu-best-launch-handoff-") &&
      payload.launch.handoff.filename.endsWith(".json"),
    "readiness.launch.handoff must include a JSON filename",
  );
  assert(
    typeof payload.launch.handoff.markdownFilename === "string" &&
      payload.launch.handoff.markdownFilename.startsWith("nosu-best-launch-handoff-") &&
      payload.launch.handoff.markdownFilename.endsWith(".md"),
    "readiness.launch.handoff must include a Markdown filename",
  );
  assert(
    ["ready", "pending", "blocked"].includes(payload.launch.handoff.status),
    `Launch handoff status is invalid: ${payload.launch.handoff.status}`,
  );
  assert(typeof payload.launch.handoff.label === "string" && payload.launch.handoff.label.length > 0, "Launch handoff label is required");
  assert(typeof payload.launch.handoff.summary === "string" && payload.launch.handoff.summary.length > 0, "Launch handoff summary is required");
  assert(payload.launch.handoff.goNoGo && typeof payload.launch.handoff.goNoGo === "object", "Launch handoff go/no-go summary is required");
  assert(typeof payload.launch.handoff.goNoGo.canLaunch === "boolean", "Launch handoff go/no-go must include canLaunch");
  assert(typeof payload.launch.handoff.goNoGo.strictReady === "boolean", "Launch handoff go/no-go must include strictReady");
  assert(typeof payload.launch.handoff.goNoGo.localReady === "boolean", "Launch handoff go/no-go must include localReady");
  assert(Number.isFinite(payload.launch.handoff.goNoGo.requiredOpen), "Launch handoff go/no-go must include requiredOpen count");
  assert(Number.isFinite(payload.launch.handoff.goNoGo.blockers), "Launch handoff go/no-go must include blocker count");
  assertArray(payload.launch.handoff.commands, "readiness.launch.handoff.commands");
  const handoffCommandIds = new Set(payload.launch.handoff.commands.map((item) => item.id));
  for (const id of ["check-release-env", "strict-promotion-refresh", "start-release"]) {
    assert(handoffCommandIds.has(id), `launch handoff commands should include ${id}`);
  }
  for (const command of payload.launch.handoff.commands) {
    assert(typeof command.label === "string" && command.label.length > 0, `Launch handoff command ${command.id} must include label`);
    assert(
      typeof command.command === "string" && command.command.includes("npm.cmd"),
      `Launch handoff command ${command.id} must include an npm.cmd command`,
    );
    assert(typeof command.required === "boolean", `Launch handoff command ${command.id} must include required`);
    assert(typeof command.detail === "string" && command.detail.length > 0, `Launch handoff command ${command.id} must include detail`);
  }
  assertArray(payload.launch.handoff.artifacts, "readiness.launch.handoff.artifacts");
  assert(payload.launch.handoff.artifacts.includes(payload.launch.report.filename), "Launch handoff should include readiness Markdown artifact");
  assert(payload.launch.handoff.artifacts.includes(payload.launch.evidence.packageFilename), "Launch handoff should include evidence package artifact");
  assertArray(payload.launch.handoff.checklist, "readiness.launch.handoff.checklist");
  const handoffChecklistIds = new Set(payload.launch.handoff.checklist.map((item) => item.id));
  for (const id of ["production-env", "local-evidence", "strict-rehearsal", "release-start"]) {
    assert(handoffChecklistIds.has(id), `launch handoff checklist should include ${id}`);
  }
  for (const item of payload.launch.handoff.checklist) {
    assert(["ready", "pending", "blocked"].includes(item.status), `Launch handoff checklist ${item.id} has invalid status`);
    assert(typeof item.label === "string" && item.label.length > 0, `Launch handoff checklist ${item.id} must include label`);
    assert(typeof item.detail === "string" && item.detail.length > 0, `Launch handoff checklist ${item.id} must include detail`);
  }
  assert(
    typeof payload.launch.handoff.markdown === "string" &&
      payload.launch.handoff.markdown.includes("Nosu Best Launch Handoff") &&
      payload.launch.handoff.markdown.includes("## Go / No-Go") &&
      payload.launch.handoff.markdown.includes("## Checklist"),
    "Launch handoff must include Markdown content",
  );
  assert(payload.launch.report && typeof payload.launch.report === "object", "readiness.launch.report is required");
  assert(
    typeof payload.launch.report.generatedAt === "string" && payload.launch.report.generatedAt.length > 0,
    "readiness launch report must include generatedAt",
  );
  assert(
    typeof payload.launch.report.filename === "string" &&
      payload.launch.report.filename.startsWith("nosu-best-readiness-") &&
      payload.launch.report.filename.endsWith(".md"),
    "readiness launch report must include a Markdown filename",
  );
  assert(
    typeof payload.launch.report.jsonFilename === "string" &&
      payload.launch.report.jsonFilename.startsWith("nosu-best-readiness-") &&
      payload.launch.report.jsonFilename.endsWith(".json"),
    "readiness launch report must include a JSON filename",
  );
  assert(
    typeof payload.launch.report.markdown === "string" &&
      payload.launch.report.markdown.includes("Nosu Best Launch Readiness Report") &&
      payload.launch.report.markdown.includes("## Next Actions") &&
      payload.launch.report.markdown.includes("## Release Commands"),
    "readiness launch report must include Markdown report content",
  );
  assert(payload.launch.blockers.length === payload.summary.blocked, "Launch blocker count must match summary.blocked");
  assert(payload.launch.warnings.length === payload.summary.warning, "Launch warning count must match summary.warning");
  assert(
    payload.launch.requiredOpen.length + payload.launch.recommendedOpen.length ===
      payload.summary.blocked + payload.summary.warning,
    "Launch required/recommended open counts must match non-ready checks",
  );
  for (const item of payload.launch.blockers) {
    assert(item.status === "blocked", `Launch blocker ${item.id} must have blocked status`);
  }
  for (const item of payload.launch.warnings) {
    assert(item.status === "warning", `Launch warning ${item.id} must have warning status`);
  }
  if (payload.launch.status === "blocked") {
    assert(payload.launch.blockers.length > 0, "Blocked launch status must include blockers");
    assert(payload.launch.nextActions.length > 0, "Blocked launch status must include next actions");
  }
  const phaseTotals = payload.launch.phaseSummary.reduce(
    (total, phase) => {
      assert(typeof phase.phase === "string" && phase.phase.length > 0, "Phase summary item must include phase");
      assert(typeof phase.label === "string" && phase.label.length > 0, `Phase ${phase.phase} must include label`);
      assert(typeof phase.total === "number", `Phase ${phase.phase} must include total`);
      assert(typeof phase.ready === "number", `Phase ${phase.phase} must include ready count`);
      assert(typeof phase.warning === "number", `Phase ${phase.phase} must include warning count`);
      assert(typeof phase.blocked === "number", `Phase ${phase.phase} must include blocked count`);
      assert(typeof phase.requiredOpen === "number", `Phase ${phase.phase} must include requiredOpen count`);
      assert(phase.ready + phase.warning + phase.blocked === phase.total, `Phase ${phase.phase} counts must add up`);
      return {
        total: total.total + phase.total,
        requiredOpen: total.requiredOpen + phase.requiredOpen,
      };
    },
    { total: 0, requiredOpen: 0 },
  );
  assert(phaseTotals.total === payload.checks.length, "Phase summary totals must match readiness checks");
  assert(
    phaseTotals.requiredOpen === payload.launch.requiredOpen.length,
    "Phase summary requiredOpen total must match launch.requiredOpen",
  );
  if (payload.launch.env.length > 0) {
    assert(payload.launch.envTemplate.includes("Nosu Best production env draft"), "Launch env template should include a header");
    for (const envItem of payload.launch.env) {
      const envKey = String(envItem).split("=")[0];
      assert(payload.launch.envTemplate.includes(envKey), `Launch env template should include ${envKey}`);
    }
  }
  return payload;
}

function assertPublicStatusPayload(payload) {
  assert(payload?.ok === true, "Public status must report ok=true during smoke");
  assert(payload.service === "nosu-best-api", "Public status reported an unexpected service name");
  assert(["operational", "degraded", "maintenance"].includes(payload.status), "Public status has an invalid status");
  assert(typeof payload.label === "string" && payload.label.length > 0, "Public status must include a label");
  assert(typeof payload.checkedAt === "string" && payload.checkedAt.length > 0, "Public status must include checkedAt");
  assert(payload.realtime && typeof payload.realtime === "object", "Public status must include realtime");
  assert(payload.realtime.enabled === true, "Public status realtime.enabled must be true");
  assert(Number.isFinite(payload.realtime.clients) && payload.realtime.clients >= 0, "Public status clients must be non-negative");
  assert(payload.storage && typeof payload.storage === "object", "Public status must include storage");
  assert(["supabase", "file"].includes(payload.storage.storage), "Public status storage is invalid");
  assert(["normalized", "snapshot", "file"].includes(payload.storage.storageMode), "Public status storageMode is invalid");
  assert(typeof payload.storage.supabaseConfigured === "boolean", "Public status supabaseConfigured must be boolean");
  assert(typeof payload.storage.normalized === "boolean", "Public status normalized must be boolean");
  assert(payload.runtime && typeof payload.runtime === "object", "Public status must include runtime");
  assert(typeof payload.runtime.production === "boolean", "Public status runtime.production must be boolean");
  assert(typeof payload.runtime.staticAppEnabled === "boolean", "Public status staticAppEnabled must be boolean");
  assert(typeof payload.runtime.staticAppAvailable === "boolean", "Public status staticAppAvailable must be boolean");
  assert(payload.runtime.release && typeof payload.runtime.release === "object", "Public status release is required");
  assert(typeof payload.runtime.release.version === "string" && payload.runtime.release.version.length > 0, "Public status release version is required");
  assert(typeof payload.runtime.release.commitShort === "string" && payload.runtime.release.commitShort.length > 0, "Public status release commit is required");
  assert(typeof payload.runtime.release.channel === "string" && payload.runtime.release.channel.length > 0, "Public status release channel is required");
  assert(typeof payload.runtime.release.configured === "boolean", "Public status release configured must be boolean");
  assert(payload.runtime.process && typeof payload.runtime.process === "object", "Public status process is required");
  assert(typeof payload.runtime.process.startedAt === "string", "Public status process.startedAt must be string");
  assert(
    Number.isFinite(payload.runtime.process.uptimeSeconds) && payload.runtime.process.uptimeSeconds >= 0,
    "Public status uptimeSeconds must be non-negative",
  );
  assert(typeof payload.runtime.process.shuttingDown === "boolean", "Public status shuttingDown must be boolean");
  assert(
    Number.isFinite(payload.runtime.process.shutdownGraceMs) && payload.runtime.process.shutdownGraceMs > 0,
    "Public status shutdownGraceMs must be positive",
  );
  if (payload.notice !== null && payload.notice !== undefined) {
    assert(typeof payload.notice === "object", "Public status notice must be an object or null");
    assert(typeof payload.notice.title === "string" && payload.notice.title.length > 0, "Public status notice title is required");
    assert(typeof payload.notice.body === "string" && payload.notice.body.length > 0, "Public status notice body is required");
    assert(["info", "warning", "critical"].includes(payload.notice.tone), "Public status notice tone is invalid");
    assert(payload.notice.active === true, "Public status notice should be active when present");
  }
}

function assertUniqueIds(items, name) {
  const seen = new Set();
  for (const item of items) {
    assert(item?.id, `${name} item must include id`);
    assert(!seen.has(item.id), `${name} has duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

function assertSanitizedState(payload) {
  assert(payload && typeof payload === "object", "State response must be an object");
  assert(payload.state && typeof payload.state === "object", "State response must include state");

  const { state } = payload;
  assertArray(state.users, "state.users");
  assertArray(state.rooms, "state.rooms");
  assertArray(state.channels, "state.channels");
  assertArray(state.ledger, "state.ledger");
  assertArray(state.reports, "state.reports");
  assertArray(state.notifications, "state.notifications");
  assertArray(state.auditLogs, "state.auditLogs");

  assertUniqueIds(state.users, "state.users");
  assertUniqueIds(state.rooms, "state.rooms");
  assertUniqueIds(state.channels, "state.channels");
  assertUniqueIds(state.ledger, "state.ledger");
  assertUniqueIds(state.reports, "state.reports");
  assertUniqueIds(state.notifications, "state.notifications");
  assertUniqueIds(state.auditLogs, "state.auditLogs");
  if (Array.isArray(state.sanctions)) assertUniqueIds(state.sanctions, "state.sanctions");

  assert(state.users.length > 0, "state.users should contain at least one user");
  assert(state.rooms.length > 0, "state.rooms should contain at least one room");
  assert(state.channels.length > 0, "state.channels should contain at least one channel");
  if (state.serviceNotice !== null && state.serviceNotice !== undefined) {
    assert(typeof state.serviceNotice === "object", "state.serviceNotice must be an object or null");
    assert(typeof state.serviceNotice.id === "string" && state.serviceNotice.id.length > 0, "state.serviceNotice.id is required");
    assert(typeof state.serviceNotice.title === "string" && state.serviceNotice.title.length > 0, "state.serviceNotice.title is required");
    assert(typeof state.serviceNotice.body === "string" && state.serviceNotice.body.length > 0, "state.serviceNotice.body is required");
    assert(["info", "warning", "critical"].includes(state.serviceNotice.tone), "state.serviceNotice.tone is invalid");
    assert(state.serviceNotice.active === true, "state.serviceNotice.active should be true when present");
    assert(typeof state.serviceNotice.updatedAt === "string" && state.serviceNotice.updatedAt.length > 0, "state.serviceNotice.updatedAt is required");
    assert(typeof state.serviceNotice.updatedBy === "string", "state.serviceNotice.updatedBy is required");
    if (state.serviceNotice.expiresAt !== null && state.serviceNotice.expiresAt !== undefined) {
      assert(
        typeof state.serviceNotice.expiresAt === "string" && !Number.isNaN(new Date(state.serviceNotice.expiresAt).getTime()),
        "state.serviceNotice.expiresAt must be a valid timestamp when present",
      );
    }
  }

  const userIds = new Set(state.users.map((user) => user.id));
  const roomIds = new Set(state.rooms.map((room) => room.id));
  const channelIds = new Set(state.channels.map((channel) => channel.id));

  for (const user of state.users) {
    assert(!("passwordHash" in user), `User ${user.id} leaked passwordHash`);
    assert(!("passwordSalt" in user), `User ${user.id} leaked passwordSalt`);
    assert(user.password === "", `User ${user.id} should have a blank sanitized password`);
  }

  for (const channel of state.channels) {
    assert(roomIds.has(channel.roomId), `Channel ${channel.id} points to missing room ${channel.roomId}`);
    assert(userIds.has(channel.createdBy), `Channel ${channel.id} points to missing creator ${channel.createdBy}`);
    assertArray(channel.participantIds, `channel ${channel.id}.participantIds`);
    assertArray(channel.spectatorIds, `channel ${channel.id}.spectatorIds`);
    for (const userId of [...channel.participantIds, ...channel.spectatorIds]) {
      assert(userIds.has(userId), `Channel ${channel.id} points to missing user ${userId}`);
    }
    for (const message of channel.messages ?? []) {
      assert(userIds.has(message.authorId), `Channel ${channel.id} message ${message.id} points to missing author ${message.authorId}`);
    }
    for (const message of channel.spectatorMessages ?? []) {
      assert(userIds.has(message.authorId), `Channel ${channel.id} spectator message ${message.id} points to missing author ${message.authorId}`);
    }
    for (const vote of channel.votes ?? []) {
      assert(userIds.has(vote.voterId), `Channel ${channel.id} vote ${vote.id} points to missing voter ${vote.voterId}`);
      assert(userIds.has(vote.targetUserId), `Channel ${channel.id} vote ${vote.id} points to missing target ${vote.targetUserId}`);
    }
    for (const reaction of channel.reactions ?? []) {
      assert(userIds.has(reaction.spectatorId), `Channel ${channel.id} reaction ${reaction.id} points to missing spectator ${reaction.spectatorId}`);
      assert(userIds.has(reaction.targetUserId), `Channel ${channel.id} reaction ${reaction.id} points to missing target ${reaction.targetUserId}`);
    }
    if (channel.finalResult) {
      assert(userIds.has(channel.finalResult.winnerId), `Channel ${channel.id} final result points to missing winner`);
      if (channel.finalResult.loserId) {
        assert(userIds.has(channel.finalResult.loserId), `Channel ${channel.id} final result points to missing loser`);
      }
    }
  }

  for (const entry of state.ledger) {
    assert(userIds.has(entry.userId), `Ledger ${entry.id} points to missing user ${entry.userId}`);
  }

  for (const notification of state.notifications) {
    assert(userIds.has(notification.userId), `Notification ${notification.id} points to missing user ${notification.userId}`);
  }

  for (const sanction of state.sanctions ?? []) {
    assert(userIds.has(sanction.userId), `Sanction ${sanction.id} points to missing user ${sanction.userId}`);
    assert(userIds.has(sanction.actorId), `Sanction ${sanction.id} points to missing actor ${sanction.actorId}`);
  }

  for (const report of state.reports) {
    assert(userIds.has(report.reporterId), `Report ${report.id} points to missing reporter ${report.reporterId}`);
    if (report.channelId) assert(channelIds.has(report.channelId), `Report ${report.id} points to missing channel ${report.channelId}`);
  }

  return state;
}

async function assertProtectedGet(url) {
  const { response, payload } = await readJsonResponse(url);
  assert(response.status === 401, `${url} should require authentication`);
  assert(payload.error === "not_authenticated", `${url} should report not_authenticated`);
}

async function assertProtectedPost(url, body = {}) {
  const { response, payload } = await writeJsonResponse(url, body);
  assert(response.status === 401, `${url} should require authentication`);
  assert(payload.error === "not_authenticated", `${url} should report not_authenticated`);
}

async function createAdminSession() {
  const { response, payload } = await writeJsonResponse(API_AUTH_DEMO_URL, { userId: "u_admin" });
  assert(response.ok, `${API_AUTH_DEMO_URL} should allow demo admin login`);
  assert(payload.ok === true && payload.userId === "u_admin", "Demo admin login should return u_admin");
  assert(typeof payload.csrfToken === "string" && payload.csrfToken.length > 0, "Demo admin login should return csrfToken");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.includes("nb_session="), "Demo admin login should set an auth session cookie");
  return { cookie: cookie.split(";")[0], csrfToken: payload.csrfToken };
}

async function assertAdminPlatformSettingsContract(adminSession) {
  const authHeaders = { cookie: adminSession.cookie };
  const writeHeaders = { ...authHeaders, "x-csrf-token": adminSession.csrfToken };
  const { response: currentResponse, payload: currentPayload } = await readJsonResponse(
    API_ADMIN_PLATFORM_SETTINGS_URL,
    authHeaders,
  );
  assert(currentResponse.ok, `${API_ADMIN_PLATFORM_SETTINGS_URL} should allow authenticated admin reads`);
  assertPlatformSettings(currentPayload.platformSettings, "admin.platformSettings.current");

  const original = currentPayload.platformSettings;
  const updated = {
    debate: {
      ...original.debate,
      defaultCoinStake: original.debate.defaultCoinStake === 90 ? 80 : 90,
    },
    moderation: {
      ...original.moderation,
      reportReviewThreshold: original.moderation.reportReviewThreshold === 4 ? 3 : 4,
    },
  };
  const { response: invalidResponse, payload: invalidPayload } = await writeJsonResponse(
    API_ADMIN_PLATFORM_SETTINGS_URL,
    { platformSettings: { ...updated, debate: { ...updated.debate, openingSeconds: 5 } } },
    writeHeaders,
  );
  assert(invalidResponse.status === 400, "Invalid platform settings should be rejected with 400");
  assert(invalidPayload.error === "invalid_platform_settings", "Invalid platform settings should return invalid_platform_settings");

  const { response: saveResponse, payload: savePayload } = await writeJsonResponse(
    API_ADMIN_PLATFORM_SETTINGS_URL,
    { platformSettings: updated },
    writeHeaders,
  );
  assert(saveResponse.ok, "Valid platform settings should save");
  assert(savePayload.ok === true, "Platform settings save should return ok=true");
  assert(savePayload.platformSettings?.debate?.defaultCoinStake === updated.debate.defaultCoinStake, "Saved default coin stake should match update");

  const { response: refreshedResponse, payload: refreshedPayload } = await readJsonResponse(
    API_ADMIN_PLATFORM_SETTINGS_URL,
    authHeaders,
  );
  assert(refreshedResponse.ok, "Platform settings refresh should succeed after save");
  assert(refreshedPayload.platformSettings?.debate?.defaultCoinStake === updated.debate.defaultCoinStake, "Platform settings should persist after refresh");

  const { response: restoreResponse, payload: restorePayload } = await writeJsonResponse(
    API_ADMIN_PLATFORM_SETTINGS_URL,
    { platformSettings: original },
    writeHeaders,
  );
  assert(restoreResponse.ok && restorePayload.ok === true, "Platform settings restore should succeed");
  return updated;
}

async function main() {
  const apiHealth = await readJson(API_HEALTH_URL);
  assert(apiHealth.ok === true, "API health did not report ok=true");
  assert(apiHealth.service === "nosu-best-api", "API health reported an unexpected service name");
  assert(apiHealth.realtime === true, "Realtime server is not enabled");
  assertHealthRuntime(apiHealth, "API health");
  const apiStatus = await readJson(API_STATUS_URL);
  assertPublicStatusPayload(apiStatus);

  const corsHeaders = await readCorsHeaders(API_HEALTH_URL, SMOKE_ORIGIN);
  assert(corsHeaders.allowOrigin === SMOKE_ORIGIN, `CORS allowed origin should echo ${SMOKE_ORIGIN}`);
  assert(corsHeaders.allowCredentials === "true", "CORS credentials must be enabled for session cookies");
  assert(corsHeaders.contentTypeOptions === "nosniff", "X-Content-Type-Options must be nosniff");
  assert(corsHeaders.frameOptions === "DENY", "X-Frame-Options must be DENY");
  assert(corsHeaders.referrerPolicy === "no-referrer", "Referrer-Policy must be no-referrer");
  assert(
    corsHeaders.permissionsPolicy?.includes("microphone=(self)"),
    "Permissions-Policy should allow same-origin microphone for voice debates",
  );
  assert(
    corsHeaders.permissionsPolicy?.includes("camera=()") && corsHeaders.permissionsPolicy?.includes("geolocation=()"),
    "Permissions-Policy should still disable camera and geolocation",
  );
  assert(corsHeaders.poweredBy === null, "X-Powered-By should not expose Express");
  const blockedCorsHeaders = await readCorsHeaders(API_HEALTH_URL, SMOKE_BLOCKED_ORIGIN);
  assert(
    blockedCorsHeaders.allowOrigin !== SMOKE_BLOCKED_ORIGIN,
    `CORS should not allow unlisted origin ${SMOKE_BLOCKED_ORIGIN}`,
  );
  const preflightHeaders = await readCorsPreflightHeaders(API_ADMIN_SYNC_NORMALIZED_URL, SMOKE_ORIGIN);
  assert([200, 204].includes(preflightHeaders.status), "Allowed CORS preflight should return a success status");
  assert(preflightHeaders.allowOrigin === SMOKE_ORIGIN, `CORS preflight should echo ${SMOKE_ORIGIN}`);
  assert(preflightHeaders.allowCredentials === "true", "CORS preflight credentials must be enabled");
  assert(preflightHeaders.allowMethods?.includes("POST"), "CORS preflight should allow POST");
  assert(
    preflightHeaders.allowHeaders?.toLowerCase().includes("content-type"),
    "CORS preflight should allow content-type headers",
  );
  const blockedPreflightHeaders = await readCorsPreflightHeaders(API_ADMIN_SYNC_NORMALIZED_URL, SMOKE_BLOCKED_ORIGIN);
  assert(
    blockedPreflightHeaders.allowOrigin !== SMOKE_BLOCKED_ORIGIN,
    `CORS preflight should not allow unlisted origin ${SMOKE_BLOCKED_ORIGIN}`,
  );

  const state = assertSanitizedState(await readJson(API_STATE_URL));
  assert(state.currentUserId === null, "Unauthenticated state should not expose a current user");
  assertPlatformSettings(state.platformSettings, "state.platformSettings");
  await assertProtectedGet(API_ADMIN_READINESS_URL);
  await assertProtectedGet(API_ADMIN_PLATFORM_SETTINGS_URL);
  await assertProtectedGet(API_ADMIN_STORAGE_CHECK_URL);
  await assertProtectedPost(API_ADMIN_PLATFORM_SETTINGS_URL, {});
  await assertProtectedPost(API_ADMIN_SYNC_NORMALIZED_URL, {});

  const adminSession = await createAdminSession();
  const updatedPlatformSettings = await assertAdminPlatformSettingsContract(adminSession);
  const { response: readinessResponse, payload: readinessPayload } = await readJsonResponse(API_ADMIN_READINESS_URL, {
    cookie: adminSession.cookie,
  });
  assert(readinessResponse.ok, `${API_ADMIN_READINESS_URL} should allow authenticated admin readiness`);
  const readiness = assertReadinessPayload(readinessPayload);

  const proxiedHealth = await readJson(VITE_HEALTH_URL);
  assert(proxiedHealth.ok === true, "Vite proxy health did not report ok=true");
  assert(proxiedHealth.service === apiHealth.service, "Vite proxy health service does not match API health");
  assertHealthRuntime(proxiedHealth, "Vite proxy health");
  assert(
    proxiedHealth.runtime.apiHost === apiHealth.runtime.apiHost,
    "Vite proxy health runtime apiHost does not match API health",
  );

  const html = await readText(APP_URL);
  assert(html.includes('id="root"'), "App HTML does not include the React root element");
  assert(html.includes("/src/main.tsx") || html.includes("/assets/"), "App HTML does not include a Vite entry point");

  console.log("Smoke check passed", {
    api: API_HEALTH_URL,
    publicStatus: apiStatus.status,
    state: API_STATE_URL,
    origin: SMOKE_ORIGIN,
    blockedOrigin: SMOKE_BLOCKED_ORIGIN,
    preflight: "ok",
    protectedAdminChecks: 5,
    platformSettingsDefaultCoinStake: updatedPlatformSettings.debate.defaultCoinStake,
    readinessLaunch: readiness.launch.status,
    readinessBlockers: readiness.launch.blockers.length,
    readinessWarnings: readiness.launch.warnings.length,
    loginLimit: apiHealth.runtime.rateLimits.loginMax,
    phoneRequestLimit: apiHealth.runtime.rateLimits.phoneRequestMax,
    messageLimit: apiHealth.runtime.rateLimits.messageMax,
    viteProxy: VITE_HEALTH_URL,
    app: APP_URL,
    apiHost: apiHealth.runtime.apiHost,
    allowedOrigins: apiHealth.runtime.allowedOrigins.length,
    storage: apiHealth.storage,
    storageMode: apiHealth.storageMode,
    aiJudgeConfigured: apiHealth.aiJudgeConfigured,
    users: state.users.length,
    rooms: state.rooms.length,
    channels: state.channels.length,
    ledger: state.ledger.length,
    reports: state.reports.length,
  });
}

main().catch((error) => {
  console.error("Smoke check failed:", error.message);
  process.exitCode = 1;
});
