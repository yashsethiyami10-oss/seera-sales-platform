import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const [,, html, pdf, pngPrefix] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
await page.goto("file://" + html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: pdf, width: "210mm", height: "297mm", printBackground: true, preferCSSPageSize: true });
if (pngPrefix) {
  const n = await page.locator("section.page").count();
  for (let i = 0; i < n; i++) await page.locator("section.page").nth(i).screenshot({ path: `${pngPrefix}-${String(i + 1).padStart(2, "0")}.png` });
}
await browser.close();
