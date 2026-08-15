import { chromium } from "playwright";

// TEST-only browser UAT for the Sales Manager "My Daily Working" end-day
// workflow: login -> open My Daily Working -> start day if needed -> GPS
// captured -> choose outcome -> enter remarks -> Confirm & end day -> success
// UI, closed work day reflected, zero console errors, zero failed 5xx.

const BASE = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string) {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({ geolocation: { latitude: 28.6139, longitude: 77.2090, accuracy: 10 }, permissions: ["geolocation"] });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  const failed5xx: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`); });

  await page.request.post(`${BASE}/api/auth/login`, { data: { email: "review-sales-manager-2@seera.test", password: PASSWORD } });
  await page.goto(`${BASE}/portal/sales-manager/my-day`, { waitUntil: "load" });
  await page.waitForSelector("text=DAILY WORKING", { timeout: 60_000 });

  console.log("\n=== 1. Page loaded ===");
  assert(await page.locator("text=DAILY WORKING").first().isVisible(), "My Daily Working page rendered");

  const hasActiveDay = await page.locator("text=Active work day").isVisible().catch(() => false);
  if (!hasActiveDay) {
    console.log("\n=== 2. No active day — starting one ===");
    await page.locator('select[name="workingType"]').selectOption("RETAILING");
    await page.locator('button:has-text("Start")').first().click();
    await page.waitForSelector("text=Active work day", { timeout: 15_000 });
    assert(true, "Start day succeeded, active work day now shown");
  } else {
    console.log("\n=== 2. Active day already present ===");
    assert(true, "Active work day present (reusing existing session)");
  }

  console.log("\n=== 3. Proceed to end day ===");
  await page.locator('button:has-text("Proceed to end day")').click();
  await page.waitForSelector('select[name="outcome"]', { timeout: 10_000 });
  assert(await page.locator('select[name="outcome"]').isVisible(), "End-day form rendered (outcome/remarks fields visible)");

  console.log("\n=== 4. GPS captured (mocked geolocation), outcome selected, remarks entered ===");
  await page.locator('select[name="outcome"]').selectOption("COMPLETED");
  await page.locator('input[name="remarks"]').fill("Browser UAT: end of day, all visits complete.");
  assert(true, "Outcome=COMPLETED selected, remarks entered");

  console.log("\n=== 5. Click Confirm & end day ===");
  await page.locator('button:has-text("Confirm & end day")').click();
  await page.waitForTimeout(2_000);

  const bodyText = await page.textContent("body");
  const hasInternalError = bodyText?.includes("An internal error occurred") ?? false;
  const hasSuccess = bodyText?.includes("Day ended") || bodyText?.includes("दिन समाप्त हुआ") || (await page.locator("text=Start today").isVisible().catch(() => false));

  console.log("\n=== 6. Success UI / closed work day reflected ===");
  assert(!hasInternalError, `No \"An internal error occurred\" message shown (production symptom did not reproduce in TEST)`);
  assert(hasSuccess, "Success indication shown (\"Day ended\" message or page reverted to \"Start today's work\")");

  console.log("\n=== 7. Zero console errors, zero failed 5xx requests ===");
  assert(consoleErrors.length === 0, `Zero console errors (found: ${consoleErrors.length}) ${consoleErrors.slice(0, 3).join(" | ")}`);
  assert(failed5xx.length === 0, `Zero failed 5xx requests (found: ${failed5xx.length}) ${failed5xx.slice(0, 3).join(" | ")}`);

  await browser.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

const watchdog = setTimeout(() => { console.error("WATCHDOG: exceeded 100s — forcing exit"); process.exit(1); }, 100_000);
watchdog.unref();
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
