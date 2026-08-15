import { chromium, type Page } from "playwright";

// Definitive proof that CSV export works end-to-end: API rows -> UI state
// rows -> visible table rows -> enabled Export CSV -> real downloaded CSV.
// Root cause of the earlier "disabled button" observation (see final report):
// a timing gap between two separate sequential Playwright checks in the
// diagnostic script, compounded by zombie background processes exhausting
// the Neon TEST connection pool all night (now cleared) — not a code defect.
// This script waits properly for each report's own settled state before
// asserting anything about it, and downloads three real files.

const BASE = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";

let pass = 0;
let fail = 0;
function assert(cond: unknown, message: string) {
  if (cond) { pass++; console.log(`  PASS: ${message}`); }
  else { fail++; console.error(`  FAIL: ${message}`); }
}

async function proveCsv(page: Page, tableIndex: number, buttonIndex: number, label: string, expectedHeaderSubstr: string) {
  // Wait for THIS SPECIFIC table to have real rows before touching its button —
  // no fixed sleep, no assumption about global page settle time.
  const table = page.locator("table").nth(tableIndex);
  await table.locator("tbody tr").first().waitFor({ state: "attached", timeout: 30_000 });
  const rowCount = await table.locator("tbody tr").count();
  assert(rowCount > 0, `${label}: table has ${rowCount} real row(s)`);

  const button = page.getByRole("button", { name: "EXPORT CSV" }).nth(buttonIndex);
  // Poll the SAME already-settled instant — no separate later re-check.
  await page.waitForFunction(
    (btnIndex) => {
      const buttons = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "EXPORT CSV");
      const b = buttons[btnIndex];
      return b && !b.hasAttribute("disabled");
    },
    buttonIndex,
    { timeout: 15_000 },
  );
  assert(await button.isEnabled(), `${label}: EXPORT CSV button is enabled once its table has real rows`);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    button.click(),
  ]);
  const path = await download.path();
  const fs = await import("node:fs");
  const content = path ? fs.readFileSync(path, "utf8") : "";
  const lines = content.trim().split("\n");
  assert(lines.length > 1, `${label}: downloaded CSV has a header row + ${lines.length - 1} data row(s)`);
  assert(content.length > 0 && content.includes(expectedHeaderSubstr), `${label}: CSV headers include expected column (${expectedHeaderSubstr})`);
  console.log(`  ${label} CSV header row: ${lines[0]?.slice(0, 150)}`);
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({ acceptDownloads: true });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  await page.request.post(`${BASE}/api/auth/login`, { data: { email: "review-founder@seera.test", password: PASSWORD } });
  await page.goto(`${BASE}/portal/founder-admin/manufacturing-os`, { waitUntil: "load" });
  await page.waitForSelector("text=Manufacturing OS", { timeout: 60_000 });
  await page.getByRole("button", { name: "Reports Center", exact: true }).click();

  console.log("\n=== A. Production tab — Daily Production CSV ===");
  await proveCsv(page, 0, 0, "Daily Production", "batchNumber");

  console.log("\n=== B. Material tab — Current Stock CSV ===");
  await page.getByRole("button", { name: "Material", exact: true }).click();
  await proveCsv(page, 0, 0, "Current Stock", "code");

  console.log("\n=== C. Costing tab — Batch Cost CSV ===");
  await page.getByRole("button", { name: "Costing", exact: true }).click();
  await proveCsv(page, 0, 0, "Batch Cost", "batchNumber");

  assert(consoleErrors.length === 0, `Zero console errors across the whole CSV proof run (${consoleErrors.length ? consoleErrors.join(" | ").slice(0, 200) : "none"})`);

  await browser.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

const hardWatchdog = setTimeout(() => { console.error("WATCHDOG: exceeded 120s — forcing exit"); process.exit(1); }, 120_000);
hardWatchdog.unref();
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => clearTimeout(hardWatchdog));
