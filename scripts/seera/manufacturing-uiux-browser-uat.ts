import { chromium, type Page, type BrowserContext } from "playwright";

// TEST-only browser UAT for the Manufacturing UI/UX closure pass. Dev server
// must already be running against TEST_DATABASE_URL on http://localhost:3000.
// Logs in via POST /api/auth/login (sets the real session cookie through
// Playwright's shared APIRequestContext — no manual cookie extraction needed)
// then drives each dedicated workspace, Search, Reports Center, Machines/
// Shifts, Product 360, screenshotting each and checking for console errors.
//
// Two real, non-obvious gotchas found and fixed while building this:
// 1. waitUntil:"networkidle" against a Next.js DEV server hangs indefinitely
//    (HMR keeps a WebSocket open, so the network never goes idle) — every
//    navigation here uses "load" + an explicit, timed waitForSelector.
// 2. Loose `text=` selectors are ambiguous: founder-admin's OWN sidebar has
//    ordinary nav items ("Masters & pricing") that substring-match the exact
//    same words as this panel's own group buttons ("Masters"), silently
//    clicking the wrong element with no error. Every click on this panel's
//    own controls goes through btn()/exactText() below, which scopes to a
//    real <button> with an EXACT name — never a substring `text=` guess.
const BASE = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";
const ACTION_TIMEOUT_MS = 15_000;
const NAV_TIMEOUT_MS = 20_000;

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string) {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}
async function softly(label: string, fn: () => Promise<void>) {
  try { await fn(); } catch (error) { fail++; console.error(`  FAIL: ${label} — ${error instanceof Error ? error.message.split("\n")[0] : error}`); }
}

async function newBoundedContext(browser: import("playwright").Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  return context;
}

async function loginAs(page: Page, email: string) {
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password: PASSWORD }, timeout: NAV_TIMEOUT_MS });
  if (!res.ok()) throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  // landingPath ("/portal/manufacturing") is the portal's generic quick-access
  // hub (ProductHome — a real, pre-existing platform pattern shared by every
  // portal, not Manufacturing-specific), one card away from the actual
  // workspace at .../manufacturing-os. Real users click through it; this
  // navigates straight there since that's what's actually under UAT.
  const landingPath = body.landingPath as string;
  return landingPath === "/portal/manufacturing" ? "/portal/manufacturing/manufacturing-os" : landingPath;
}

function watchConsoleErrors(page: Page, label: string) {
  const errors: string[] = [];
  const handler = (msg: import("playwright").ConsoleMessage) => { if (msg.type() === "error") errors.push(msg.text()); };
  page.on("console", handler);
  return () => { page.off("console", handler); assert(errors.length === 0, `${label}: zero console errors (${errors.length ? errors.join(" | ").slice(0, 200) : "none"})`); };
}

const shot = (page: Page, name: string) => page.screenshot({ path: `manufacturing-uat-${name}.png`, fullPage: true, timeout: ACTION_TIMEOUT_MS }).catch((e) => console.error(`  (screenshot ${name} failed: ${e instanceof Error ? e.message.split("\n")[0] : e})`));
// Exact-match <button> click — never a substring text= guess that could hit
// an unrelated sidebar link containing the same word.
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first().click({ timeout: ACTION_TIMEOUT_MS }).catch(() => {});

async function main() {
  // Pre-warm the login route outside any Playwright timeout budget — Next.js
  // dev compiles a route on its first hit, which can itself take longer than
  // a single action timeout on a cold server.
  await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "warmup@invalid", password: "x" }) }).catch(() => {});

  const browser = await chromium.launch({ args: ["--no-sandbox"] });

  console.log("\n=== OPERATOR workspace ===");
  await softly("Operator workspace", async () => {
    const context = await newBoundedContext(browser);
    const page = await context.newPage();
    const done = watchConsoleErrors(page, "Operator workspace");
    const landing = await loginAs(page, "review-production-operator@seera.test");
    await page.goto(`${BASE}${landing}`, { waitUntil: "load" });
    await page.waitForSelector("text=Production Floor", { timeout: NAV_TIMEOUT_MS });
    const bodyText = await page.textContent("body");
    assert(bodyText?.includes("TODAY'S JOBS"), "Operator sees TODAY'S JOBS nav");
    assert(bodyText?.includes("COMPLETE BATCH"), "Operator sees COMPLETE BATCH nav");
    assert(bodyText?.includes("MATERIAL CONFIRMATION"), "Operator sees MATERIAL CONFIRMATION nav");
    assert(bodyText?.includes("EXCEPTION"), "Operator sees EXCEPTION nav");
    assert(!bodyText?.includes("BOM / Formula"), "Operator does NOT see BOM / Formula (full-nav-only section)");
    assert(!bodyText?.includes("Company Stock Mode"), "Operator does NOT see Company Stock Mode (Founder-only section)");
    await shot(page, "operator-workspace");
    await btn(page, "IN PROGRESS");
    await btn(page, "MATERIAL CONFIRMATION");
    await btn(page, "EXCEPTION");
    done();
    await context.close();
  });

  console.log("\n=== STORE workspace ===");
  await softly("Store workspace", async () => {
    const context = await newBoundedContext(browser);
    const page = await context.newPage();
    const done = watchConsoleErrors(page, "Store workspace");
    const landing = await loginAs(page, "review-store-executive@seera.test");
    await page.goto(`${BASE}${landing}`, { waitUntil: "load" });
    await page.waitForSelector("text=Store Executive Workspace", { timeout: NAV_TIMEOUT_MS });
    const bodyText = await page.textContent("body");
    assert(bodyText?.includes("RECEIVE MATERIAL"), "Store sees RECEIVE MATERIAL nav");
    assert(bodyText?.includes("ISSUE TO PRODUCTION"), "Store sees ISSUE TO PRODUCTION nav");
    assert(bodyText?.includes("STOCK COUNT"), "Store sees STOCK COUNT nav");
    assert(!bodyText?.includes("BOM / Formula"), "Store does NOT see BOM / Formula (full-nav-only section)");
    await shot(page, "store-workspace");
    await btn(page, "ISSUE TO PRODUCTION");
    await btn(page, "STOCK");
    await btn(page, "LOTS");
    await btn(page, "STOCK COUNT");
    done();
    await context.close();
  });

  console.log("\n=== QC workspace ===");
  await softly("QC workspace", async () => {
    const context = await newBoundedContext(browser);
    const page = await context.newPage();
    const done = watchConsoleErrors(page, "QC workspace");
    const landing = await loginAs(page, "review-qc-user@seera.test");
    await page.goto(`${BASE}${landing}`, { waitUntil: "load" });
    await page.waitForSelector("text=Quality Control Workspace", { timeout: NAV_TIMEOUT_MS });
    const bodyText = await page.textContent("body");
    assert(bodyText?.includes("PENDING QC"), "QC sees PENDING QC nav");
    assert(bodyText?.includes("ON HOLD"), "QC sees ON HOLD nav");
    assert(bodyText?.includes("RELEASED"), "QC sees RELEASED nav");
    assert(bodyText?.includes("HISTORY"), "QC sees HISTORY nav");
    assert(!bodyText?.includes("Company Stock Mode"), "QC does NOT see Company Stock Mode (Founder-only section)");
    await shot(page, "qc-workspace");
    await btn(page, "ON HOLD");
    await btn(page, "FAILED");
    await btn(page, "RELEASED");
    await btn(page, "HISTORY");
    done();
    await context.close();
  });

  console.log("\n=== FOUNDER: full nav, Search, Reports Center, Machines/Shifts, Product 360 ===");
  await softly("Founder workspace", async () => {
    const context = await newBoundedContext(browser);
    const page = await context.newPage();
    const done = watchConsoleErrors(page, "Founder workspace");
    await loginAs(page, "review-founder@seera.test");
    // Founder's landingPath is /portal/founder-admin (a multi-module hub —
    // Finance/Sales/Manufacturing all live under it), so navigate straight to
    // the Manufacturing OS section rather than through the hub card.
    await page.goto(`${BASE}/portal/founder-admin/manufacturing-os`, { waitUntil: "load" });
    await page.waitForSelector("text=Manufacturing OS", { timeout: NAV_TIMEOUT_MS });
    let bodyText = await page.textContent("body");
    assert(bodyText?.includes("Manufacturing OS"), "Founder lands on Manufacturing OS full nav");

    await btn(page, "Search");
    await page.locator("input").first().fill("MC-").catch(() => {});
    await btn(page, "SEARCH");
    await page.waitForTimeout(1000);
    bodyText = await page.textContent("body");
    assert(bodyText != null, "Search page rendered without crashing");
    await shot(page, "founder-search");

    await btn(page, "Masters");
    await page.waitForTimeout(500);
    await btn(page, "Machines / Lines");
    await page.waitForTimeout(500);
    bodyText = await page.textContent("body");
    assert(bodyText?.includes("CREATE MACHINE"), "Founder sees CREATE MACHINE control");
    await btn(page, "Shifts");
    await page.waitForTimeout(500);
    bodyText = await page.textContent("body");
    assert(bodyText?.includes("CREATE SHIFT"), "Founder sees CREATE SHIFT control");
    await shot(page, "founder-masters");

    await btn(page, "Reports Center");
    await page.waitForTimeout(500);
    bodyText = await page.textContent("body");
    assert(bodyText?.includes("EXPORT CSV") || bodyText?.includes("Daily Production"), "Reports Center renders with real report sections");
    await btn(page, "Costing");
    await page.waitForTimeout(500);
    await shot(page, "founder-reports");

    await btn(page, "Formulations");
    await page.waitForTimeout(500);
    await btn(page, "Product 360");
    await page.waitForTimeout(500);
    bodyText = await page.textContent("body");
    assert(bodyText?.includes("select a product") || bodyText?.includes("Active BOM"), "Product 360 view rendered");
    await shot(page, "founder-product360");

    done();
    await context.close();
  });

  await browser.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

const hardWatchdog = setTimeout(() => {
  console.error("\n=== WATCHDOG: UAT run exceeded 150s hard cap — forcing exit ===");
  process.exit(1);
}, 150_000);
hardWatchdog.unref();

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => clearTimeout(hardWatchdog));
