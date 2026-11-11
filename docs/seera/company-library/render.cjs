// Renders the HTML built by build_company_library.py to A4 PDFs (Chromium via Playwright) and fails
// if any page's content runs into its footer.
// Usage: node docs/seera/company-library/render.cjs <html-dir> <pdf-out-dir>
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) throw new Error("usage: render.cjs <html-dir> <pdf-out-dir>");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = false;
  for (const file of fs.readdirSync(src).filter((f) => f.endsWith(".html")).sort()) {
    await page.goto("file://" + path.resolve(src, file));
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll(".page")].map((p) =>
        Math.round(p.querySelector(".content").getBoundingClientRect().bottom - p.querySelector("footer").getBoundingClientRect().top)));
    const bad = overflow.map((v, i) => (v > 0 ? `page ${i + 1} +${v}px` : null)).filter(Boolean);
    if (bad.length) failed = true;
    console.log(`${file}: ${overflow.length} page(s)${bad.length ? "  OVERFLOW " + bad.join(", ") : ""}`);
    await page.pdf({ path: path.join(out, file.replace(/\.html$/, ".pdf")), format: "A4", printBackground: true, preferCSSPageSize: true });
  }
  await browser.close();
  if (failed) process.exit(1);
})();
