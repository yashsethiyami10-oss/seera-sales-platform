import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createRetailer, executiveCheckIn, executiveCheckOut, createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { startFieldDay, endFieldDay } from "../../lib/sales-distribution/workflow-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// TEST-only performance baseline, P0 Add Customer specifically (this repo's existing
// retailing-performance-baseline.ts already covers dashboard/beat/followup/catalog/check-in/
// check-out/place-order/start-day/end-day — this script adds the one comparison that script
// doesn't have: the OLD 2-sequential-round-trip Add Customer path (createRetailer, then
// executiveCheckIn as two separate awaits, mirroring what FieldJourney.tsx's submitAddCustomer
// used to do as two separate fetch() calls) versus the NEW single createRetailerAndCheckIn
// action. Measures REAL service-layer latency against real TEST Neon, not a single sample.
//
// Server-side service-layer latency only — this does NOT include GPS acquisition time (client/
// device-bound, not a server round trip) or real mobile-network latency to the client, both of
// which the SLO report must account for separately. Set PERF_TRACE_ALL=1 in the environment to
// also see per-stage timeOperation() breakdowns in stderr for the slow-path (>1000ms) or every
// call (with the flag) — this script's own timings below are independent of that flag.

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
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: production, testUrl: test });
const runtime = new URL(test);
runtime.searchParams.set("connection_limit", "8");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

type Sample = { label: string; ms: number };
const samples: Sample[] = [];
async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  samples.push({ label, ms });
  return result;
}
function stats(label: string) {
  const vals = samples.filter((s) => s.label === label).map((s) => s.ms).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const p50 = vals[Math.floor(vals.length * 0.5)];
  const p95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))];
  const p98 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.98))];
  const max = vals[vals.length - 1];
  return { n: vals.length, p50: Math.round(p50!), p95: Math.round(p95!), p98: Math.round(p98!), max: Math.round(max!) };
}

const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 30);

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const run = Date.now().toString(36);
  const authorizedDistributors = await executiveAuthorizedDistributors(db, exec.id);
  const workingDistributorId = authorizedDistributors[0]!.id;

  // OPEN_VISIT_EXISTS is scoped by EMPLOYEE, not by session (see executiveCheckIn) — any open
  // visit under ANY of this employee's sessions (including an already-ended one) blocks a new
  // check-in, so cleanup must search across all sessions, not just the currently-active one.
  const openVisits = await db.seeraVisit.findMany({ where: { workSession: { employeeId: exec.id }, checkedOutAt: null } });
  for (const v of openVisits) {
    // executiveCheckOut requires workSession.status==="ACTIVE" — a visit orphaned under an
    // already-ended session (e.g. a prior interrupted run) can no longer close through the
    // normal API. TEST-fixture-only fallback: close it directly rather than leaving it stuck.
    await executiveCheckOut(db, exec.id, v.id, { outcome: "NO_ORDER", noOrderReason: "perf-cleanup", photoExceptionReason: "perf-cleanup" }).catch(() =>
      db.seeraVisit.update({ where: { id: v.id }, data: { checkedOutAt: new Date(), outcome: "NO_ORDER", noOrderReason: "perf-cleanup (orphaned session repair)" } }),
    );
  }
  const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (existing) await endFieldDay(db, exec.id, existing.id, { outcome: "COMPLETED" }).catch(() => {});
  const session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId, latitude: 28.6139, longitude: 77.209 });

  console.log(`\n=== OLD PATH: createRetailer + executiveCheckIn as 2 sequential round trips (n=${ITERATIONS}) ===`);
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const retailer = await createRetailer(db, exec.id, {
      businessName: `Perf Old Path Shop ${run}-${i}`,
      address: { area: "Perf Test Area" },
      mobile: `97${String(Date.now()).slice(-8)}`,
      latitude: 28.6139,
      longitude: 77.209,
      idempotencyKey: `perf-old-retailer-${run}-${i}`,
    });
    const visit = await executiveCheckIn(db, exec.id, {
      workSessionId: session.id,
      retailerId: retailer.id,
      latitude: 28.6139,
      longitude: 77.209,
      idempotencyKey: `perf-old-checkin-${run}-${i}`,
    });
    samples.push({ label: "add-customer-old-2-step", ms: performance.now() - start });
    await executiveCheckOut(db, exec.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "perf-test", photoExceptionReason: "perf-test-no-photo" });
  }

  console.log(`=== NEW PATH: createRetailerAndCheckIn, one round trip (n=${ITERATIONS}) ===`);
  for (let i = 0; i < ITERATIONS; i++) {
    const { visit } = await time("add-customer-new-combined", () =>
      createRetailerAndCheckIn(db, exec.id, {
        businessName: `Perf New Path Shop ${run}-${i}`,
        address: { area: "Perf Test Area" },
        mobile: `97${String(Date.now()).slice(-8)}`,
        latitude: 28.6139,
        longitude: 77.209,
        workSessionId: session.id,
        idempotencyKey: `perf-new-retailer-${run}-${i}`,
        checkInIdempotencyKey: `perf-new-checkin-${run}-${i}`,
      }),
    );
    await executiveCheckOut(db, exec.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "perf-test", photoExceptionReason: "perf-test-no-photo" });
  }

  await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED" });

  console.log("\n\n========== ADD CUSTOMER BASELINE RESULTS (ms, server-side only — excludes client GPS acquisition and network transit) ==========");
  for (const label of ["add-customer-old-2-step", "add-customer-new-combined"]) {
    const s = stats(label);
    if (s) console.log(`  ${label.padEnd(28)} n=${s.n}  p50=${s.p50}ms  p95=${s.p95}ms  p98=${s.p98}ms  max=${s.max}ms`);
  }
  const oldStats = stats("add-customer-old-2-step");
  const newStats = stats("add-customer-new-combined");
  if (oldStats && newStats) {
    console.log(`\n  p95 improvement: ${oldStats.p95}ms -> ${newStats.p95}ms (${Math.round((1 - newStats.p95 / oldStats.p95) * 100)}% reduction)`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
