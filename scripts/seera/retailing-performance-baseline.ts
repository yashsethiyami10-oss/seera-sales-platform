import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { executiveDashboard, executiveBeat, executiveDistributorFollowUp, executiveCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { startFieldDay, endFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";

// TEST-only performance baseline for the Sales Executive retailing journey
// (SEERA RETAILING OS — EXTREME PERFORMANCE ACCELERATION, Phase 2/21).
// Measures REAL service-layer latency against real TEST Neon — not a single
// run, not a guess. Run this BEFORE and AFTER optimization for a true diff.

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
  const max = vals[vals.length - 1];
  return { n: vals.length, p50: Math.round(p50!), p95: Math.round(p95!), max: Math.round(max!) };
}

const ITERATIONS = 10;

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const run = Date.now().toString(36);

  console.log(`\n=== 0. startFieldDay / endFieldDay (${ITERATIONS} full start->end cycles, real n=${ITERATIONS} instead of n=1 — a session can only be ended once, so each iteration starts a fresh one) ===`);
  {
    const existing = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
    if (existing) await endFieldDay(db, exec.id, existing.id, { outcome: "COMPLETED", latitude: 28.61, longitude: 77.21 });
  }
  for (let i = 0; i < ITERATIONS; i++) {
    const daySession = await time("start-day", () =>
      startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 28.6139, longitude: 77.209 }),
    );
    await time("end-day", () => endFieldDay(db, exec.id, daySession.id, { outcome: "COMPLETED", latitude: 28.61, longitude: 77.21 }));
  }

  console.log(`\n=== Ensuring a clean active session for the executive (${ITERATIONS} iterations follow) ===`);
  let session = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (!session) {
    session = await startFieldDay(db, exec.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", latitude: 28.6139, longitude: 77.2090 });
  }
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { salespersonId: exec.id, lifecycle: "ACTIVE" } });

  console.log("\n=== 1. executiveDashboard (portal load / every router.refresh) ===");
  for (let i = 0; i < ITERATIONS; i++) await time("dashboard", () => executiveDashboard(db, exec.id, new Date()));

  console.log("=== 2. executiveBeat (today's retailer list) ===");
  for (let i = 0; i < ITERATIONS; i++) await time("beat", () => executiveBeat(db, exec.id, "today", new Date()));

  console.log("=== 3. executiveDistributorFollowUp ===");
  for (let i = 0; i < ITERATIONS; i++) await time("followup", () => executiveDistributorFollowUp(db, exec.id, new Date()));

  console.log("=== 4. Product catalog query (as built inline in OperationalWorkspace.tsx) ===");
  for (let i = 0; i < ITERATIONS; i++) {
    await time("catalog", () =>
      db.seeraSku.findMany({
        where: { status: "ACTIVE" },
        include: { prices: { where: { tier: "DISTRIBUTOR_TO_RETAILER", status: "ACTIVE", effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
        orderBy: [{ brand: "asc" }, { productName: "asc" }],
        take: 200,
      }),
    );
  }

  console.log("=== 5. Combined portal load (dashboard+beat+followup+catalog in parallel, as OperationalWorkspace.tsx actually does) ===");
  for (let i = 0; i < ITERATIONS; i++) {
    await time("combined-load", () =>
      Promise.all([
        executiveDashboard(db, exec.id, new Date()),
        executiveBeat(db, exec.id, "today", new Date()),
        executiveDistributorFollowUp(db, exec.id, new Date()),
        db.seeraSku.findMany({ where: { status: "ACTIVE" }, include: { prices: { where: { tier: "DISTRIBUTOR_TO_RETAILER", status: "ACTIVE" }, take: 1 } }, take: 200 }),
      ]),
    );
  }

  console.log("=== 6. executiveCheckIn / executiveCheckOut round-trip (paired, since checkout needs an open visit) ===");
  for (let i = 0; i < ITERATIONS; i++) {
    const visit = await time("check-in", () =>
      executiveCheckIn(db, exec.id, { workSessionId: session!.id, retailerId: retailer.id, latitude: 28.61, longitude: 77.21, idempotencyKey: `perf-checkin-${run}-${i}` }),
    );
    // Photo requirement is bypassed here via exception reason (same governed path a real GPS-denied
    // flow uses) so checkout timing is measured in isolation from photo-upload latency.
    await time("check-out", () => executiveCheckOut(db, exec.id, visit.id, { outcome: "NO_ORDER", noOrderReason: "perf-test", photoExceptionReason: "perf-test-no-photo", latitude: 28.61, longitude: 77.21 }));
  }

  console.log("=== 7. placeRetailerOrder (client-trusted rate path, matching field order booking) ===");
  const sku = await db.seeraSku.findFirstOrThrow({ where: { status: "ACTIVE" } });
  for (let i = 0; i < ITERATIONS; i++) {
    const visit = await executiveCheckIn(db, exec.id, { workSessionId: session!.id, retailerId: retailer.id, latitude: 28.61, longitude: 77.21, idempotencyKey: `perf-order-checkin-${run}-${i}` });
    await time("place-order", () =>
      placeRetailerOrder(db, { actorId: exec.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: retailer.distributorId ?? "" }, { retailerId: retailer.id, idempotencyKey: `perf-order-${run}-${i}`, lines: [{ skuId: sku.id, quantity: 1, rate: Number(sku.mrp) }] }),
    );
    await executiveCheckOut(db, exec.id, visit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "perf-test-no-photo", latitude: 28.61, longitude: 77.21 });
  }

  console.log("=== 8. endFieldDay (final close of the session used for steps 6/7 above) ===");
  await time("end-day", () => endFieldDay(db, exec.id, session!.id, { outcome: "COMPLETED", latitude: 28.61, longitude: 77.21 }));

  console.log("\n\n========== BASELINE RESULTS (ms) ==========");
  for (const label of ["start-day", "dashboard", "beat", "followup", "catalog", "combined-load", "check-in", "check-out", "place-order", "end-day"]) {
    const s = stats(label);
    if (s) console.log(`  ${label.padEnd(16)} n=${s.n}  p50=${s.p50}ms  p95=${s.p95}ms  max=${s.max}ms`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
