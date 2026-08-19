import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";

// TEST-only HTTP-runtime performance benchmark (Performance Phase 2, section 7B): the bare-script
// benchmarks (retailing-performance-baseline.ts, perf-baseline-add-customer.ts) call service
// functions directly — real DB latency, but they never exercise Next.js's own request pipeline
// (middleware, resolveRequestIdentity, effectivePermissions per-request cache(), SSR render for
// page loads) and can never observe after()-deferred work actually being deferred, since after()
// throws synchronously outside a request scope and those scripts fall back to awaiting inline.
// This script drives a REAL `next start` (production build) server over real HTTP, authenticated
// via a real login, so the measured numbers include the full request path a browser click
// actually pays for. Still run locally (not on Vercel) — see the report's infrastructure caveats
// for what that does and doesn't change relative to a true Vercel deployment.
//
// Requires: `PORT=<port> npm run start` already running locally, pointed at TEST DB via
// .env.local (confirmed identical to .env.test's TEST_DATABASE_URL, never production).
// Usage: PERF_BASE_URL=http://localhost:3011 npx tsx scripts/seera/perf-baseline-http-runtime.ts

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

let cookie = "";
async function apiCall(action: string, payload: Record<string, unknown>) {
  const r = await fetch(`${BASE_URL}/api/field/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action, payload }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${action} failed: ${r.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint} (READ-ONLY prep against TEST DB)`);
  console.log(`Benchmarking against ${BASE_URL} — confirm this points at TEST DB via .env.local before trusting results.`);

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "review-sales-executive-1@seera.test", password: "SeeraReview!2026" }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie header on login response");
  cookie = setCookie.split(";")[0]!;
  console.log("Logged in as review-sales-executive-1@seera.test");

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
  for (let i = 0; i < ITERATIONS; i++) {
    await time("dashboard-page", async () => {
      const r = await fetch(`${BASE_URL}/portal/sales-executive/today`, { headers: { Cookie: cookie } });
      if (!r.ok) throw new Error(`dashboard page failed: ${r.status}`);
      await r.text();
    });
  }

  console.log(`=== add-customer (create-retailer-and-check-in) + check-out pairs (n=${ITERATIONS}) ===`);
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
    const visitId = (created as { visit: { id: string } }).visit.id;
    await apiCall("check-out", { visitId, outcome: "NO_ORDER", noOrderReason: "http-perf-test", photoExceptionReason: "http-perf-test" });
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

  console.log(`=== end-day (n=1) ===`);
  await time("end-day", () => apiCall("end-day", { sessionId, outcome: "COMPLETED" }));

  console.log("\n\n========== HTTP RUNTIME BASELINE RESULTS (ms, real HTTP over local `next start`, TEST DB) ==========");
  for (const label of ["dashboard-page", "add-customer-http", "place-order-http", "check-in-http", "check-out-http"]) {
    const s = stats(label);
    if (s) console.log(`  ${label.padEnd(20)} n=${s.n}  p50=${s.p50}ms  p90=${s.p90}ms  p95=${s.p95}ms  p98=${s.p98}ms  max=${s.max}ms`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
