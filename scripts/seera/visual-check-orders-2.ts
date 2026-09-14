import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Follow-up to visual-check-orders.ts — that run's failures (filter click, search, order detail)
// were traced to insufficient wait time (one page took 61s against a slow TEST DB today; a
// screenshot literally caught the "Loading Seera workspace..." spinner mid-render). This version
// waits for that spinner to disappear before asserting on content, with generous timeouts.

const BASE_URL = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "..", ".tmp-orders-screenshots");
mkdirSync(OUT_DIR, { recursive: true });
const NAV_TIMEOUT = 90000;

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`); if (ok) pass++; else fail++; }

async function waitReady(page: Page) {
  await page.waitForSelector("text=Loading Seera workspace", { state: "detached", timeout: NAV_TIMEOUT }).catch(() => null);
  await page.waitForLoadState("domcontentloaded").catch(() => null);
  await page.waitForTimeout(500);
}

async function attemptLogin(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  // login-form.tsx calls preventDefault() and does its own fetch("/api/auth/login") — the plain
  // <form method="post"> has no `action`, so if this click races React hydration (before the
  // onSubmit listener attaches), the browser falls back to a NATIVE form submit straight to the
  // current URL ("POST /login"), which just re-renders the page with no real session — exactly
  // the "POST /login 200 -> bounced back to /login" failure this script kept hitting. Waiting for
  // the submit button to actually be enabled/interactive (React has rendered it either way, but
  // this also gives networkidle a moment to reflect hydration's own script execution) avoids it.
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => null);
  await page.waitForTimeout(800);
  await page.fill('input[name="email"]', "review-founder@seera.test");
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login"), { timeout: NAV_TIMEOUT }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL((url) => url.pathname.startsWith("/portal"), { timeout: NAV_TIMEOUT }).catch(() => null);
  await waitReady(page);
  return page.url().includes("/portal");
}

async function login(page: Page): Promise<boolean> {
  // Warm up middleware (Next dev compiles it lazily on first use — a fresh dev server's very
  // first post-login navigation can race that compile and bounce back to /login; a harmless
  // throwaway hit here means the real login attempt below never has to pay that cost).
  await page.goto(`${BASE_URL}/portal/warmup`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => null);
  if (await attemptLogin(page)) return true;
  console.log("  [info] first login attempt bounced back to /login — retrying once");
  return attemptLogin(page);
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    check("Founder login succeeds", await login(page));

    console.log("\n=== Orders — status filter click actually filters ===");
    await page.goto(`${BASE_URL}/portal/founder-admin/orders`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await waitReady(page);
    const deliveredCard = page.locator("a").filter({ hasText: "Delivered" }).first();
    await deliveredCard.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("status") === "DELIVERED", { timeout: NAV_TIMEOUT }),
      deliveredCard.click(),
    ]).then(
      () => check("URL carries ?status=DELIVERED after clicking the Delivered KPI", true),
      (e) => check("URL carries ?status=DELIVERED after clicking the Delivered KPI", false, e instanceof Error ? e.message.split("\n")[0] : String(e)),
    );
    await waitReady(page);
    const rowsAfterFilter = await page.locator("td:has-text('Delivered')").count();
    const rowsPendingAfterFilter = await page.locator("td:has-text('Submitted'), td:has-text('Confirmed')").count();
    check("filtered list actually shows only Delivered-bucket statuses (no Submitted/Confirmed rows)", rowsAfterFilter > 0 && rowsPendingAfterFilter === 0, `delivered-rows=${rowsAfterFilter} other-rows=${rowsPendingAfterFilter}`);
    await page.screenshot({ path: path.join(OUT_DIR, "orders-filtered-delivered-v2.png"), fullPage: true }).catch(() => null);

    console.log("\n=== Search actually works ===");
    await page.goto(`${BASE_URL}/portal/founder-admin/orders`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await waitReady(page);
    await page.fill('input[name="q"]', "zzzznonexistentquery9999");
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("q") === "zzzznonexistentquery9999", { timeout: NAV_TIMEOUT }),
      page.click('button:has-text("Search")'),
    ]);
    await waitReady(page);
    check("searching a nonsense query yields the empty state", (await page.locator("text=No orders found").count()) > 0);
    await page.screenshot({ path: path.join(OUT_DIR, "orders-search-empty-v2.png"), fullPage: true }).catch(() => null);

    console.log("\n=== Order Detail — click VIEW ORDER actually navigates ===");
    await page.goto(`${BASE_URL}/portal/founder-admin/orders`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await waitReady(page);
    const viewLink = page.locator('a:has-text("VIEW ORDER")').first();
    await viewLink.waitFor({ state: "visible", timeout: NAV_TIMEOUT });
    await Promise.all([
      page.waitForURL((url) => /\/orders\/[a-z0-9]+/i.test(url.pathname), { timeout: NAV_TIMEOUT }),
      viewLink.click(),
    ]);
    await waitReady(page);
    check("clicking VIEW ORDER lands on an order detail page with real content", /\/orders\/[a-z0-9]+/i.test(page.url()));
    await page.screenshot({ path: path.join(OUT_DIR, "order-detail-v2.png"), fullPage: true }).catch(() => null);

    console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  } finally {
    await browser.close();
  }
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
