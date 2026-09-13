import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Post-Audit Gap Closure, Phase 1 — REAL authenticated browser testing, not static CSS inspection.
// Targets the LOCAL dev server (localhost:3000), which .env.local already points at the TEST
// database (confirmed at server startup: "[SEERA] test database identity accepted", the same TEST
// DB fingerprint used throughout this session) — never production. Uses the existing, already-
// provisioned review-*@seera.test fixture accounts (password from seed-integrated-review.ts).
//
// This is real Chromium (Playwright, installed this session), real page loads, real login flow,
// real viewport emulation, real DOM measurement (scrollWidth vs clientWidth for horizontal
// overflow) — not a guess from CSS source. It is NOT a physical device: no real touch input, no
// real mobile Safari/Chrome quirks, no real network conditions. That distinction is preserved
// throughout the output and the final report.

const BASE_URL = "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "..", ".tmp-mobile-audit-screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 720 },
  { name: "375", width: 375, height: 667 },
  { name: "390", width: 390, height: 844 },
  { name: "414", width: 414, height: 896 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

const ROLES: { slug: string; email: string; label: string }[] = [
  { slug: "founder", email: "review-founder@seera.test", label: "Founder" },
  { slug: "accounts-manager", email: "review-accounts-manager@seera.test", label: "Accounts/Finance" },
  { slug: "sales-manager-1", email: "review-sales-manager-1@seera.test", label: "Sales Manager" },
  { slug: "sales-executive-1", email: "review-sales-executive-1@seera.test", label: "Sales Executive" },
  { slug: "mfg-manager", email: "review-mfg-manager@seera.test", label: "Manufacturing" },
];

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`); if (ok) pass++; else fail++; }

async function login(page: Page, email: string): Promise<boolean> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Founder/Accounts dashboards aggregate real, heavier data (financeWorkspaceData spans the whole
  // business) — a fixed short wait after click raced the redirect for those two specifically in an
  // earlier run of this script (confirmed separately: the login itself succeeded, 200, correct
  // landing path, just slower than the wait). Wait on the actual navigation event instead of a guess.
  await page.waitForURL((url) => url.pathname.startsWith("/portal"), { timeout: 20000 }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null);
  return page.url().includes("/portal");
}

async function measureOverflow(page: Page): Promise<{ overflowX: boolean; scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

async function main() {
  console.log(`Playwright mobile audit against ${BASE_URL} (LOCAL dev server, TEST DB) — ${ROLES.length} roles x ${VIEWPORTS.length} viewports\n`);
  const browser: Browser = await chromium.launch({ headless: true });

  for (const role of ROLES) {
    console.log(`\n=== ${role.label} (${role.email}) ===`);
    const context = await browser.newContext({ viewport: VIEWPORTS[VIEWPORTS.length - 1] });
    const page = await context.newPage();
    const loggedIn = await login(page, role.email);
    check(`${role.label}: login succeeds and lands on a /portal route`, loggedIn, page.url());
    if (!loggedIn) { await context.close(); continue; }
    const landingUrl = page.url();

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(landingUrl, { waitUntil: "networkidle" }).catch(() => null);
      await page.waitForTimeout(400);
      const { overflowX, scrollWidth, clientWidth } = await measureOverflow(page);
      check(`${role.label} @ ${vp.name}px: no horizontal overflow on landing page`, !overflowX, `scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
      const shotPath = path.join(OUT_DIR, `${role.slug}-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => null);

      // Real DOM checks the mission asked for, beyond a bare overflow measurement.
      const bodyText = await page.textContent("body").catch(() => "");
      check(`${role.label} @ ${vp.name}px: page rendered real content (not a blank/error shell)`, Boolean(bodyText && bodyText.trim().length > 200));

      // Touch-target sanity: any visible, clickable primary control smaller than ~32px in either
      // dimension is a real usability finding, not a guess — measured directly from computed
      // layout boxes, not from CSS source.
      const tinyTargets = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("button, a[href]")) as HTMLElement[];
        let tiny = 0;
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)) tiny++;
        }
        return { total: candidates.length, tiny };
      });
      if (tinyTargets.total > 0) {
        console.log(`    info: ${tinyTargets.tiny}/${tinyTargets.total} visible buttons/links under 32px in a dimension at ${vp.name}px`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);
  console.log(`Screenshots written to: ${OUT_DIR}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e); process.exit(1); });
