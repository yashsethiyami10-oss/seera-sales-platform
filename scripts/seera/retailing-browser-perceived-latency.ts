import { chromium, type Page, type Request, type Response } from "playwright";

// SEERA RETAILING OS — PERFORMANCE PHASE 4: browser-native perceived-latency harness.
// Phase 3's decomposition (feedback / server-duration / post-server-ui / total) is preserved, but
// "feedback" and "post-server-ui" are now measured INSIDE the browser via MutationObserver +
// requestAnimationFrame — not via Playwright's own click-actionability-wait + DOM polling, which
// carries its own IPC/polling overhead that Phase 3 could not cleanly separate from real app
// latency. A PerformanceObserver for `longtask` entries also runs continuously so a slow
// post-success transition can be attributed to a real main-thread block (React render, background
// router.refresh contention) rather than guessed at.
// TEST-only, against a TEST-DB server (dev or local production build — set via BASE/BUILD env).
// "Do not endlessly retry environmental hangs": every wait here is bounded.

const BASE = process.env.HARNESS_BASE ?? "http://localhost:3000";
const PASSWORD = "SeeraReview!2026";
const NETWORK = process.env.NETWORK ?? "desktop";
const LOGIN_EMAIL = process.env.HARNESS_EMAIL ?? "review-sales-executive-2@seera.test";

type Sample = { label: string; ms: number };
const samples: Sample[] = [];
function record(label: string, ms: number) {
  samples.push({ label, ms });
  console.log(`  [${label}] ${Math.round(ms)}ms`);
}
function stats(label: string) {
  const vals = samples.filter((s) => s.label === label).map((s) => s.ms).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const p50 = vals[Math.floor(vals.length * 0.5)]!;
  const p95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))]!;
  return { n: vals.length, p50: Math.round(p50), p95: Math.round(p95), max: Math.round(vals[vals.length - 1]!) };
}

// Installed once per page via addInitScript so it survives every client-side navigation/refresh
// this journey does. `armProbe` is called (via page.evaluate) immediately before each tap with a
// plain predicate function's SOURCE TEXT (must be self-contained — no closures over Node scope).
const BROWSER_INSTRUMENTATION = `
  window.__phase4 = { tapAt: null, mutationAt: null, paintAt: null, observer: null };
  window.__armProbe = function (predicateSrc) {
    const predicate = new Function("return (" + predicateSrc + ")")();
    window.__phase4 = { tapAt: performance.now(), mutationAt: null, paintAt: null, observer: null };
    const state = window.__phase4;
    const check = () => {
      if (state.mutationAt !== null) return;
      if (predicate()) {
        state.mutationAt = performance.now();
        requestAnimationFrame(() => { state.paintAt = performance.now(); });
        if (state.observer) state.observer.disconnect();
      }
    };
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    state.observer = obs;
    check(); // covers the (rare) case where the state is already true before the observer attaches
  };
  window.__longTasks = [];
  try {
    const lt = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
    });
    lt.observe({ entryTypes: ["longtask"] });
  } catch (e) { /* longtask not supported in this browser build — non-fatal */ }
`;

async function readProbe(page: Page): Promise<{ tapAt: number | null; mutationAt: number | null; paintAt: number | null }> {
  return page.evaluate(() => (window as any).__phase4);
}

async function waitForProbe(page: Page, timeoutMs: number): Promise<{ mutationAt: number | null; paintAt: number | null }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = await readProbe(page);
    if (p.paintAt !== null) return { mutationAt: p.mutationAt, paintAt: p.paintAt };
    await new Promise((r) => setTimeout(r, 20));
  }
  const p = await readProbe(page);
  return { mutationAt: p.mutationAt, paintAt: p.paintAt };
}

async function longTaskSummary(page: Page): Promise<{ count: number; totalMs: number; longest: number }> {
  const tasks: Array<{ start: number; duration: number }> = await page.evaluate(() => (window as any).__longTasks ?? []);
  return { count: tasks.length, totalMs: Math.round(tasks.reduce((s, t) => s + t.duration, 0)), longest: tasks.reduce((m, t) => Math.max(m, t.duration), 0) };
}
async function clearLongTasks(page: Page) {
  await page.evaluate(() => { (window as any).__longTasks = []; });
}

// Full decomposition for one governed mutation:
//   A = tap -> native DOM mutation showing busy/feedback state, and the next-paint after it
//   B = fetch request sent -> response received (network+server duration)
//   C = response received -> next-usable-UI native paint
//   D = tap -> next-usable-UI native paint (total)
async function measureMutation(
  page: Page,
  opts: { tapSelector: string; feedbackPredicateSrc: string; nextStatePredicateSrc: string; label: string },
) {
  let requestSentAt: number | null = null;
  let responseAt: number | null = null;
  const onReq = (req: Request) => { if (req.url().includes("/api/field/operations") && req.method() === "POST" && requestSentAt === null) requestSentAt = performance.now(); };
  const onRes = (res: Response) => { if (res.url().includes("/api/field/operations") && requestSentAt !== null && responseAt === null) responseAt = performance.now(); };
  page.on("request", onReq);
  page.on("response", onRes);
  await clearLongTasks(page);

  try {
    // Arm the FEEDBACK probe, then tap. Node-side click dispatch has its own small IPC latency to
    // the browser, unavoidable with any external driver — the probe itself times purely in-browser
    // from the moment it's armed (effectively at tap time) to the DOM mutation/paint.
    await page.evaluate((src) => (window as any).__armProbe(src), opts.feedbackPredicateSrc);
    const originalTapAt = (await readProbe(page)).tapAt!;
    await page.locator(opts.tapSelector).first().click({ noWaitAfter: true });
    const feedback = await waitForProbe(page, 15_000);
    if (feedback.paintAt !== null) {
      record(`${opts.label}-feedback-dom`, feedback.mutationAt! - originalTapAt);
      record(`${opts.label}-feedback-paint`, feedback.paintAt - originalTapAt);
    } else {
      console.error(`${opts.label}: feedback predicate never matched within 15s`);
    }

    const waitStart = Date.now();
    while (responseAt === null && Date.now() - waitStart < 90_000) await new Promise((r) => setTimeout(r, 20));
    if (requestSentAt !== null && responseAt !== null) record(`${opts.label}-server-duration`, responseAt - requestSentAt);
    else console.error(`${opts.label}: server request/response not both observed within 90s`);

    // Arm the NEXT-STATE probe right after the response lands, so C is measured from as close to
    // "the app now has the durable success" as this harness can get without hooking fetch() itself.
    await page.evaluate((src) => (window as any).__armProbe(src), opts.nextStatePredicateSrc);
    const armedAt = (await readProbe(page)).tapAt!;
    const nextState = await waitForProbe(page, 60_000);
    if (nextState.paintAt !== null) {
      record(`${opts.label}-post-server-ui`, nextState.paintAt - armedAt);
      record(`${opts.label}-total`, nextState.paintAt - originalTapAt);
    } else {
      console.error(`${opts.label}-post-server-ui did not resolve within 60s`);
      record(`${opts.label}-post-server-ui`, performance.now() - armedAt);
      record(`${opts.label}-total`, performance.now() - originalTapAt);
    }

    const lt = await longTaskSummary(page);
    if (lt.count > 0) console.log(`  [${opts.label}-longtasks] count=${lt.count} totalMs=${lt.totalMs} longest=${lt.longest}ms`);
  } finally {
    page.off("request", onReq);
    page.off("response", onRes);
  }
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({ geolocation: { latitude: 28.6139, longitude: 77.209, accuracy: 10 }, permissions: ["geolocation"] });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(60_000);
  const page = await context.newPage();
  await page.addInitScript(BROWSER_INSTRUMENTATION);

  if (NETWORK === "fast4g") {
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8, latency: 150 });
    console.log("[NETWORK] Fast 4G throttling active via CDP");
  } else {
    console.log("[NETWORK] Desktop/warm-local (no throttling)");
  }

  const consoleErrors: string[] = [];
  const failed5xx: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`); });

  console.log(`[BASE] ${BASE}  [ACCOUNT] ${LOGIN_EMAIL}`);
  await page.request.post(`${BASE}/api/auth/login`, { data: { email: LOGIN_EMAIL, password: PASSWORD } });
  await page.goto(`${BASE}/portal/sales-executive/today`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // `networkidle` can resolve before this specific page's slow Server-Component data assembly
  // (dashboard+beat+follow-up+catalog, several real DB round trips under a degraded TEST Neon
  // connection) has actually finished streaming — wait explicitly for one of the three real
  // terminal states instead of trusting networkidle alone, bounded generously since this is a
  // one-time page-readiness wait, not a per-action measurement.
  await page
    .waitForSelector('button:has-text("Start day"), button[data-primary="true"]:has-text("Start visit"), button:has-text("Checkout & next customer"), button:has-text("End day")', { timeout: 45_000 })
    .catch((e) => console.error(`Page readiness wait did not resolve within 45s: ${(e as Error).message.split("\n")[0]}`));

  const hasStartDay = await page.locator('button:has-text("Start day")').isVisible().catch(() => false);
  if (hasStartDay) {
    console.log("\n=== Start Day ===");
    await measureMutation(page, {
      tapSelector: 'button:has-text("Start day")',
      feedbackPredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && (x.textContent.includes("Starting day") || x.disabled)); return !!b; }`,
      nextStatePredicateSrc: `() => !!document.querySelector('[data-primary="true"]') || (document.body.textContent || "").includes("TODAY'S WORK")`,
      label: "start-day",
    });
  } else {
    console.log("\n=== Start Day: session already active — not re-measured ===");
  }

  const resumingOpenVisit = await page.locator('button:has-text("Checkout & next customer")').isVisible().catch(() => false);
  if (resumingOpenVisit) console.log("\n=== Resuming an already-open visit — measuring checkout directly ===");

  const MAX_RETAILERS = 4;
  for (let i = 0; i < MAX_RETAILERS; i++) {
    if (!(i === 0 && resumingOpenVisit)) {
      const hasRetailer = await page.locator('button[data-primary="true"]:has-text("Start visit")').first().isVisible().catch(() => false);
      if (!hasRetailer) {
        console.log(`\n=== No more pending beat retailers after ${i} iteration(s) ===`);
        break;
      }
      console.log(`\n=== Retailer ${i + 1}: check-in ===`);
      await measureMutation(page, {
        tapSelector: 'button[data-primary="true"]:has-text("Start visit")',
        feedbackPredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && x.textContent.includes("Checking in")); return !!b; }`,
        nextStatePredicateSrc: `() => (document.body.textContent || "").includes("Visit summary")`,
        label: "check-in",
      });

      // PHASE 4 harness fix: the previous version checked `.isVisible()` on the product select
      // immediately after the check-in probe resolved, which could race the surrounding form's own
      // paint. Explicitly wait (bounded) for the labeled control itself instead of an instant check
      // — a real, stable accessible-name selector (getByLabel), not a fragile text match.
      const productSelect = page.locator('[data-testid="order-line-product-select"]').first();
      const pickerReady = await productSelect.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      if (pickerReady) {
        if (i === 0) {
          const options = await productSelect.locator("option[value]:not([value=''])").all();
          if (options.length > 0) {
            const value = await options[0]!.getAttribute("value");
            if (value) await productSelect.selectOption(value);
            await page.getByLabel("Quantity").first().fill("1");
            const rateField = page.getByLabel("Rate (Incl. GST)").first();
            const currentRate = await rateField.inputValue();
            if (!currentRate || Number(currentRate) <= 0) await rateField.fill("100");

            console.log("=== Order submit ===");
            await measureMutation(page, {
              tapSelector: 'button:has-text("Save order")',
              feedbackPredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && x.textContent.includes("Saving")); return !!b; }`,
              nextStatePredicateSrc: `() => (document.body.textContent || "").includes("Photo type") || (document.body.textContent || "").includes("SHOPFRONT")`,
              label: "order-submit",
            });
          }
        }
      } else {
        console.error("Product picker did not become visible within 10s — skipping order-submit measurement this iteration.");
      }
    }

    await page.locator('select[name="outcome"]').selectOption(i === 0 ? "ORDER_BOOKED" : "NO_ORDER");
    if (i !== 0) await page.locator('input[name="noOrderReason"]').fill("Phase 4 harness — no order this stop");
    const photoExceptionSelect = page.locator('select[name="photoExceptionReason"]');
    if (await photoExceptionSelect.isVisible().catch(() => false)) await photoExceptionSelect.selectOption("MANAGER_APPROVED");

    console.log("=== Checkout -> next retailer ===");
    await measureMutation(page, {
      tapSelector: 'button:has-text("Checkout & next customer")',
      feedbackPredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && x.textContent.includes("Completing visit")); return !!b; }`,
      nextStatePredicateSrc: `() => (document.body.textContent || "").includes("TODAY'S WORK") || (document.body.textContent || "").includes("End day")`,
      label: "checkout",
    });
  }

  console.log("\n=== End Day ===");
  const openedPreview = await page.locator('button:has-text("End day")').first().isVisible().catch(() => false);
  if (openedPreview) {
    await page.locator('button:has-text("End day")').first().click();
    await page.waitForSelector('button:has-text("Confirm & end day")', { timeout: 10_000 }).catch(() => {});
    const outcomeSelect = page.locator('select[name="outcome"]').last();
    if (await outcomeSelect.isVisible().catch(() => false)) await outcomeSelect.selectOption("COMPLETED").catch(() => {});
    await measureMutation(page, {
      tapSelector: 'button:has-text("Confirm & end day")',
      feedbackPredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && x.textContent.includes("Ending day")); return !!b; }`,
      nextStatePredicateSrc: `() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent && x.textContent.includes("Start day")); return !!b; }`,
      label: "end-day",
    });
  } else {
    console.log("End Day button not visible — skipped.");
  }

  console.log(`\n\n========== PHASE 4 RESULTS (${NETWORK}, ${BASE}, ms) ==========`);
  for (const action of ["start-day", "check-in", "order-submit", "checkout", "end-day"]) {
    for (const phase of ["feedback-dom", "feedback-paint", "server-duration", "post-server-ui", "total"]) {
      const s = stats(`${action}-${phase}`);
      if (s) console.log(`  ${(`${action}-${phase}`).padEnd(28)} n=${s.n}  p50=${s.p50}ms  p95=${s.p95}ms  max=${s.max}ms`);
    }
  }
  console.log(`\nConsole errors: ${consoleErrors.length} ${consoleErrors.slice(0, 3).join(" | ")}`);
  console.log(`Failed 5xx: ${failed5xx.length} ${failed5xx.slice(0, 3).join(" | ")}`);

  await browser.close();
}

const watchdog = setTimeout(() => { console.error("WATCHDOG: exceeded 480s — forcing exit with results gathered so far"); process.exit(0); }, 480_000);
watchdog.unref();
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
