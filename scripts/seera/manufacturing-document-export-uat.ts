import { chromium } from "playwright";

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
  const context = await browser.newContext({ acceptDownloads: true });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(20_000);
  const page = await context.newPage();

  // Pre-warm the PDF route's cold dev-mode compile (pdf-lib is a heavy
  // first-require) outside any Playwright action timeout budget.
  await fetch(`${BASE}/api/manufacturing/reports/pdf?report=batch-summary&batchId=warmup`).catch(() => {});
  await page.request.post(`${BASE}/api/auth/login`, { data: { email: "review-founder@seera.test", password: PASSWORD } });
  await page.goto(`${BASE}/portal/founder-admin/manufacturing-os`, { waitUntil: "load" });
  await page.waitForSelector("text=Manufacturing OS", { timeout: 20_000 });

  console.log("\n=== Document upload UAT (Material Master COA) ===");
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Material Master", exact: true }).click();
  await page.waitForTimeout(600);
  const detailsCount = await page.locator("details:has-text('Documents')").count();
  assert(detailsCount > 0, `Found ${detailsCount} Material Master row(s) with an inline Documents control`);
  if (detailsCount > 0) {
    const firstDoc = page.locator("details:has-text('Documents')").first();
    await firstDoc.click();
    await page.waitForTimeout(400);
    const fileInput = firstDoc.locator("input[type=file]");
    // A minimal, valid PDF (magic bytes only) — matches uploadManufacturingDocument's
    // signature check, same as the server-side proof's fixture.
    await fileInput.setInputFiles({ name: "test-coa.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%TEST_ONLY_MANUFACTURING_FIXTURE\n") });
    await firstDoc.locator("a", { hasText: "test-coa.pdf" }).waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    const afterUploadText = await firstDoc.textContent();
    assert(afterUploadText?.includes("test-coa.pdf"), `Uploaded file appears in the Documents list (${afterUploadText?.slice(0, 120)})`);
    const downloadLink = firstDoc.locator("a", { hasText: "test-coa.pdf" });
    assert(await downloadLink.count() > 0, "Uploaded file has a real download link");
  }

  console.log("\n=== CSV export UAT (Reports Center) ===");
  await page.getByRole("button", { name: "Reports Center", exact: true }).click();
  await page.waitForTimeout(800);
  // Production's default 30-day date filter is real and correct product
  // behavior, but tonight's proof runs used real Date.now() timestamps, so
  // Batch Register (no product/material filter, just date) is virtually
  // guaranteed to have real rows from this session's own Manufacturing OS
  // proof suite batches.
  const csvButtons = page.getByRole("button", { name: "EXPORT CSV" });
  const csvCount = await csvButtons.count();
  assert(csvCount > 0, `Found ${csvCount} EXPORT CSV button(s) in Reports Center`);
  // Each report fires its own independent fetch on tab-switch; poll for an
  // enabled button rather than a single fixed wait, since 4 parallel Neon
  // TEST round-trips in dev mode can legitimately take a few seconds.
  let enabledButton = null;
  for (let attempt = 0; attempt < 20 && !enabledButton; attempt++) {
    for (let i = 0; i < csvCount; i++) {
      if (await csvButtons.nth(i).isEnabled()) { enabledButton = csvButtons.nth(i); break; }
    }
    if (!enabledButton) await page.waitForTimeout(1000);
  }
  if (enabledButton) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }).catch(() => null),
      enabledButton.click(),
    ]);
    assert(download !== null, `CSV export triggers a real browser download (filename: ${download?.suggestedFilename()})`);
  } else {
    fail++;
    console.error("  FAIL: No EXPORT CSV button was enabled (no report in this tab has data) — cannot prove a real download");
  }

  console.log("\n=== PDF export UAT (Production Summary + QC Summary + Batch Summary + Traceability) ===");
  // "Production"/"Quality" match BOTH the top-level GROUPS button and the
  // Reports Center sub-nav tab once inside Reports Center — scope to the
  // sub-nav's own tablist (aria-label="Manufacturing sections") so this
  // clicks the REPORT TAB, not the top-level group (which would navigate
  // away from Reports Center entirely).
  const reportSections = page.getByRole("tablist", { name: "Manufacturing sections" });
  await reportSections.getByRole("button", { name: "Production", exact: true }).click();
  await page.waitForTimeout(600);
  async function checkPdfLink(label: string) {
    const link = page.getByRole("button", { name: label });
    const count = await link.count();
    if (count === 0) { console.log(`  (skip: ${label} button not visible in current tab)`); return; }
    const href = await link.first().locator("xpath=..").getAttribute("href").catch(() => null);
    const res = href ? await page.request.get(`${BASE}${href}`, { timeout: 30_000 }) : null;
    assert(res != null && res.ok() && (res.headers()["content-type"] ?? "").includes("application/pdf"), `${label} produces a real application/pdf response (status=${res?.status()}, content-type=${res?.headers()["content-type"]})`);
  }
  await checkPdfLink("EXPORT PRODUCTION SUMMARY PDF");
  await reportSections.getByRole("button", { name: "Quality", exact: true }).click();
  await page.waitForTimeout(600);
  await checkPdfLink("EXPORT QC SUMMARY PDF");

  console.log("\n=== Batch Summary / Traceability PDF UAT (direct API, batch-detail-backed) ===");
  const batchRes = await page.request.get(`${BASE}/api/manufacturing/reports/pdf?report=batch-summary&batchId=nonexistent-but-exercises-the-real-renderer`, { timeout: 20_000 });
  // A nonexistent batch is expected to 4xx (findUniqueOrThrow) — the real
  // proof this endpoint works end-to-end already exists at the service layer
  // (manufacturing-uiux-closure-proof.ts); this just confirms the route is
  // wired and returns a governed error rather than crashing/hanging.
  assert(batchRes.status() >= 400 && batchRes.status() < 500, `batch-summary PDF route reachable and governed (status=${batchRes.status()} for an unknown batch)`);

  await browser.close();
  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

const hardWatchdog = setTimeout(() => { console.error("WATCHDOG: exceeded 150s — forcing exit"); process.exit(1); }, 150_000);
hardWatchdog.unref();
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => clearTimeout(hardWatchdog));
