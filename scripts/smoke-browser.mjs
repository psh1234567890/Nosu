import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const APP_URL = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:5173/";
const HEADLESS = process.env.SMOKE_BROWSER_HEADLESS !== "false";
const TIMEOUT_MS = Number(process.env.SMOKE_BROWSER_TIMEOUT_MS ?? 15_000);
const OUTPUT_DIR =
  process.env.SMOKE_BROWSER_OUTPUT_DIR ?? path.join(process.cwd(), "output", "playwright");
const SECURE_BACKUP_CONFIRMATION = "EXPORT FULL BACKUP";
const RESTORE_BACKUP_CONFIRMATION = "RESTORE FULL BACKUP";

function smokeSelector(name) {
  return `[data-smoke="${name}"]`;
}

async function waitVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: TIMEOUT_MS }).catch((error) => {
    throw new Error(`${label} was not visible within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function countVisible(locator, label) {
  await waitVisible(locator.first(), label);
  const count = await locator.count();
  if (count < 1) throw new Error(`${label} should have at least one item`);
  return count;
}

async function waitReadyState(page, expectedState, label) {
  await page.waitForFunction(
    ({ selector, state }) => document.querySelector(selector)?.getAttribute("data-ready-state") === state,
    { selector: smokeSelector("ready-toggle"), state: expectedState },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not reach ${expectedState} within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function clickReadyToggle(page, label) {
  const readyToggle = page.locator(smokeSelector("ready-toggle"));
  await waitVisible(readyToggle, label);
  if (await readyToggle.isDisabled()) {
    throw new Error(`${label} should be enabled`);
  }
  await readyToggle.click();
  await waitReadyState(page, "ready", label);
}

async function waitBoardState(page, expected, label) {
  await page.waitForFunction(
    ({ selector, expectedState }) => {
      const board = document.querySelector(selector);
      if (!board) return false;
      return Object.entries(expectedState).every(([key, value]) => board.getAttribute(key) === String(value));
    },
    { selector: smokeSelector("debate-flow-board"), expectedState: expected },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not reach expected board state within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitVoicePersonState(page, userId, expected, label) {
  await page.waitForFunction(
    ({ selector, targetUserId, expectedState }) => {
      const person = [...document.querySelectorAll(selector)].find(
        (element) => element.getAttribute("data-user-id") === targetUserId,
      );
      if (!person) return false;
      return Object.entries(expectedState).every(([key, value]) => person.getAttribute(key) === String(value));
    },
    { selector: smokeSelector("voice-person"), targetUserId: userId, expectedState: expected },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not reach expected voice state within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitVoiceLobbyConnectable(page, label) {
  await page.waitForFunction(
    ({ selector }) => {
      const lobby = document.querySelector(selector);
      if (!lobby) return false;
      const participantCount = Number(lobby.getAttribute("data-participant-count") ?? 0);
      return (
        lobby.getAttribute("data-channel-format") === "voice" &&
        lobby.getAttribute("data-can-connect") === "true" &&
        participantCount >= 2
      );
    },
    { selector: smokeSelector("voice-lobby") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not become connectable within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function boardAttribute(page, name) {
  return page.locator(smokeSelector("debate-flow-board")).getAttribute(name);
}

async function waitBoardAttributeChange(page, name, previousValue, label) {
  await page.waitForFunction(
    ({ selector, attr, previous }) => {
      const board = document.querySelector(selector);
      if (!board) return false;
      return board.getAttribute(attr) !== previous;
    },
    { selector: smokeSelector("debate-flow-board"), attr: name, previous: previousValue },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not change ${name} from ${previousValue}: ${error.message}`);
  });
}

async function switchToActiveSpeaker(page, label) {
  const activeSpeakerId = await boardAttribute(page, "data-active-speaker-id");
  if (!activeSpeakerId) throw new Error(`${label} expected an active speaker`);
  await switchDemoUser(page, activeSpeakerId, label);
  return activeSpeakerId;
}

async function submitDebateMessage(page, body, expectedMessageCount, label) {
  const input = page.locator(smokeSelector("debate-input"));
  const sendButton = page.locator(smokeSelector("debate-send"));
  await waitVisible(input, `${label} input`);
  if (await input.isDisabled()) {
    throw new Error(`${label} input should be enabled for the active speaker`);
  }
  await input.fill(body);
  await sendButton.click();
  await page.waitForFunction(
    ({ selector, count }) => Number(document.querySelector(selector)?.getAttribute("data-debate-message-count") ?? 0) >= count,
    { selector: smokeSelector("debate-flow-board"), count: expectedMessageCount },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} message count did not reach ${expectedMessageCount}: ${error.message}`);
  });
  await waitVisible(page.getByText(body), `${label} transcript message`);
}

async function finalizeWithLocalJudge(page, channelId, userId) {
  await waitVisible(page.locator(smokeSelector("finalize-debate")), "finalize debate action");
  const result = await page.evaluate(
    async ({ targetChannelId, actorId }) => {
      const stateResponse = await fetch("/api/state", { credentials: "include" });
      const statePayload = await stateResponse.json().catch(() => ({}));
      const csrfToken = statePayload.csrfToken;
      const response = await fetch("/api/ai/judge", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ channelId: targetChannelId, userId: actorId, forceLocal: true }),
      });
      const payload = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, payload };
    },
    { targetChannelId: channelId, actorId: userId },
  );
  if (!result.ok) {
    throw new Error(`local judge request failed with ${result.status}: ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function switchDemoUser(page, userId, label) {
  const switcher = page.locator(smokeSelector("demo-user-switcher"));
  await waitVisible(switcher, `${label} switcher`);
  await switcher.selectOption(userId);
  const switched = await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector: smokeSelector("demo-user-switcher"), value: userId },
    { timeout: TIMEOUT_MS },
  ).then(() => true).catch(() => false);
  if (switched) return;

  const fallback = await page.evaluate(async (nextUserId) => {
    const response = await fetch("/api/auth/select-demo", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: nextUserId }),
    });
    return { ok: response.ok, status: response.status };
  }, userId);
  if (!fallback.ok) {
    throw new Error(`${label} fallback demo switch failed with ${fallback.status}`);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await waitVisible(page.locator(smokeSelector("app-shell")), `${label} app shell after fallback switch`);
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector: smokeSelector("demo-user-switcher"), value: userId },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not switch to ${userId}: ${error.message}`);
  });
}

async function ensureAdminSession(page, label) {
  if (await page.locator(smokeSelector("auth-layout")).isVisible().catch(() => false)) {
    await page.locator(smokeSelector("demo-admin-login")).click();
    await waitVisible(page.locator(smokeSelector("app-shell")), `${label} admin app shell`);
  } else {
    await waitVisible(page.locator(smokeSelector("app-shell")), `${label} app shell`);
  }

  const switcher = page.locator(smokeSelector("demo-user-switcher"));
  const currentValue = await switcher.inputValue().catch(() => "");
  if (currentValue !== "u_admin") {
    await switchDemoUser(page, "u_admin", `${label} admin switch`);
  }
  await waitVisible(page.locator(smokeSelector("reset-demo")), `${label} reset action`);
}

async function resetDemoState(page, label = "demo reset") {
  await ensureAdminSession(page, label);
  await page.locator(smokeSelector("reset-demo")).click();
  await waitVisible(page.locator(smokeSelector("auth-layout")), `${label} auth screen`);
}

async function forceStaleStorageState(page) {
  const result = await page.evaluate(async () => {
    const stateResponse = await fetch("/api/state", {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    const statePayload = await stateResponse.json().catch(() => ({}));
    const state = statePayload.state;
    const admin =
      state?.users?.find((user) => user.id === "u_admin") ??
      state?.users?.find((user) => user.role === "admin");

    if (!stateResponse.ok || !state || !admin || !statePayload.csrfToken) {
      return { ok: false, status: stateResponse.status, payload: statePayload };
    }

    const staleState = {
      ...state,
      users: [
        {
          ...admin,
          role: "admin",
          phoneVerified: true,
          coins: admin.coins ?? 1200,
          claims: admin.claims ?? [],
          stats: admin.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
        },
      ],
      rooms: [
        {
          id: "r_storage_restore_probe",
          title: "Storage restore probe",
          topic: "Seed restore should rebuild demo channels",
          createdBy: "u_admin",
          createdAt: "06.21 00:00",
        },
      ],
      channels: [],
      ledger: [],
      reports: [],
      notifications: [],
      currentUserId: "u_admin",
    };

    const response = await fetch("/api/state", {
      method: "PUT",
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": statePayload.csrfToken,
      },
      body: JSON.stringify({ state: staleState }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  });

  if (!result.ok) {
    throw new Error(`failed to prepare stale storage state: ${result.status} ${JSON.stringify(result.payload)}`);
  }

  await page.waitForFunction(
    ({ selector }) => document.querySelector(selector)?.value === "u_admin",
    { selector: smokeSelector("demo-user-switcher") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`stale storage state did not keep admin session active: ${error.message}`);
  });
}

async function restoreDemoSeedFromStoragePanel(page) {
  const panel = page.locator(smokeSelector("storage-ops-panel"));
  await waitVisible(panel, "storage operations panel");
  const seedButton = page.locator(smokeSelector("storage-seed-demo"));
  await waitVisible(seedButton, "storage seed action");
  if (await seedButton.isDisabled()) {
    throw new Error("storage seed action should be enabled for an admin");
  }
  await seedButton.click();

  await page.waitForFunction(
    ({ panelSelector }) => {
      const currentPanel = document.querySelector(panelSelector);
      if (!currentPanel) return false;
      const users = Number(currentPanel.getAttribute("data-storage-users") ?? 0);
      const rooms = Number(currentPanel.getAttribute("data-storage-rooms") ?? 0);
      const channels = Number(currentPanel.getAttribute("data-storage-channels") ?? 0);
      return users >= 4 && rooms >= 3 && channels >= 2;
    },
    { panelSelector: smokeSelector("storage-ops-panel") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`storage seed panel did not expose restored counts: ${error.message}`);
  });

  await waitVisible(page.locator(smokeSelector("storage-message")), "storage seed success message");
  const exportButton = page.locator(smokeSelector("storage-export-backup"));
  await waitVisible(exportButton, "storage backup export action");
  if (await exportButton.isDisabled()) {
    throw new Error("storage backup export action should be enabled for an admin");
  }
  const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
  await exportButton.click();
  const download = await downloadPromise;
  const backupFilename = download.suggestedFilename();
  if (!backupFilename.startsWith("nosu-best-state-") || !backupFilename.endsWith(".json")) {
    throw new Error(`storage backup export suggested an unexpected filename: ${backupFilename}`);
  }
  await waitVisible(page.locator(smokeSelector("storage-message")), "storage backup export success message");
  const secureExportButton = page.locator(smokeSelector("storage-export-secure-backup"));
  await waitVisible(secureExportButton, "storage secure backup export action");
  const secureConfirmationInput = page.locator(smokeSelector("storage-secure-backup-confirmation"));
  await waitVisible(secureConfirmationInput, "storage secure backup confirmation input");
  if (!(await secureExportButton.isDisabled())) {
    throw new Error("storage secure backup export action should require confirmation before enabling");
  }
  await secureConfirmationInput.fill(SECURE_BACKUP_CONFIRMATION);
  if (await secureExportButton.isDisabled()) {
    throw new Error("storage secure backup export action should enable after exact confirmation");
  }
  const secureResponsePromise = page
    .waitForResponse((response) => response.url().includes("/api/admin/state-export/secure"), {
      timeout: TIMEOUT_MS,
    })
    .catch(async (error) => {
      const uiError = await page.locator(smokeSelector("storage-error")).textContent().catch(() => "");
      const uiMessage = await page.locator(smokeSelector("storage-message")).textContent().catch(() => "");
      return { secureResponseError: error.message, uiError, uiMessage };
    });
  const secureDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS }).catch(() => null);
  await secureExportButton.click();
  const secureResponse = await secureResponsePromise;
  if ("secureResponseError" in secureResponse) {
    throw new Error(
      `secure backup API did not respond: ${secureResponse.secureResponseError}; uiError=${secureResponse.uiError}; uiMessage=${secureResponse.uiMessage}`,
    );
  }
  const securePayload = await secureResponse.json().catch(() => ({}));
  if (!secureResponse.ok() || securePayload.ok !== true || securePayload.secure !== true) {
    throw new Error(`secure backup API failed: ${secureResponse.status()} ${JSON.stringify(securePayload)}`);
  }
  const secureDownload = await secureDownloadPromise;
  const secureBackupFilename = secureDownload?.suggestedFilename() ?? securePayload.filename ?? "";
  if (!secureBackupFilename.startsWith("nosu-best-secure-state-") || !secureBackupFilename.endsWith(".json")) {
    throw new Error(`secure backup export suggested an unexpected filename: ${secureBackupFilename}`);
  }
  await waitVisible(page.locator(smokeSelector("storage-message")), "storage secure backup export success message");
  const validateInput = page.locator(smokeSelector("storage-validate-backup"));
  await validateInput.waitFor({ state: "attached", timeout: TIMEOUT_MS }).catch((error) => {
    throw new Error(`storage backup validation input was not attached: ${error.message}`);
  });
  const backupState = {
    state: {
      users: [
        {
          id: "u_admin",
          loginId: "nosu",
          password: "",
          passwordHash: "a".repeat(64),
          passwordSalt: "b".repeat(32),
          authProvider: "local",
          phone: "010-0000-2026",
          phoneVerified: true,
          displayName: "Smoke Admin",
          title: "Admin",
          bio: "",
          photoUrl: "",
          role: "admin",
          coins: 1200,
          accentColor: "blue",
          profileFrame: "clean",
          bannerStyle: "plain",
          featuredBadge: "",
          ownedItemIds: [],
          claims: [],
          stats: { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
        },
      ],
      rooms: [],
      channels: [],
      ledger: [],
      reports: [],
      sanctions: [],
      notifications: [],
      auditLogs: [],
      currentUserId: null,
    },
  };
  await validateInput.setInputFiles({
    name: "nosu-best-state-smoke.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupState)),
  });
  await page.waitForFunction(
    ({ selector }) => document.querySelector(selector)?.getAttribute("data-backup-valid") === "true",
    { selector: smokeSelector("storage-backup-validation") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`storage backup validation report did not pass: ${error.message}`);
  });
  const backupValidationUsers = Number(
    await page.locator(smokeSelector("storage-backup-validation")).getAttribute("data-backup-users"),
  );
  if (backupValidationUsers < 1) {
    throw new Error(`storage backup validation should expose user counts, received ${backupValidationUsers}`);
  }
  const restoreButton = page.locator(smokeSelector("storage-restore-backup"));
  const restoreConfirmationInput = page.locator(smokeSelector("storage-restore-confirmation"));
  await waitVisible(restoreButton, "storage restore backup action");
  await waitVisible(restoreConfirmationInput, "storage restore confirmation input");
  if (!(await restoreButton.isDisabled())) {
    throw new Error("storage restore action should require exact confirmation before enabling");
  }
  await restoreConfirmationInput.fill(RESTORE_BACKUP_CONFIRMATION);
  if (await restoreButton.isDisabled()) {
    throw new Error("storage restore action should enable after secure backup validation and exact confirmation");
  }
  const auditExportButton = page.locator(smokeSelector("audit-export-download"));
  await waitVisible(auditExportButton, "audit export download action");
  if (await auditExportButton.isDisabled()) {
    throw new Error("audit export download action should be enabled for an admin");
  }
  const auditDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
  await auditExportButton.click();
  const auditDownload = await auditDownloadPromise;
  const auditExportFilename = auditDownload.suggestedFilename();
  if (!auditExportFilename.startsWith("nosu-best-audit-") || !/\.(json|csv)$/i.test(auditExportFilename)) {
    throw new Error(`audit export suggested an unexpected filename: ${auditExportFilename}`);
  }
  await waitVisible(page.locator(smokeSelector("audit-export-message")), "audit export success message");
  const counts = await panel.evaluate((element) => ({
    users: Number(element.getAttribute("data-storage-users") ?? 0),
    rooms: Number(element.getAttribute("data-storage-rooms") ?? 0),
    channels: Number(element.getAttribute("data-storage-channels") ?? 0),
  }));
  return { ...counts, backupFilename, secureBackupFilename, backupValidationUsers, auditExportFilename };
}

async function bestEffortReset(page) {
  if (await page.locator(smokeSelector("auth-layout")).isVisible().catch(() => false)) return;
  await resetDemoState(page, "failure cleanup").catch(() => {});
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: HEADLESS });
  } catch (error) {
    if (String(error?.message ?? "").includes("Executable doesn't exist")) {
      throw new Error(
        "Playwright Chromium is not installed. Run `npx playwright install chromium` once, then retry `npm run smoke:browser`.",
      );
    }
    throw error;
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1366, height: 900 },
  });
  await context.grantPermissions(["clipboard-write"], { origin: new URL(APP_URL).origin }).catch(() => {});
  const page = await context.newPage();
  const pageErrors = [];
  let storageSeedUsers = 0;
  let storageSeedRooms = 0;
  let storageSeedChannels = 0;
  let storageBackupFilename = "";
  let storageSecureBackupFilename = "";
  let storageBackupValidationUsers = 0;
  let storageAuditExportFilename = "";
  let readinessReportFilename = "";
  let readinessEnvFilename = "";
  let readinessCommandCount = 0;
  let readinessEvidenceFilename = "";
  let readinessEvidenceCount = 0;
  let readinessHandoffFilename = "";
  let readinessHandoffStatus = "";
  let readinessHandoffCheckCount = 0;
  let readinessPromotionStatus = "";
  let readinessPromotionArtifactCount = 0;
  let readinessPromotionReadyCount = 0;
  let readinessPromotionStrictStatus = "";
  let readinessLoginLimit = 0;
  let opsSnapshotJsonFilename = "";
  let opsSnapshotMarkdownFilename = "";
  let opsSnapshotAuditCount = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

    await waitVisible(page.locator(smokeSelector("auth-layout")), "auth screen");
    await resetDemoState(page, "initial");
    await page.locator(smokeSelector("demo-admin-login")).click();
    await waitVisible(page.locator(smokeSelector("app-shell")), "admin app shell for readiness");
    await page.locator(smokeSelector("nav-admin")).click();
    await waitVisible(page.locator(smokeSelector("service-notice-duration")), "service notice expiry selector");
    const readinessLaunch = page.locator(smokeSelector("readiness-launch-card"));
    await waitVisible(readinessLaunch, "admin readiness launch card");
    const readinessLaunchStatus = await readinessLaunch.getAttribute("data-launch-status");
    if (!["ready", "warning", "blocked"].includes(readinessLaunchStatus ?? "")) {
      throw new Error(`readiness launch card exposed invalid status ${readinessLaunchStatus}`);
    }
    const readinessBlockers = Number(await readinessLaunch.getAttribute("data-launch-blockers"));
    const readinessWarnings = Number(await readinessLaunch.getAttribute("data-launch-warnings"));
    if (!Number.isFinite(readinessBlockers) || !Number.isFinite(readinessWarnings)) {
      throw new Error("readiness launch card should expose numeric blocker and warning counts");
    }
    const readinessPhaseStrip = page.locator(smokeSelector("readiness-phase-strip"));
    await waitVisible(readinessPhaseStrip, "admin readiness phase strip");
    const readinessPhaseCount = Number(await readinessPhaseStrip.getAttribute("data-phase-count"));
    const readinessRequiredOpen = Number(await readinessPhaseStrip.getAttribute("data-required-open"));
    if (!Number.isFinite(readinessPhaseCount) || readinessPhaseCount < 1) {
      throw new Error("readiness phase strip should expose at least one phase");
    }
    if (!Number.isFinite(readinessRequiredOpen)) {
      throw new Error("readiness phase strip should expose numeric required-open count");
    }
    const readinessRateStrip = page.locator(smokeSelector("readiness-rate-strip"));
    await waitVisible(readinessRateStrip, "readiness rate limit strip");
    readinessLoginLimit = Number(await readinessRateStrip.getAttribute("data-login-max"));
    const readinessPhoneRequestLimit = Number(await readinessRateStrip.getAttribute("data-phone-request-max"));
    const readinessMessageLimit = Number(await readinessRateStrip.getAttribute("data-message-max"));
    if (
      !Number.isFinite(readinessLoginLimit) ||
      readinessLoginLimit < 1 ||
      !Number.isFinite(readinessPhoneRequestLimit) ||
      readinessPhoneRequestLimit < 1 ||
      !Number.isFinite(readinessMessageLimit) ||
      readinessMessageLimit < 1
    ) {
      throw new Error("readiness rate limit strip should expose positive auth/SMS/write limits");
    }
    const readinessProviderStrip = page.locator(smokeSelector("readiness-provider-strip"));
    await waitVisible(readinessProviderStrip, "readiness provider diagnostics strip");
    const readinessSmsProvider = await readinessProviderStrip.getAttribute("data-sms-provider");
    const readinessStorageMode = await readinessProviderStrip.getAttribute("data-storage-mode");
    const providerReadyAttributes = await Promise.all([
      readinessProviderStrip.getAttribute("data-sms-ready"),
      readinessProviderStrip.getAttribute("data-oauth-ready"),
      readinessProviderStrip.getAttribute("data-ai-ready"),
      readinessProviderStrip.getAttribute("data-storage-ready"),
    ]);
    if (!readinessSmsProvider) {
      throw new Error("readiness provider diagnostics should expose the SMS provider");
    }
    if (!["normalized", "snapshot", "file"].includes(readinessStorageMode ?? "")) {
      throw new Error(`readiness provider diagnostics exposed invalid storage mode ${readinessStorageMode}`);
    }
    if (providerReadyAttributes.some((value) => !["true", "false"].includes(value ?? ""))) {
      throw new Error("readiness provider diagnostics should expose boolean readiness attributes");
    }
    const readinessReleaseIdentity = page.locator(smokeSelector("readiness-release-identity"));
    await waitVisible(readinessReleaseIdentity, "readiness release identity badge");
    const releaseConfigured = await readinessReleaseIdentity.getAttribute("data-release-configured");
    const releaseVersion = await readinessReleaseIdentity.getAttribute("data-release-version");
    const releaseCommit = await readinessReleaseIdentity.getAttribute("data-release-commit");
    if (!["true", "false"].includes(releaseConfigured ?? "")) {
      throw new Error("readiness release identity should expose whether the release is configured");
    }
    if (!releaseVersion || !releaseCommit) {
      throw new Error("readiness release identity should expose version and commit labels");
    }
    const readinessEnvDownloadButton = page.locator(smokeSelector("readiness-env-download"));
    await waitVisible(readinessEnvDownloadButton, "readiness env draft download action");
    const readinessEnvDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await readinessEnvDownloadButton.click();
    const readinessEnvDownload = await readinessEnvDownloadPromise;
    readinessEnvFilename = readinessEnvDownload.suggestedFilename();
    if (readinessEnvFilename !== "nosu-best-production.env.example") {
      throw new Error(`readiness env draft suggested an unexpected filename: ${readinessEnvFilename}`);
    }
    const readinessCommandStrip = page.locator(smokeSelector("readiness-command-strip"));
    await waitVisible(readinessCommandStrip, "readiness release command strip");
    readinessCommandCount = Number(await readinessCommandStrip.getAttribute("data-command-count"));
    if (!Number.isFinite(readinessCommandCount) || readinessCommandCount < 5) {
      throw new Error("readiness release command strip should expose the release command runbook");
    }
    await waitVisible(
      page.locator(`${smokeSelector("readiness-command-strip")} code[data-command-id="verify"]`),
      "readiness verify command",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-command-strip")} code[data-command-id="release-env-json"]`),
      "readiness release env JSON command",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-command-strip")} code[data-command-id="release-preflight"]`),
      "readiness release preflight command",
    );
    const readinessEvidenceStrip = page.locator(smokeSelector("readiness-evidence-strip"));
    await waitVisible(readinessEvidenceStrip, "readiness launch evidence strip");
    readinessEvidenceCount = Number(await readinessEvidenceStrip.getAttribute("data-evidence-count"));
    if (!Number.isFinite(readinessEvidenceCount) || readinessEvidenceCount < 5) {
      throw new Error("readiness launch evidence strip should list release evidence artifacts");
    }
    await waitVisible(
      page.locator(`${smokeSelector("readiness-evidence-strip")} li[data-evidence-id="release-smoke-json"]`),
      "readiness release smoke evidence item",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-evidence-strip")} li[data-evidence-id="release-env-json"]`),
      "readiness release env JSON evidence item",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-evidence-strip")} li[data-evidence-id="release-preflight-json"]`),
      "readiness release preflight JSON evidence item",
    );
    const readinessPromotionGate = page.locator(smokeSelector("readiness-promotion-gate"));
    await waitVisible(readinessPromotionGate, "readiness promotion gate");
    readinessPromotionStatus = (await readinessPromotionGate.getAttribute("data-promotion-status")) ?? "";
    readinessPromotionArtifactCount = Number(await readinessPromotionGate.getAttribute("data-artifact-count"));
    readinessPromotionReadyCount = Number(await readinessPromotionGate.getAttribute("data-ready-artifacts"));
    if (!["ready", "partial", "blocked"].includes(readinessPromotionStatus)) {
      throw new Error(`readiness promotion gate exposed invalid status ${readinessPromotionStatus}`);
    }
    if (!Number.isFinite(readinessPromotionArtifactCount) || readinessPromotionArtifactCount < 5) {
      throw new Error("readiness promotion gate should expose all required launch artifacts");
    }
    if (!Number.isFinite(readinessPromotionReadyCount)) {
      throw new Error("readiness promotion gate should expose a numeric ready artifact count");
    }
    const readinessPromotionStrict = page.locator(smokeSelector("readiness-promotion-strict"));
    await waitVisible(readinessPromotionStrict, "readiness strict promotion summary");
    readinessPromotionStrictStatus = (await readinessPromotionStrict.getAttribute("data-strict-status")) ?? "";
    const readinessPromotionLocalReady = (await readinessPromotionStrict.getAttribute("data-local-ready")) ?? "";
    const readinessPromotionStrictReady = (await readinessPromotionStrict.getAttribute("data-strict-ready")) ?? "";
    if (!["ready", "pending", "blocked"].includes(readinessPromotionStrictStatus)) {
      throw new Error(`readiness strict promotion summary exposed invalid status ${readinessPromotionStrictStatus}`);
    }
    if (!["true", "false"].includes(readinessPromotionLocalReady) || !["true", "false"].includes(readinessPromotionStrictReady)) {
      throw new Error("readiness strict promotion summary should expose boolean local/strict readiness flags");
    }
    await waitVisible(
      page.locator(`${smokeSelector("readiness-promotion-gate")} li[data-promotion-artifact-id="smoke-full"]`),
      "readiness full smoke promotion artifact",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-promotion-gate")} li[data-promotion-artifact-id="launch-evidence"]`),
      "readiness strict evidence promotion artifact",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-promotion-gate")} li[data-promotion-artifact-id="promotion-refresh"]`),
      "readiness promotion refresh artifact",
    );
    const readinessHandoffStrip = page.locator(smokeSelector("readiness-handoff-strip"));
    await waitVisible(readinessHandoffStrip, "readiness launch handoff strip");
    readinessHandoffStatus = (await readinessHandoffStrip.getAttribute("data-handoff-status")) ?? "";
    readinessHandoffCheckCount = Number(await readinessHandoffStrip.getAttribute("data-handoff-check-count"));
    const readinessHandoffCanLaunch = (await readinessHandoffStrip.getAttribute("data-handoff-can-launch")) ?? "";
    if (!["ready", "pending", "blocked"].includes(readinessHandoffStatus)) {
      throw new Error(`readiness handoff exposed invalid status ${readinessHandoffStatus}`);
    }
    if (!Number.isFinite(readinessHandoffCheckCount) || readinessHandoffCheckCount < 4) {
      throw new Error("readiness handoff should expose the launch handoff checklist");
    }
    if (!["true", "false"].includes(readinessHandoffCanLaunch)) {
      throw new Error("readiness handoff should expose a boolean launch decision flag");
    }
    await waitVisible(
      page.locator(`${smokeSelector("readiness-handoff-strip")} li[data-handoff-check-id="production-env"]`),
      "readiness handoff production env check",
    );
    await waitVisible(
      page.locator(`${smokeSelector("readiness-handoff-strip")} li[data-handoff-check-id="strict-rehearsal"]`),
      "readiness handoff strict rehearsal check",
    );
    const readinessEvidenceButton = page.locator(smokeSelector("readiness-evidence-download"));
    await waitVisible(readinessEvidenceButton, "readiness evidence package download action");
    const readinessEvidenceDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await readinessEvidenceButton.click();
    const readinessEvidenceDownload = await readinessEvidenceDownloadPromise;
    readinessEvidenceFilename = readinessEvidenceDownload.suggestedFilename();
    if (!readinessEvidenceFilename.startsWith("nosu-best-launch-evidence-") || !readinessEvidenceFilename.endsWith(".json")) {
      throw new Error(`readiness evidence package suggested an unexpected filename: ${readinessEvidenceFilename}`);
    }
    const readinessReportButton = page.locator(smokeSelector("readiness-report-download"));
    await waitVisible(readinessReportButton, "readiness report download action");
    const readinessReportDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await readinessReportButton.click();
    const readinessReportDownload = await readinessReportDownloadPromise;
    readinessReportFilename = readinessReportDownload.suggestedFilename();
    if (!readinessReportFilename.startsWith("nosu-best-readiness-") || !readinessReportFilename.endsWith(".md")) {
      throw new Error(`readiness report suggested an unexpected filename: ${readinessReportFilename}`);
    }
    const readinessHandoffButton = page.locator(smokeSelector("readiness-handoff-download"));
    await waitVisible(readinessHandoffButton, "readiness handoff download action");
    const readinessHandoffDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await readinessHandoffButton.click();
    const readinessHandoffDownload = await readinessHandoffDownloadPromise;
    readinessHandoffFilename = readinessHandoffDownload.suggestedFilename();
    if (!readinessHandoffFilename.startsWith("nosu-best-launch-handoff-") || !readinessHandoffFilename.endsWith(".json")) {
      throw new Error(`readiness handoff suggested an unexpected filename: ${readinessHandoffFilename}`);
    }
    const opsSnapshotPanel = page.locator(smokeSelector("ops-snapshot-panel"));
    await waitVisible(opsSnapshotPanel, "operations snapshot panel");
    const opsSnapshotStatus = await opsSnapshotPanel.getAttribute("data-incident-status");
    const opsSnapshotOpenReports = Number(await opsSnapshotPanel.getAttribute("data-open-reports"));
    const opsSnapshotActiveSanctions = Number(await opsSnapshotPanel.getAttribute("data-active-sanctions"));
    opsSnapshotAuditCount = Number(await opsSnapshotPanel.getAttribute("data-audit-count"));
    const opsSnapshotActiveNotice = await opsSnapshotPanel.getAttribute("data-active-notice");
    if (!["ready", "warning", "blocked", "operational", "degraded", "maintenance", "checking"].includes(opsSnapshotStatus ?? "")) {
      throw new Error(`operations snapshot exposed invalid status ${opsSnapshotStatus}`);
    }
    if (
      !Number.isFinite(opsSnapshotOpenReports) ||
      !Number.isFinite(opsSnapshotActiveSanctions) ||
      !Number.isFinite(opsSnapshotAuditCount)
    ) {
      throw new Error("operations snapshot should expose numeric report, sanction, and audit counts");
    }
    if (!["true", "false"].includes(opsSnapshotActiveNotice ?? "")) {
      throw new Error("operations snapshot should expose whether an active notice exists");
    }
    const opsSnapshotJsonButton = page.locator(smokeSelector("ops-snapshot-json"));
    await waitVisible(opsSnapshotJsonButton, "operations snapshot JSON download action");
    const opsSnapshotJsonDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await opsSnapshotJsonButton.click();
    const opsSnapshotJsonDownload = await opsSnapshotJsonDownloadPromise;
    opsSnapshotJsonFilename = opsSnapshotJsonDownload.suggestedFilename();
    if (!opsSnapshotJsonFilename.startsWith("nosu-best-ops-snapshot-") || !opsSnapshotJsonFilename.endsWith(".json")) {
      throw new Error(`operations snapshot JSON suggested an unexpected filename: ${opsSnapshotJsonFilename}`);
    }
    const opsSnapshotMarkdownButton = page.locator(smokeSelector("ops-snapshot-markdown"));
    await waitVisible(opsSnapshotMarkdownButton, "operations snapshot Markdown download action");
    const opsSnapshotMarkdownDownloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS });
    await opsSnapshotMarkdownButton.click();
    const opsSnapshotMarkdownDownload = await opsSnapshotMarkdownDownloadPromise;
    opsSnapshotMarkdownFilename = opsSnapshotMarkdownDownload.suggestedFilename();
    if (!opsSnapshotMarkdownFilename.startsWith("nosu-best-ops-snapshot-") || !opsSnapshotMarkdownFilename.endsWith(".md")) {
      throw new Error(`operations snapshot Markdown suggested an unexpected filename: ${opsSnapshotMarkdownFilename}`);
    }
    await waitVisible(page.locator(smokeSelector("admin-message")), "operations snapshot confirmation message");

    await forceStaleStorageState(page);
    const storageSeedCounts = await restoreDemoSeedFromStoragePanel(page);
    storageSeedUsers = storageSeedCounts.users;
    storageSeedRooms = storageSeedCounts.rooms;
    storageSeedChannels = storageSeedCounts.channels;
    storageBackupFilename = storageSeedCounts.backupFilename;
    storageSecureBackupFilename = storageSeedCounts.secureBackupFilename;
    storageBackupValidationUsers = storageSeedCounts.backupValidationUsers;
    storageAuditExportFilename = storageSeedCounts.auditExportFilename;
    await page.locator(smokeSelector("nav-arena")).click();
    await waitVisible(page.locator(smokeSelector("arena-grid")), "arena after storage seed restore");
    const restoredChannelCount = await countVisible(page.locator(smokeSelector("channel-card")), "restored channel cards");
    if (restoredChannelCount < 2) {
      throw new Error(`storage seed restore should rebuild at least two visible channel cards, received ${restoredChannelCount}`);
    }

    await resetDemoState(page, "after storage seed smoke");
    await page.locator(smokeSelector("demo-member-login")).click();

    await waitVisible(page.locator(smokeSelector("app-shell")), "authenticated app shell after reset");
    await page.locator(smokeSelector("nav-profile")).click();
    await waitVisible(page.locator(smokeSelector("profile-view")), "profile view for session check");
    const sessionStatusCard = page.locator(smokeSelector("session-status-card"));
    await waitVisible(sessionStatusCard, "profile session status card");
    await page.waitForFunction(
      ({ selector }) => {
        const card = document.querySelector(selector);
        if (!card) return false;
        return (
          card.getAttribute("data-session-authenticated") === "true" &&
          Number(card.getAttribute("data-session-expires-in") ?? 0) > 0
        );
      },
      { selector: smokeSelector("session-status-card") },
      { timeout: TIMEOUT_MS },
    ).catch((error) => {
      throw new Error(`profile session card did not expose an active session: ${error.message}`);
    });
    const profileSessionUserId = await sessionStatusCard.getAttribute("data-session-user-id");
    const activeSwitcherUserId = await page.locator(smokeSelector("demo-user-switcher")).inputValue();
    if (!profileSessionUserId || profileSessionUserId !== activeSwitcherUserId) {
      throw new Error(`profile session user should match active user, got ${profileSessionUserId} vs ${activeSwitcherUserId}`);
    }
    const sessionRefreshResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/auth/session") && response.request().method() === "GET",
      { timeout: TIMEOUT_MS },
    );
    await page.locator(smokeSelector("session-refresh")).click();
    const sessionRefreshResponse = await sessionRefreshResponsePromise;
    const sessionRefreshPayload = await sessionRefreshResponse.json().catch(() => ({}));
    if (!sessionRefreshResponse.ok() || sessionRefreshPayload.authenticated !== true) {
      throw new Error(`profile session refresh failed: ${sessionRefreshResponse.status()} ${JSON.stringify(sessionRefreshPayload)}`);
    }
    await page.waitForFunction(
      ({ selector }) => document.querySelector(selector)?.getAttribute("data-session-authenticated") === "true",
      { selector: smokeSelector("session-status-card") },
      { timeout: TIMEOUT_MS },
    );
    await page.locator(smokeSelector("nav-arena")).click();
    await waitVisible(page.locator(smokeSelector("arena-grid")), "arena grid");
    const roomCount = await countVisible(page.locator(smokeSelector("room-item")), "room list");
    const channelCount = await countVisible(page.locator(smokeSelector("channel-card")), "channel cards");

    const firstCard = page.locator(smokeSelector("channel-card")).first();
    const selectedChannelId = await firstCard.getAttribute("data-channel-id");
    if (!selectedChannelId) {
      throw new Error("first channel card should expose data-channel-id for deep-link verification");
    }
    await firstCard.locator(smokeSelector("channel-select")).click();
    await waitVisible(page.locator(smokeSelector("channel-inspector")), "channel inspector");
    await waitVisible(page.locator(smokeSelector("channel-copy-link")), "channel link copy action");
    await page.waitForFunction(
      (channelId) => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        return params.get("view") === "arena" && params.get("channel") === channelId;
      },
      selectedChannelId,
      { timeout: TIMEOUT_MS },
    );
    const deepLinkUrl = page.url();
    const deepLinkHash = new URL(deepLinkUrl).hash;
    if (!deepLinkHash.includes("channel=")) {
      throw new Error(`selected channel should update the URL hash, received ${deepLinkHash}`);
    }

    await page.goto(deepLinkUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await waitVisible(page.locator(smokeSelector("app-shell")), "authenticated app shell after deep link reload");
    await waitVisible(page.locator(smokeSelector("arena-grid")), "arena grid after deep link reload");
    await waitVisible(
      page.locator(`${smokeSelector("channel-card")}.selected[data-channel-id="${selectedChannelId}"]`),
      "deep-linked selected channel card",
    );
    await waitVisible(page.locator(smokeSelector("channel-inspector")), "channel inspector after deep link reload");

    const availableActions = await page
      .locator(
        [
          smokeSelector("channel-enter"),
          smokeSelector("channel-join"),
          smokeSelector("channel-spectate"),
        ].join(", "),
      )
      .count();
    if (availableActions < 1) {
      throw new Error("selected channel should expose at least one enter, join, or spectate action");
    }

    await page.locator(smokeSelector("invite-code-input")).fill("NB-2046");
    await page.locator(smokeSelector("invite-code-submit")).click();
    const privateChannelCard = page.locator(`${smokeSelector("channel-card")}[data-channel-id="d_ai_private"]`);
    await waitVisible(privateChannelCard, "invite-code private channel card");
    if (!(await privateChannelCard.evaluate((element) => element.classList.contains("selected")).catch(() => false))) {
      await privateChannelCard.locator(smokeSelector("channel-select")).click();
    }
    await waitVisible(
      page.locator(`${smokeSelector("channel-card")}.selected[data-channel-id="d_ai_private"]`),
      "invite-code joined private channel card",
    );
    await waitVisible(
      page.locator(`${smokeSelector("debate-flow-board")}[data-channel-status="waiting"][data-phase="ready"]`),
      "ready phase board after invite-code join",
    );
    const voiceLobby = page.locator(smokeSelector("voice-lobby"));
    await waitVisible(voiceLobby, "voice lobby after invite-code join");
    await waitVoiceLobbyConnectable(page, "voice lobby after invite-code join");
    const voiceParticipantCount = await countVisible(page.locator(smokeSelector("voice-person")), "voice roster participants");
    if (voiceParticipantCount < 2) {
      throw new Error(`voice roster should include both participants, received ${voiceParticipantCount}`);
    }
    await waitVoicePersonState(page, "u_seojun", { "data-muted": "true", "data-hand-raised": "false" }, "joined participant initial voice state");
    const voiceHandToggle = page.locator(smokeSelector("voice-hand-toggle"));
    const voiceMicToggle = page.locator(smokeSelector("voice-mic-toggle"));
    await waitVisible(voiceHandToggle, "voice hand toggle");
    await waitVisible(voiceMicToggle, "voice mic toggle");
    await waitVisible(page.locator(`${smokeSelector("voice-call-panel")}[data-connection-status="idle"]`), "idle voice call panel");
    const voiceCallStart = page.locator(smokeSelector("voice-call-start"));
    await waitVisible(voiceCallStart, "voice call start action");
    if (await voiceCallStart.isDisabled()) {
      throw new Error("voice call start should be enabled for a full voice channel");
    }
    await voiceHandToggle.click();
    await waitVoicePersonState(page, "u_seojun", { "data-hand-raised": "true" }, "voice hand raised state");
    await voiceMicToggle.click();
    await waitVoicePersonState(page, "u_seojun", { "data-muted": "false" }, "voice mic unmuted state");
    await voiceMicToggle.click();
    await waitVoicePersonState(page, "u_seojun", { "data-muted": "true" }, "voice mic reset state");
    await voiceHandToggle.click();
    await waitVoicePersonState(page, "u_seojun", { "data-hand-raised": "false" }, "voice hand reset state");

    await clickReadyToggle(page, "member ready toggle");
    await switchDemoUser(page, "u_yeonwoo", "second participant switch");
    await waitReadyState(page, "waiting", "second participant ready toggle");
    await clickReadyToggle(page, "second participant ready toggle");
    await waitVisible(page.locator(smokeSelector("start-debate")), "start debate action");
    await page.locator(smokeSelector("start-debate")).click();
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "opening" },
      "live opening phase after start",
    );

    const firstOpeningSpeakerId = await switchToActiveSpeaker(page, "first opening speaker switch");
    await submitDebateMessage(page, "브라우저 스모크 기조 발언입니다.", 1, "first opening");
    await page.locator(smokeSelector("advance-phase")).click();
    await waitBoardAttributeChange(page, "data-active-speaker-id", firstOpeningSpeakerId, "second opening speaker");
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "opening" },
      "second opening speaker",
    );
    await switchToActiveSpeaker(page, "second opening speaker switch");
    await submitDebateMessage(page, "상대 기조에 대한 브라우저 스모크 응답입니다.", 2, "second opening");
    await page.locator(smokeSelector("advance-phase")).click();
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "crossfire" },
      "crossfire phase",
    );
    const crossfireSpeakerId = await switchToActiveSpeaker(page, "crossfire speaker switch");
    await waitVisible(page.locator(smokeSelector("pass-turn")), "pass turn action");
    await page.locator(smokeSelector("pass-turn")).click();
    await waitBoardAttributeChange(page, "data-active-speaker-id", crossfireSpeakerId, "crossfire turn passed");
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "crossfire" },
      "crossfire turn passed",
    );
    await page.locator(smokeSelector("advance-phase")).click();
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "closing" },
      "closing first speaker",
    );
    const firstClosingSpeakerId = await boardAttribute(page, "data-active-speaker-id");
    await page.locator(smokeSelector("advance-phase")).click();
    await waitBoardAttributeChange(page, "data-active-speaker-id", firstClosingSpeakerId, "closing second speaker");
    await waitBoardState(
      page,
      { "data-channel-status": "live", "data-phase": "closing" },
      "closing second speaker",
    );
    await switchToActiveSpeaker(page, "closing speaker switch");
    await page.locator(smokeSelector("advance-phase")).click();
    await waitBoardState(
      page,
      { "data-channel-status": "voting", "data-phase": "voting", "data-active-speaker-id": "" },
      "voting phase",
    );

    await switchDemoUser(page, "u_admin", "spectator vote switch");
    await waitVisible(page.locator(smokeSelector("detail-spectate")), "spectator enter action");
    await page.locator(smokeSelector("detail-spectate")).click();
    await waitVisible(page.locator(`${smokeSelector("vote-status")}[data-vote-state="open"]`), "open vote status");
    await page.locator(smokeSelector("vote-option")).first().click();
    await waitVisible(page.locator(`${smokeSelector("vote-status")}[data-vote-state="done"]`), "completed vote status");
    await waitBoardState(page, { "data-channel-status": "voting", "data-phase": "voting", "data-vote-count": "1" }, "vote count");
    const judgePayload = await finalizeWithLocalJudge(page, "d_ai_private", "u_admin");
    if (judgePayload.source !== "fallback") {
      throw new Error(`browser smoke expected local fallback judge, received ${judgePayload.source}`);
    }
    await waitBoardState(
      page,
      { "data-channel-status": "finished", "data-phase": "finished", "data-vote-count": "1" },
      "finished phase after local judge",
    );
    await waitVisible(page.locator(smokeSelector("result-summary")), "result summary");
    await waitVisible(page.locator(smokeSelector("replay-summary")), "replay summary");
    await waitVisible(page.locator(`${smokeSelector("archive-panel")}[data-archive-count="1"]`), "finished archive count");
    await waitVisible(page.locator(smokeSelector("archive-featured")), "archive featured debate");
    await page.locator(smokeSelector("result-copy")).click();
    await waitVisible(page.getByRole("button", { name: /복사됨/ }), "copied result share text");

    const finalizedChannel = judgePayload.state?.channels?.find((channel) => channel.id === "d_ai_private");
    const winnerId = finalizedChannel?.finalResult?.winnerId;
    const winner = judgePayload.state?.users?.find((user) => user.id === winnerId);
    const rewardEntry = judgePayload.state?.ledger?.find(
      (item) => item.type === "debate_reward" && item.userId === winnerId && item.memo.includes("[d_ai_private]"),
    );
    if (!winnerId || !winner || !rewardEntry) {
      throw new Error("finalized state should include winner, winner profile, and debate reward ledger entry");
    }

    await switchDemoUser(page, winnerId, "winner account switch");
    await page.waitForFunction(
      ({ selector, coins }) => document.querySelector(selector)?.getAttribute("data-current-coins") === String(coins),
      { selector: smokeSelector("coin-pill"), coins: winner.coins },
      { timeout: TIMEOUT_MS },
    );
    await waitVisible(page.locator(`${smokeSelector("notification-center")}[data-unread-count="1"]`), "winner unread notification count");
    await page.locator(smokeSelector("notification-trigger")).click();
    await waitVisible(
      page.locator(`${smokeSelector("notification-item")}[data-notification-kind="debate"][data-read-state="unread"]`),
      "winner debate notification",
    );
    await page.locator(`${smokeSelector("notification-item")}[data-notification-kind="debate"]`).first().click();
    await waitVisible(page.locator(smokeSelector("result-summary")), "result summary after notification open");

    await page.locator(smokeSelector("nav-wallet")).click();
    await waitVisible(
      page.locator(`${smokeSelector("wallet-view")}[data-wallet-user-id="${winnerId}"]`),
      "winner wallet view",
    );
    await waitVisible(
      page.locator(`${smokeSelector("wallet-balance")}[data-current-coins="${winner.coins}"]`),
      "winner wallet balance",
    );
    await waitVisible(
      page.locator(`${smokeSelector("wallet-debate-reward")}[data-debate-reward="${rewardEntry.amount}"]`),
      "winner debate reward total",
    );
    await waitVisible(
      page.locator(`${smokeSelector("ledger-row")}[data-ledger-type="debate_reward"][data-ledger-amount="${rewardEntry.amount}"]`),
      "winner reward ledger row",
    );
    await waitVisible(
      page.locator(`${smokeSelector("ranking-row")}[data-user-id="${winnerId}"][data-user-wins="${winner.stats.wins}"]`),
      "winner ranking stats",
    );

    await resetDemoState(page, "final");
    await waitVisible(page.locator(smokeSelector("auth-layout")), "auth screen after final cleanup");

    if (pageErrors.length) {
      throw new Error(`browser page errors were reported: ${pageErrors.join(" | ")}`);
    }

    console.log("Browser smoke passed", {
      app: APP_URL,
      headless: HEADLESS,
      rooms: roomCount,
      channels: channelCount,
      deepLink: deepLinkHash,
      inviteCodeJoin: "d_ai_private",
      voiceLobby: "checked",
      voiceParticipantCount,
      debateStart: "opening",
      debateMessages: 2,
      debatePhase: "voting",
      spectatorVotes: 1,
      judgeSource: judgePayload.source,
      finalPhase: "finished",
      readinessLaunch: readinessLaunchStatus,
      readinessBlockers,
      readinessWarnings,
      readinessPhaseCount,
      readinessRequiredOpen,
      readinessLoginLimit,
      readinessReportFilename,
      readinessEnvFilename,
      readinessCommandCount,
      readinessEvidenceFilename,
      readinessEvidenceCount,
      readinessHandoffFilename,
      readinessHandoffStatus,
      readinessHandoffCheckCount,
      readinessPromotionStatus,
      readinessPromotionArtifactCount,
      readinessPromotionReadyCount,
      readinessPromotionStrictStatus,
      opsSnapshotJsonFilename,
      opsSnapshotMarkdownFilename,
      opsSnapshotAuditCount,
      storageSeedUsers,
      storageSeedRooms,
      storageSeedChannels,
      storageBackupFilename,
      storageSecureBackupFilename,
      storageBackupValidationUsers,
      storageAuditExportFilename,
      winnerId,
      winnerCoins: winner.coins,
      rewardCoins: rewardEntry.amount,
      winnerWins: winner.stats.wins,
    });
  } catch (error) {
    const failurePath = path.join(OUTPUT_DIR, "browser-smoke-failure.png");
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
    await bestEffortReset(page);
    console.error("Browser smoke failed:", error.message);
    console.error("Failure screenshot:", failurePath);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Browser smoke failed:", error.message);
  process.exitCode = 1;
});
