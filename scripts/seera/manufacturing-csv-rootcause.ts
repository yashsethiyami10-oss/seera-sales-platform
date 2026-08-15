import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext();
  context.setDefaultTimeout(45_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();

  page.on("console", (m) => console.log(`CONSOLE[${m.type()}]:`, m.text()));
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message, e.stack?.slice(0, 300)));
  page.on("requestfailed", (r) => console.log("REQUEST FAILED:", r.url(), r.failure()?.errorText));
  page.on("response", async (res) => {
    if (res.url().includes("/api/manufacturing/reports?")) {
      const url = new URL(res.url());
      const report = url.searchParams.get("report");
      let bodyPreview = "";
      try {
        const text = await res.text();
        bodyPreview = text.slice(0, 300);
      } catch { /* ignore */ }
      console.log(`RESPONSE [${res.status()}] report=${report} :: ${bodyPreview}`);
    }
  });

  await page.request.post(`${BASE}/api/auth/login`, { data: { email: "review-founder@seera.test", password: PASSWORD } });
  await page.goto(`${BASE}/portal/founder-admin/manufacturing-os`, { waitUntil: "load" });
  await page.waitForSelector("text=Manufacturing OS", { timeout: 60_000 });

  console.log("\n--- Clicking Reports Center directly from Overview (no intermediate group) ---");
  await page.getByRole("button", { name: "Reports Center", exact: true }).click();
  await page.waitForTimeout(3000);

  const bodyText = await page.textContent("body");
  console.log("\nBody includes 'Daily Production':", bodyText?.includes("Daily Production"));
  console.log("Body includes 'No records for this filter':", bodyText?.includes("No records for this filter"));
  console.log("Body includes 'Loading':", bodyText?.includes("Loading…"));

  const csvButtons = page.getByRole("button", { name: "EXPORT CSV" });
  const count = await csvButtons.count();
  console.log(`\nEXPORT CSV button count: ${count}`);
  for (let i = 0; i < count; i++) {
    console.log(`  button[${i}] enabled:`, await csvButtons.nth(i).isEnabled());
  }

  // Print the actual table row count for the first report table.
  const firstTable = page.locator(`table`).first();
  const rowCount = await firstTable.locator("tbody tr").count();
  console.log("\nFirst table tbody row count:", rowCount);
  const firstRowText = rowCount > 0 ? await firstTable.locator("tbody tr").first().textContent() : null;
  console.log("First row text:", firstRowText);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
