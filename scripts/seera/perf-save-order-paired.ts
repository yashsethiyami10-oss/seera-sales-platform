import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";

// Executive Save Order performance mission — PAIRED before/after comparison. Today's TEST DB has
// swung between ~3s and ~14s of pure environmental latency noise per call (documented extensively
// this session; production stayed healthy throughout), which swamps the actual effect of the fix
// (one fewer sequential DB round trip, independently measured in isolation at ~117-300ms). Running
// a full "before" batch then a full "after" batch minutes apart is unreliable — DB conditions shift
// between batches. This instead measures BOTH configurations back-to-back within EACH iteration
// (immediately adjacent in time), so slowly-varying environmental noise is common-mode across the
// pair and the PER-ITERATION DELTA is a fair signal, even though each side's own absolute number
// still isn't representative of a healthy connection.
process.env.PERF_TRACE_ALL = ""; // keep noisy internal-stage logs out of this run's output

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
url.searchParams.set("connection_limit", "10");
url.searchParams.set("pool_timeout", "30");
const prisma = new PrismaClient({ datasourceUrl: url.toString() });

const PAIRS = Number(process.argv[2] ?? 8);

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const existingSession = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existingSession) await prisma.seeraWorkSession.update({ where: { id: existingSession.id }, data: { status: "ENDED", endedAt: new Date() } });
  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });
  const sku = await prisma.seeraSku.findFirstOrThrow({ where: { status: "ACTIVE" } });

  const createdRetailerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const deltas: number[] = [];
  const befores: number[] = [];
  const afters: number[] = [];

  async function oneCall(simulateOld: boolean): Promise<{ ms: number; retailerId: string; orderId: string; visitId: string }> {
    const suffix = randomUUID().slice(0, 8);
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
    if (simulateOld) await prisma.seeraRetailer.findFirst({ where: { id: retailer.id, salespersonId: executive.id, lifecycle: "ACTIVE" } });
    const order = await placeRetailerOrder(
      prisma,
      { actorId: executive.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR" },
      { retailerId: retailer.id, idempotencyKey: randomUUID(), lines: [{ skuId: sku.id, quantity: 2, rate: 100 }], source: "FIELD_VISIT", visitId: visit.id },
    );
    const ms = performance.now() - start;
    createdOrderIds.push(order.id);
    return { ms, retailerId: retailer.id, orderId: order.id, visitId: visit.id };
  }

  for (let i = 0; i < PAIRS; i++) {
    const before = await oneCall(true);
    await executiveCheckOut(prisma, executive.id, before.visitId, { outcome: "ORDER_BOOKED", photoExceptionReason: "PERF_MEASUREMENT_SCRIPT_NO_PHOTO", idempotencyKey: randomUUID() });
    const after = await oneCall(false);
    await executiveCheckOut(prisma, executive.id, after.visitId, { outcome: "ORDER_BOOKED", photoExceptionReason: "PERF_MEASUREMENT_SCRIPT_NO_PHOTO", idempotencyKey: randomUUID() });
    const delta = before.ms - after.ms;
    befores.push(before.ms);
    afters.push(after.ms);
    deltas.push(delta);
    console.log(`  pair ${i + 1}/${PAIRS}: before=${before.ms.toFixed(1)}ms after=${after.ms.toFixed(1)}ms delta=${delta >= 0 ? "+" : ""}${delta.toFixed(1)}ms`);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const sorted = [...deltas].sort((a, b) => a - b);
  console.log(`\nAvg before: ${avg(befores).toFixed(1)}ms`);
  console.log(`Avg after:  ${avg(afters).toFixed(1)}ms`);
  console.log(`Avg delta (before - after): ${avg(deltas).toFixed(1)}ms  |  median delta: ${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)}ms  |  positive deltas (fix faster): ${deltas.filter((d) => d > 0).length}/${deltas.length}`);

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
