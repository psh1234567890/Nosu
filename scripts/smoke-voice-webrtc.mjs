import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const APP_URL = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:5173/";
const HEADLESS = process.env.SMOKE_BROWSER_HEADLESS !== "false";
const TIMEOUT_MS = Number(process.env.SMOKE_BROWSER_TIMEOUT_MS ?? 20_000);
const OUTPUT_DIR =
  process.env.SMOKE_BROWSER_OUTPUT_DIR ?? path.join(process.cwd(), "output", "playwright");
const VOICE_CHANNEL_ID = process.env.SMOKE_VOICE_CHANNEL_ID ?? "d_ai_private";
const VOICE_INVITE_CODE = process.env.SMOKE_VOICE_INVITE_CODE ?? "NB-2046";

function smokeSelector(name) {
  return `[data-smoke="${name}"]`;
}

async function waitVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: TIMEOUT_MS }).catch((error) => {
    throw new Error(`${label} was not visible within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitVoiceLobbyConnectable(page, label) {
  await page.waitForFunction(
    ({ selector, channelId }) => {
      const lobby = document.querySelector(selector);
      if (!lobby) return false;
      const participantCount = Number(lobby.getAttribute("data-participant-count") ?? 0);
      return (
        lobby.getAttribute("data-channel-id") === channelId &&
        lobby.getAttribute("data-channel-format") === "voice" &&
        lobby.getAttribute("data-can-connect") === "true" &&
        participantCount >= 2
      );
    },
    { selector: smokeSelector("voice-lobby"), channelId: VOICE_CHANNEL_ID },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not become connectable within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitVoicePanelStatus(page, expectedStatuses, label) {
  await page.waitForFunction(
    ({ selector, statuses }) => {
      const panel = document.querySelector(selector);
      if (!panel) return false;
      return statuses.includes(panel.getAttribute("data-connection-status"));
    },
    { selector: smokeSelector("voice-call-panel"), statuses: expectedStatuses },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not reach ${expectedStatuses.join("/")} within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitVoiceConnected(page, label) {
  await page.waitForFunction(
    ({ selector }) => {
      const panel = document.querySelector(selector);
      if (!panel) return false;
      return (
        panel.getAttribute("data-connection-status") === "connected" &&
        Number(panel.getAttribute("data-peer-count") ?? 0) >= 1 &&
        panel.getAttribute("data-local-track-muted") === "false"
      );
    },
    { selector: smokeSelector("voice-call-panel") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not connect within ${TIMEOUT_MS}ms: ${error.message}`);
  });
}

async function waitAuthOrShell(page, label) {
  await page.waitForFunction(
    ({ authSelector, shellSelector }) =>
      Boolean(document.querySelector(authSelector) || document.querySelector(shellSelector)),
    { authSelector: smokeSelector("auth-layout"), shellSelector: smokeSelector("app-shell") },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not render auth or app shell: ${error.message}`);
  });
}

async function switchDemoUser(page, userId, label) {
  await page.locator(smokeSelector("demo-user-switcher")).selectOption(userId);
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector: smokeSelector("demo-user-switcher"), value: userId },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} did not switch to ${userId}: ${error.message}`);
  });
}

async function resetDemoState(page, label) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await waitAuthOrShell(page, label);
  if (await page.locator(smokeSelector("auth-layout")).isVisible().catch(() => false)) {
    await page.locator(smokeSelector("demo-admin-login")).click();
    await waitVisible(page.locator(smokeSelector("app-shell")), `${label} admin app shell`);
  }
  const switcher = page.locator(smokeSelector("demo-user-switcher"));
  if ((await switcher.inputValue().catch(() => "")) !== "u_admin") {
    await switchDemoUser(page, "u_admin", `${label} admin switch`);
  }
  await page.locator(smokeSelector("reset-demo")).click();
  await waitVisible(page.locator(smokeSelector("auth-layout")), `${label} auth screen after reset`);
}

async function loginAsMember(page, label) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
  await waitAuthOrShell(page, label);
  if (await page.locator(smokeSelector("auth-layout")).isVisible().catch(() => false)) {
    await page.locator(smokeSelector("demo-member-login")).click();
  }
  await waitVisible(page.locator(smokeSelector("app-shell")), `${label} app shell`);
}

async function openArena(page, label) {
  await page.locator(smokeSelector("nav-arena")).click();
  await waitVisible(page.locator(smokeSelector("arena-grid")), `${label} arena`);
}

async function joinVoiceChannelByInvite(page, label) {
  await openArena(page, label);
  await page.locator(smokeSelector("invite-code-input")).fill(VOICE_INVITE_CODE);
  await page.locator(smokeSelector("invite-code-submit")).click();
  const cardSelector = `${smokeSelector("channel-card")}[data-channel-id="${VOICE_CHANNEL_ID}"]`;
  await waitVisible(page.locator(cardSelector), `${label} voice channel card after invite`);
  await page.waitForFunction(
    ({ selector }) => Number(document.querySelector(selector)?.getAttribute("data-participant-count") ?? 0) >= 2,
    { selector: cardSelector },
    { timeout: TIMEOUT_MS },
  ).catch((error) => {
    throw new Error(`${label} voice channel did not include both participants after invite: ${error.message}`);
  });
  await page.locator(cardSelector).locator(smokeSelector("channel-enter")).click();
  await waitVoiceLobbyConnectable(page, `${label} voice lobby`);
}

async function selectVoiceChannel(page, label) {
  await openArena(page, label);
  const card = page.locator(`${smokeSelector("channel-card")}[data-channel-id="${VOICE_CHANNEL_ID}"]`);
  await waitVisible(card, `${label} voice channel card`);
  await card.locator(smokeSelector("channel-enter")).click();
  await waitVoiceLobbyConnectable(page, `${label} voice lobby`);
}

async function startVoiceConnection(page, label) {
  const startButton = page.locator(smokeSelector("voice-call-start"));
  await waitVisible(startButton, `${label} voice call start`);
  if (await startButton.isDisabled()) {
    throw new Error(`${label} voice call start should be enabled`);
  }
  await startButton.click();
  await waitVoicePanelStatus(page, ["ready", "calling", "connected"], label);
}

async function closeVoiceConnection(page, label) {
  const endButton = page.locator(smokeSelector("voice-call-end"));
  if (await endButton.isVisible().catch(() => false)) {
    await endButton.click();
    await waitVoicePanelStatus(page, ["idle"], label);
  }
}

async function readVoiceDebug(page) {
  return page.evaluate(({ panelSelector, errorSelector }) => {
    const panel = document.querySelector(panelSelector);
    const error = document.querySelector(errorSelector);
    return {
      status: panel?.getAttribute("data-connection-status") ?? null,
      peerCount: panel?.getAttribute("data-peer-count") ?? null,
      canConnect: panel?.getAttribute("data-can-connect") ?? null,
      localTrackMuted: panel?.getAttribute("data-local-track-muted") ?? null,
      targetPeerId: panel?.getAttribute("data-target-peer-id") ?? null,
      error: error?.textContent?.trim() ?? "",
    };
  }, { panelSelector: smokeSelector("voice-call-panel"), errorSelector: smokeSelector("voice-error") });
}

async function createVoiceContext(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.grantPermissions(["microphone"], { origin: new URL(APP_URL).origin }).catch(() => {});
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
  return { context, page, pageErrors };
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      headless: HEADLESS,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
  } catch (error) {
    if (String(error?.message ?? "").includes("Executable doesn't exist")) {
      throw new Error(
        "Playwright Chromium is not installed. Run `npx playwright install chromium` once, then retry `npm run smoke:voice` or `npm run smoke:voice:managed`.",
      );
    }
    throw error;
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await launchBrowser();
  let seojun;
  let yeonwoo;
  try {
    const reset = await createVoiceContext(browser, "reset");
    await resetDemoState(reset.page, "voice smoke reset");
    await reset.context.close();

    seojun = await createVoiceContext(browser, "u_seojun");
    yeonwoo = await createVoiceContext(browser, "u_yeonwoo");

    await loginAsMember(seojun.page, "u_seojun");
    await joinVoiceChannelByInvite(seojun.page, "u_seojun");

    await loginAsMember(yeonwoo.page, "u_yeonwoo");
    await switchDemoUser(yeonwoo.page, "u_yeonwoo", "u_yeonwoo");
    await selectVoiceChannel(yeonwoo.page, "u_yeonwoo");

    await startVoiceConnection(seojun.page, "u_seojun");
    await startVoiceConnection(yeonwoo.page, "u_yeonwoo");
    await Promise.all([
      waitVoiceConnected(seojun.page, "u_seojun"),
      waitVoiceConnected(yeonwoo.page, "u_yeonwoo"),
    ]);

    const seojunPanel = seojun.page.locator(smokeSelector("voice-call-panel"));
    const yeonwooPanel = yeonwoo.page.locator(smokeSelector("voice-call-panel"));
    const result = {
      app: APP_URL,
      channelId: VOICE_CHANNEL_ID,
      inviteCode: VOICE_INVITE_CODE,
      seojunStatus: await seojunPanel.getAttribute("data-connection-status"),
      yeonwooStatus: await yeonwooPanel.getAttribute("data-connection-status"),
      seojunPeers: Number(await seojunPanel.getAttribute("data-peer-count")),
      yeonwooPeers: Number(await yeonwooPanel.getAttribute("data-peer-count")),
      headless: HEADLESS,
    };

    await closeVoiceConnection(seojun.page, "u_seojun close");
    await closeVoiceConnection(yeonwoo.page, "u_yeonwoo close");

    const pageErrors = [...seojun.pageErrors, ...yeonwoo.pageErrors];
    if (pageErrors.length) {
      throw new Error(`voice browser page errors were reported: ${pageErrors.join(" | ")}`);
    }

    console.log("Voice smoke passed", result);
  } catch (error) {
    const debug = {
      seojun: seojun?.page ? await readVoiceDebug(seojun.page).catch((debugError) => ({ debugError: debugError.message })) : null,
      yeonwoo: yeonwoo?.page ? await readVoiceDebug(yeonwoo.page).catch((debugError) => ({ debugError: debugError.message })) : null,
    };
    console.error("Voice smoke debug:", JSON.stringify(debug, null, 2));
    await seojun?.page
      ?.screenshot({ path: path.join(OUTPUT_DIR, "voice-smoke-seojun-failure.png"), fullPage: true })
      .catch(() => {});
    await yeonwoo?.page
      ?.screenshot({ path: path.join(OUTPUT_DIR, "voice-smoke-yeonwoo-failure.png"), fullPage: true })
      .catch(() => {});
    console.error("Voice smoke failed:", error.message);
    console.error("Failure screenshots:", OUTPUT_DIR);
    process.exitCode = 1;
  } finally {
    await seojun?.context?.close().catch(() => {});
    await yeonwoo?.context?.close().catch(() => {});
    const cleanup = await createVoiceContext(browser, "cleanup").catch(() => null);
    if (cleanup) {
      await resetDemoState(cleanup.page, "voice smoke cleanup").catch(() => {});
      await cleanup.context.close().catch(() => {});
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Voice smoke failed:", error.message);
  process.exitCode = 1;
});
