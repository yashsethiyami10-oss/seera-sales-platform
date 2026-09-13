import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// MASTER UX mission Wave 1 — real authenticated browser check of Founder Home + Money Desk against
// the local dev server (points at TEST DB per .env.local, never production). Same pattern as
// playwright-mobile-audit.ts (login flow, viewport emulation).
//
// Resilience notes (found the hard way this run): (1) dev-mode first-render of a data-heavy
// dashboard can legitimately take 30-40s+ against a busy shared TEST DB — `networkidle` is too
// strict here (some widget's background poll can keep the network "active" indefinitely), so this
// uses `domcontentloaded` + a generous explicit timeout instead. (2) every step is independently
// try/caught so one slow/failing page doesn't abort the whole run. (3) the browser is ALWAYS closed
// in a finally block — an earlier version of this script threw mid-run without closing Playwright's
// browser process, which kept the Node process alive on open handles even after its own logic had
// already failed out (looked like a "hang", was actually a missing cleanup).

const BASE_URL = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "..", ".tmp-wave1-screenshots");
mkdirSync(OUT_DIR, { recursive: true });
const NAV_TIMEOUT = 60000;

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`); if (ok) pass++; else fail++; }

async function goto(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(1500); // let client components hydrate/finish their own fetches
    return true;
  } catch (e) {
    console.log(`  [nav error] ${url}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    return false;
  }
}

async function login(page: Page): Promise<boolean> {
  const ok = await goto(page, `${BASE_URL}/login`);
  if (!ok) return false;
  await page.fill('input[name="email"]', "review-founder@seera.test");
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith("/portal"), { timeout: NAV_TIMEOUT }).catch(() => null);
  await page.waitForTimeout(1500);
  return page.url().includes("/portal");
}

async function main() {
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    console.log("=== Desktop (1440x900) ===");
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktopCtx.newPage();
    desktopPage.setDefaultTimeout(NAV_TIMEOUT);
    desktopPage.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`[desktop] ${msg.text()}`); });
    desktopPage.on("pageerror", (err) => consoleErrors.push(`[desktop pageerror] ${err.message}`));

    const loggedIn = await login(desktopPage);
    check("Founder login succeeds", loggedIn, desktopPage.url());

    if (await goto(desktopPage, `${BASE_URL}/portal/founder-admin`)) {
      await desktopPage.screenshot({ path: path.join(OUT_DIR, "founder-home-desktop.png"), fullPage: true }).catch(() => null);
      check("Founder Home renders the new 'What's happening today' section", (await desktopPage.locator("text=What's happening today").count()) > 0);
      check("CASH & BANK KPI card renders", (await desktopPage.locator("text=CASH & BANK").count()) > 0);
      check("+MONEY IN primary action renders", (await desktopPage.locator('a:has-text("MONEY IN")').count()) > 0);
    } else {
      check("Founder Home loaded", false, "navigation failed — see [nav error] above");
    }

    console.log("\n=== Deep-link: Founder Home '+MONEY IN' actually opens Money In flow ===");
    if (await goto(desktopPage, `${BASE_URL}/portal/founder-admin/money-desk?open=in`)) {
      await desktopPage.screenshot({ path: path.join(OUT_DIR, "money-desk-open-in.png"), fullPage: true }).catch(() => null);
      check("?open=in deep-link actually opens the Guided Money In flow (not just the section)", (await desktopPage.locator("text=What kind of Money In was this?").count()) > 0);
    } else {
      check("?open=in deep-link opens the Guided Money In flow", false, "navigation failed");
    }

    console.log("\n=== Deep-link: Founder Home '+CREATE INVOICE' actually opens the wizard ===");
    if (await goto(desktopPage, `${BASE_URL}/portal/founder-admin/finance-os?open=invoice`)) {
      await desktopPage.screenshot({ path: path.join(OUT_DIR, "finance-os-open-invoice.png"), fullPage: true }).catch(() => null);
      check("?open=invoice deep-link opens the Create Invoice wizard", (await desktopPage.locator("text=PARTY").count()) > 0);
    } else {
      check("?open=invoice deep-link opens the Create Invoice wizard", false, "navigation failed");
    }

    console.log("\n=== Money Desk — Needs Attention tab (no generic toolbar, friendly framing) ===");
    if (await goto(desktopPage, `${BASE_URL}/portal/founder-admin/money-desk`)) {
      check("Money Desk page has NO generic Search/Apply-filter toolbar (fixed dead-toolbar bug)", (await desktopPage.locator('button:has-text("Apply filter"), button:has-text("Apply filters")').count()) === 0);
    } else {
      check("Money Desk page loaded (toolbar check)", false, "navigation failed");
    }

    console.log("\n=== Mobile (390x844) — no horizontal overflow ===");
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileCtx.newPage();
    mobilePage.setDefaultTimeout(NAV_TIMEOUT);
    mobilePage.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`[mobile] ${msg.text()}`); });
    await login(mobilePage);
    if (await goto(mobilePage, `${BASE_URL}/portal/founder-admin`)) {
      await mobilePage.screenshot({ path: path.join(OUT_DIR, "founder-home-mobile-390.png"), fullPage: true }).catch(() => null);
      check("no horizontal overflow at 390px on Founder Home", !(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)));
    } else {
      check("Founder Home mobile overflow check", false, "navigation failed");
    }

    if (await goto(mobilePage, `${BASE_URL}/portal/founder-admin/money-desk`)) {
      await mobilePage.screenshot({ path: path.join(OUT_DIR, "money-desk-mobile-390.png"), fullPage: true }).catch(() => null);
      check("no horizontal overflow at 390px on Money Desk", !(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)));
    } else {
      check("Money Desk mobile overflow check", false, "navigation failed");
    }

    console.log("\n=== Approval Center — Finance/Expense tab renders (self-approval fix sanity) ===");
    if (await goto(desktopPage, `${BASE_URL}/portal/founder-admin/finance-os?group=approvals`)) {
      await desktopPage.screenshot({ path: path.join(OUT_DIR, "approvals.png"), fullPage: true }).catch(() => null);
      check("no leaked 'You cannot decide your own request' text on the approvals screen", (await desktopPage.locator("text=You cannot decide your own request").count()) === 0);
    } else {
      check("Approvals screen loaded", false, "navigation failed");
    }

    console.log(`\n=== Console errors captured across all pages: ${consoleErrors.length} ===`);
    for (const e of consoleErrors.slice(0, 20)) console.log(`  ${e}`);

    console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
    console.log(`Screenshots saved to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
