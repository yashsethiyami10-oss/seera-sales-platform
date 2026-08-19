import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only HTTP-runtime performance benchmark (Performance Phase 2, section 7B/staging pass): the
// bare-script benchmarks (retailing-performance-baseline.ts, perf-baseline-add-customer.ts) call
// service functions directly — real DB latency, but they never exercise Next.js's own request
// pipeline (middleware, resolveRequestIdentity, effectivePermissions per-request cache(), SSR
// render for page loads) and can never observe after()-deferred work actually being deferred,
// since after() throws synchronously outside a request scope and those scripts fall back to
// awaiting inline. This script drives a REAL deployed runtime (local `next start` or an actual
// Vercel Preview deployment) over real HTTP, authenticated via a real login, so the measured
// numbers include the full request path a browser click actually pays for.
//
// Usage (local): PERF_BASE_URL=http://localhost:3011 npx tsx scripts/seera/perf-baseline-http-runtime.ts
// Usage (Vercel Preview, protected): PERF_BASE_URL=https://<preview>.vercel.app
//   PERF_BYPASS=<automation-bypass-secret> npx tsx scripts/seera/perf-baseline-http-runtime.ts
// The bypass secret comes from the project's "Protection Bypass for Automation" — never printed.

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const production = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: false, targetUrl: test, productionUrl: production, testUrl: test });
const db = new PrismaClient({ datasourceUrl: test });

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3011";
const BYPASS = process.env.PERF_BYPASS;
const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 20);

type Sample = { label: string; ms: number };
const samples: Sample[] = [];
async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  samples.push({ label, ms: performance.now() - start });
  return result;
}
function stats(label: string) {
  const vals = samples.filter((s) => s.label === label).map((s) => s.ms).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const pct = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  return { n: vals.length, p50: Math.round(pct(0.5)!), p90: Math.round(pct(0.9)!), p95: Math.round(pct(0.95)!), p98: Math.round(pct(0.98)!), max: Math.round(vals[vals.length - 1]!) };
}

function headers(extra: Record<string, string> = {}) {
  return { ...extra, ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cookie = "";
async function apiCall(action: string, payload: Record<string, unknown>) {
  // `app/api/field/operations/route.ts` enforces a real, correct 60-req/60s-per-actor rate limit
  // (enforceRateLimit) — this benchmark must respect it, not treat it as noise. A fixed pacing
  // delay between calls (not counted in the measured latency itself) keeps this script well
  // under that budget regardless of how many measurement phases run back to back.
  await sleep(1100);
  const r = await fetch(`${BASE_URL}/api/field/operations`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Cookie: cookie }),
    body: JSON.stringify({ action, payload }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${action} failed: ${r.status} ${JSON.stringify(body)}`);
  return body;
}
async function getPage(pagePath: string) {
  const r = await fetch(`${BASE_URL}${pagePath}`, { headers: headers({ Cookie: cookie }) });
  if (!r.ok) throw new Error(`${pagePath} failed: ${r.status}`);
  await r.text();
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY prep against TEST DB)`);
  console.log(`Benchmarking against ${BASE_URL} — confirm this points at TEST DB before trusting results.`);

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: "review-sales-executive-1@seera.test", password: "SeeraReview!2026" }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie header on login response");
  cookie = setCookie.split(";")[0]!;
  console.log("Logged in as review-sales-executive-1@seera.test (TEST-only fixture — proves TEST DB, not production)");

  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const skus = await db.seeraSku.findMany({ where: { code: { startsWith: "IV26-" } }, orderBy: { code: "asc" }, take: 2 });
  if (skus.length < 2) throw new Error("expected >=2 seeded SKUs");

  // Clean any dangling open visit/session (employee-wide, same class of issue found earlier).
  const openVisits = await db.seeraVisit.findMany({ where: { workSession: { employeeId: exec.id }, checkedOutAt: null } });
  for (const v of openVisits) {
    await apiCall("check-out", { visitId: v.id, outcome: "NO_ORDER", noOrderReason: "http-perf-cleanup", photoExceptionReason: "http-perf-cleanup" }).catch(async () => {
      await db.seeraVisit.update({ where: { id: v.id }, data: { checkedOutAt: new Date(), outcome: "NO_ORDER", noOrderReason: "http-perf-cleanup" } });
    });
  }
  const activeSession = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (activeSession) await apiCall("end-day", { sessionId: activeSession.id, outcome: "COMPLETED" }).catch(() => {});

  const distributorFallback = await db.seeraRetailer.findFirst({ where: { salespersonId: exec.id, distributorId: { not: null } }, select: { distributorId: true } });
  const workingDistributorId = distributorFallback?.distributorId;
  if (!workingDistributorId) throw new Error("expected an existing retailer with a resolved distributorId for this exec fixture");

  const run = Date.now().toString(36);

  console.log(`\n=== start-day (n=1, cold — session can only start once per run) ===`);
  const startResp = await time("start-day", () => apiCall("start-day", { workingType: "RETAILING", workingDistributorId, latitude: 28.6139, longitude: 77.209 }));
  const sessionId = (startResp as { id: string }).id;

  console.log(`=== dashboard page load: GET /portal/sales-executive/today (n=${ITERATIONS}) ===`);
  for (let i = 0; i < ITERATIONS; i++) await time("dashboard-page", () => getPage("/portal/sales-executive/today"));

  console.log(`=== My Retailers page load: GET /portal/sales-executive/retailers (n=${ITERATIONS}) ===`);
  for (let i = 0; i < ITERATIONS; i++) await time("my-retailers-page", () => getPage("/portal/sales-executive/retailers"));

  console.log(`=== add-customer (create-retailer-and-check-in) + check-out pairs (n=${ITERATIONS}) ===`);
  let lastNewRetailerId = "";
  for (let i = 0; i < ITERATIONS; i++) {
    const created = await time("add-customer-http", () =>
      apiCall("create-retailer-and-check-in", {
        businessName: `HTTP Perf Shop ${run}-${i}`,
        address: { area: "HTTP Perf Test Area" },
        mobile: `96${String(Date.now()).slice(-8)}`,
        latitude: 28.6139,
        longitude: 77.209,
        workSessionId: sessionId,
        idempotencyKey: `http-perf-retailer-${run}-${i}`,
        checkInIdempotencyKey: `http-perf-checkin-${run}-${i}`,
      }),
    );
    const data = created as { retailer: { id: string }; visit: { id: string } };
    lastNewRetailerId = data.retailer.id;
    await apiCall("check-out", { visitId: data.visit.id, outcome: "NO_ORDER", noOrderReason: "http-perf-test", photoExceptionReason: "http-perf-test" });
  }

  console.log(`=== place-order (n=${ITERATIONS}, phone-call source — no visit required) ===`);
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { salespersonId: exec.id, lifecycle: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  for (let i = 0; i < ITERATIONS; i++) {
    await time("place-order-http", () =>
      apiCall("place-order", {
        retailerId: retailer.id,
        idempotencyKey: `http-perf-order-${run}-${i}`,
        lines: [{ skuId: skus[i % skus.length]!.id, quantity: 1, rate: 60 }],
        source: "PHONE_CALL",
      }),
    );
  }

  console.log(`=== check-in / check-out round trip (n=${ITERATIONS}) ===`);
  for (let i = 0; i < ITERATIONS; i++) {
    const visit = await time("check-in-http", () =>
      apiCall("check-in", { workSessionId: sessionId, retailerId: retailer.id, latitude: 28.6139, longitude: 77.209, idempotencyKey: `http-perf-ci-${run}-${i}` }),
    );
    await time("check-out-http", () =>
      apiCall("check-out", { visitId: (visit as { id: string }).id, outcome: "NO_ORDER", noOrderReason: "http-perf-test", photoExceptionReason: "http-perf-test" }),
    );
  }

  console.log(`=== revisit (Check In Again on an already-visited-today retailer) (n=${ITERATIONS}) ===`);
  // Same retailer as the check-in/check-out loop above — it's already been visited (and checked
  // out) multiple times today by this point, so this genuinely exercises the "Check In Again"
  // path (OPEN_VISIT_EXISTS only blocks a DIFFERENT retailer, same retailer is always allowed).
  for (let i = 0; i < ITERATIONS; i++) {
    const visit = await time("revisit-http", () =>
      apiCall("check-in", { workSessionId: sessionId, retailerId: retailer.id, latitude: 28.6139, longitude: 77.209, idempotencyKey: `http-perf-revisit-${run}-${i}` }),
    );
    await apiCall("check-out", { visitId: (visit as { id: string }).id, outcome: "NO_ORDER", noOrderReason: "http-perf-test", photoExceptionReason: "http-perf-test" });
  }

  console.log(`=== end-day (n=1) ===`);
  await time("end-day", () => apiCall("end-day", { sessionId, outcome: "COMPLETED" }));

  console.log("\n\n========== HTTP RUNTIME BASELINE RESULTS (ms) ==========");
  console.log(`Target: ${BASE_URL}`);
  for (const label of ["dashboard-page", "my-retailers-page", "add-customer-http", "place-order-http", "check-in-http", "revisit-http", "check-out-http", "start-day", "end-day"]) {
    const s = stats(label);
    if (s) console.log(`  ${label.padEnd(20)} n=${s.n}  p50=${s.p50}ms  p90=${s.p90}ms  p95=${s.p95}ms  p98=${s.p98}ms  max=${s.max}ms`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
