import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// Executive Save Order performance mission — real, backend-level before/after measurement of the
// EXACT production code path (placeRetailerOrder), against TEST DB. This is a backend/service-layer
// measurement (calling the same functions the HTTP route calls, with the same DB), NOT a browser or
// physical-device measurement — no such environment is available in this session. It isolates the
// server-side contribution to Save Order latency: network/render time on an actual phone is outside
// what this script can observe and is NOT claimed here.
//
// Root cause found by code trace (not guessed): app/api/field/operations/route.ts's "place-order"
// case used to run its own `prisma.seeraRetailer.findFirst({ salespersonId, lifecycle })` BEFORE
// calling placeRetailerOrder, purely to (a) enforce retailer ownership/active-lifecycle and (b) read
// back distributorId for a tamper check — then placeRetailerOrder's own Promise.all fetched the
// SAME retailer row again by id. A full sequential DB round trip duplicated on the Executive's
// hottest write path. Fixed by moving the ownership/lifecycle check into placeRetailerOrder's own
// sales-executive branch (using the retailer row it already fetches) and deleting the route's
// separate pre-fetch. This script measures placeRetailerOrder directly with PERF_TRACE_ALL=1 so its
// own internal timing.stage() breakdown (lib/foundation/logger.ts) is captured for every call, not
// just ones over the 1000ms budget.

process.env.PERF_TRACE_ALL = "1";

function envFile(file: string) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
const root = path.resolve(import.meta.dirname, "..", "..");
const prod = envFile(path.join(root, ".env")).DATABASE_URL;
const test = envFile(path.join(root, ".env.test")).TEST_DATABASE_URL;
const target = authorizeDatabaseCommand({ intendedRole: "test", write: true, targetUrl: test, productionUrl: prod, testUrl: test });
if (target.role !== "test") throw new Error("ABORT: not TEST");
const url = new URL(test);
url.searchParams.set("connect_timeout", "30");
// placeRetailerOrder issues a genuine 4-way concurrent Promise.all — Prisma's bare-default client
// pool (5 connections/10s wait) has repeatedly proven too tight against this session's flaky TEST
// endpoint even for legitimate concurrent work, matching the pattern already fixed this session in
// manufacturing-os-proof.ts etc. Test-only measurement script; not a production change.
url.searchParams.set("connection_limit", "10");
url.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

const ITERATIONS = Number(process.argv[2] ?? 8);

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const existingSession = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existingSession) await prisma.seeraWorkSession.update({ where: { id: existingSession.id }, data: { status: "ENDED", endedAt: new Date() } });
  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  if (!authorized.length) throw new Error("Fixture setup: executive has no authorized distributor");
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });

  const sku = await prisma.seeraSku.findFirstOrThrow({ where: { status: "ACTIVE" } });

  const createdRetailerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const timings: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const suffix = `${randomUUID().slice(0, 8)}`;
    const { retailer, visit } = await createRetailerAndCheckIn(prisma, executive.id, {
      businessName: `Perf Save Order ${suffix}`,
      address: { area: "Test Area" },
      latitude: 28.6139,
      longitude: 77.209,
      confirmDuplicate: false,
      idempotencyKey: randomUUID(),
      workSessionId: session.id,
      checkInIdempotencyKey: randomUUID(),
    });
    createdRetailerIds.push(retailer.id);

    const start = performance.now();
    // SIMULATE_OLD_ROUTE=1 reproduces the exact extra query app/api/field/operations/route.ts's
    // "place-order" case used to run BEFORE calling placeRetailerOrder (now removed) — a true
    // apples-to-apples "before" number against the SAME current DB/data, since placeRetailerOrder's
    // own internal work is otherwise identical either way (the only functional change moved an
    // in-memory check, adding no query of its own).
    if (process.env.SIMULATE_OLD_ROUTE === "1") {
      await prisma.seeraRetailer.findFirst({ where: { id: retailer.id, salespersonId: executive.id, lifecycle: "ACTIVE" } });
    }
    const order = await placeRetailerOrder(
      prisma,
      { actorId: executive.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR" },
      {
        retailerId: retailer.id,
        idempotencyKey: randomUUID(),
        lines: [{ skuId: sku.id, quantity: 2, rate: 100 }],
        source: "FIELD_VISIT",
        visitId: visit.id,
      },
    );
    const elapsed = performance.now() - start;
    timings.push(elapsed);
    createdOrderIds.push(order.id);
    console.log(`  iteration ${i + 1}/${ITERATIONS}: ${elapsed.toFixed(1)}ms${i === 0 ? " (cold)" : ""}`);
    // A work session only allows one OPEN visit at a time (OPEN_VISIT_EXISTS) — check out before
    // the next iteration's createRetailerAndCheckIn, exactly as the real Executive flow always does
    // (Save Order -> Photo -> Check-out -> next customer).
    await executiveCheckOut(prisma, executive.id, visit.id, { outcome: "ORDER_BOOKED", photoExceptionReason: "PERF_MEASUREMENT_SCRIPT_NO_PHOTO", idempotencyKey: randomUUID() });
  }

  const warm = timings.slice(1);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const sorted = [...warm].sort((a, b) => a - b);
  console.log(`\nCold run (iteration 1): ${timings[0]!.toFixed(1)}ms`);
  console.log(`Warm runs (iterations 2-${ITERATIONS}): avg=${avg(warm).toFixed(1)}ms min=${Math.min(...warm).toFixed(1)}ms max=${Math.max(...warm).toFixed(1)}ms median=${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)}ms`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraStatusHistory.deleteMany({ where: { entityId: { in: createdOrderIds } } });
  await prisma.seeraOrderLine.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.seeraSalesOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.seeraVisit.deleteMany({ where: { retailerId: { in: createdRetailerIds } } });
  await prisma.seeraRetailer.deleteMany({ where: { id: { in: createdRetailerIds } } });
  await prisma.seeraWorkSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
  const remainingOrders = await prisma.seeraSalesOrder.count({ where: { id: { in: createdOrderIds } } });
  const remainingRetailers = await prisma.seeraRetailer.count({ where: { id: { in: createdRetailerIds } } });
  console.log(`Remaining: orders=${remainingOrders} retailers=${remainingRetailers}`);
  if (remainingOrders !== 0 || remainingRetailers !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
