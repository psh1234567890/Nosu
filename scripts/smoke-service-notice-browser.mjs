import { chromium } from "playwright";

const APP_URL = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:5173/";
const API_AUTH_DEMO_URL =
  process.env.SMOKE_API_AUTH_DEMO_URL ?? new URL("/api/auth/select-demo", APP_URL).toString();
const API_SERVICE_NOTICE_URL =
  process.env.SMOKE_API_ADMIN_SERVICE_NOTICE_URL ?? new URL("/api/admin/service-notice", API_AUTH_DEMO_URL).toString();

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function sessionFromResponse(response, payload, label) {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert(cookie.includes("nb_session="), `${label} should set an auth session cookie`);
  assert(typeof payload.csrfToken === "string" && payload.csrfToken.length > 0, `${label} should return csrfToken`);
  return { cookie: cookie.split(";")[0], csrfToken: payload.csrfToken };
}

async function createAdminSession() {
  const login = await writeJson(API_AUTH_DEMO_URL, { userId: "u_admin" });
  assert(login.response.ok, "demo admin login should succeed");
  assert(login.payload.ok === true, "demo admin login should report ok=true");
  return sessionFromResponse(login.response, login.payload, "demo admin login");
}

function browserCookieFromSession(session) {
  const [name, ...valueParts] = session.cookie.split("=");
  const appUrl = new URL(APP_URL);
  return {
    name,
    value: valueParts.join("="),
    domain: appUrl.hostname,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  };
}

async function main() {
  const session = await createAdminSession();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const notice = await writeJson(
    API_SERVICE_NOTICE_URL,
    {
      title: "브라우저 공지",
      body: "상단 공지 배너가 실제 화면에 표시되는지 확인합니다.",
      tone: "critical",
      active: true,
      expiresAt,
    },
    {
      cookie: session.cookie,
      "x-csrf-token": session.csrfToken,
    },
  );
  assert(notice.response.ok, "service notice publish should succeed before browser check");
  assert(notice.payload.serviceNotice?.tone === "critical", "published notice should keep critical tone");
  assert(notice.payload.serviceNotice?.expiresAt === expiresAt, "published notice should keep expiry");

  const browser = await chromium.launch({ headless: true });
  try {
    const publicContext = await browser.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.goto(APP_URL, { waitUntil: "domcontentloaded" });
      const statusCard = publicPage.locator("[data-smoke='public-service-status']");
      await statusCard.waitFor({ timeout: 15_000 });
      const publicStatusText = await statusCard.innerText();
      assert(publicStatusText.includes("브라우저 공지"), "public service status should render the notice title before login");
      assert(publicStatusText.includes("상단 공지 배너"), "public service status should render the notice body before login");
      assert(publicStatusText.includes("자동 해제"), "public service status should render the notice expiry");
      assert(
        (await statusCard.getAttribute("data-service-status")) === "maintenance",
        "critical notice should mark public service status as maintenance",
      );
    } finally {
      await publicContext.close();
    }

    const context = await browser.newContext();
    await context.addCookies([browserCookieFromSession(session)]);
    const page = await context.newPage();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    const banner = page.locator("[data-smoke='service-notice-banner']");
    await banner.waitFor({ timeout: 15_000 });
    const text = await banner.innerText();
    assert(text.includes("브라우저 공지"), "service notice banner should render the notice title");
    assert(text.includes("상단 공지 배너"), "service notice banner should render the notice body");
    assert(text.includes("자동 해제"), "service notice banner should render the notice expiry");
    assert((await banner.getAttribute("data-notice-tone")) === "critical", "service notice banner tone should be critical");
    assert((await banner.getAttribute("data-notice-expires-at")) === expiresAt, "service notice banner should expose expiry");
    const serviceStatusPill = page.locator("[data-smoke='service-status-pill']");
    await serviceStatusPill.waitFor({ timeout: 10_000 });
    assert(
      (await serviceStatusPill.getAttribute("data-service-status")) === "maintenance",
      "logged-in service status pill should reflect the critical notice",
    );
    console.log("Service notice browser smoke passed", {
      app: APP_URL,
      notice: notice.payload.serviceNotice.title,
      tone: notice.payload.serviceNotice.tone,
      publicStatus: "maintenance",
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Service notice browser smoke failed:", error.message);
  process.exitCode = 1;
});
