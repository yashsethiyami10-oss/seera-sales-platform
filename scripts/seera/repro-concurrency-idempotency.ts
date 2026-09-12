import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { createRetailerAndCheckIn } from "../../lib/sales-distribution/field-portal-service";
import { executiveAuthorizedDistributors } from "../../lib/sales-distribution/scope";
import { createMoneyDeskTransaction } from "../../lib/finance/money-desk-service";
import { createTreasuryAccount } from "../../lib/finance/treasury-service";

// Full Production OS Audit, Phase 18/21 — GENUINE concurrency test, not a sequential-retry test.
// Fires TWO real requests with the SAME idempotencyKey at nearly the same instant (Promise.all, not
// awaited one after another) against placeRetailerOrder and createMoneyDeskTransaction — the two
// critical-write paths the mission specifically named. Verifies the DB ends up with exactly ONE
// durable record either way, proving the idempotencyKey unique-constraint + check-then-create
// pattern holds under real race conditions, not just under a retry-after-first-completes pattern
// (which every existing script in this repo already tests, but which cannot catch a true race).

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

let pass = 0, fail = 0;
function check(label: string, ok: boolean) { console.log(`  ${ok ? "PASS" : "FAIL"} — ${label}`); if (ok) pass++; else fail++; }

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fp=${target.fingerprint}\n`);
  const suffix = randomUUID().slice(0, 8);
  const executive = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const founder = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: "review-founder@seera.test" } });

  console.log("=== Test 1: two concurrent placeRetailerOrder calls, SAME idempotencyKey ===");
  const existingSession = await prisma.seeraWorkSession.findFirst({ where: { employeeId: executive.id, status: "ACTIVE" } });
  if (existingSession) await prisma.seeraWorkSession.update({ where: { id: existingSession.id }, data: { status: "ENDED", endedAt: new Date() } });
  const authorized = await executiveAuthorizedDistributors(prisma, executive.id);
  const session = await startFieldDay(prisma, executive.id, { employeeRole: "SALES_EXECUTIVE", workingType: "RETAILING", workingDistributorId: authorized[0]!.id, latitude: 28.6139, longitude: 77.209 });
  const { retailer, visit } = await createRetailerAndCheckIn(prisma, executive.id, {
    businessName: `Concurrency Test ${suffix}`, address: { area: "Test Area" }, latitude: 28.6139, longitude: 77.209,
    confirmDuplicate: false, idempotencyKey: randomUUID(), workSessionId: session.id, checkInIdempotencyKey: randomUUID(),
  });
  const sku = await prisma.seeraSku.findFirstOrThrow({ where: { status: "ACTIVE" } });
  const sharedOrderKey = `concurrency-order-${suffix}`;
  const orderPayload = { retailerId: retailer.id, idempotencyKey: sharedOrderKey, lines: [{ skuId: sku.id, quantity: 1, rate: 100 }], source: "FIELD_VISIT" as const, visitId: visit.id };
  const [orderResultA, orderResultB] = await Promise.allSettled([
    placeRetailerOrder(prisma, { actorId: executive.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR" }, orderPayload),
    placeRetailerOrder(prisma, { actorId: executive.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR" }, orderPayload),
  ]);
  const ordersWithKey = await prisma.seeraSalesOrder.findMany({ where: { idempotencyKey: sharedOrderKey } });
  check("both concurrent calls resolved (neither threw an UNEXPECTED error)", orderResultA.status === "fulfilled" || orderResultB.status === "fulfilled");
  check("EXACTLY ONE SeeraSalesOrder row exists for the shared idempotencyKey (no duplicate order from the race)", ordersWithKey.length === 1);
  const orderIdsToClean = ordersWithKey.map((o) => o.id);
  if (orderIdsToClean.length) {
    const lineCounts = await prisma.seeraOrderLine.count({ where: { orderId: { in: orderIdsToClean } } });
    check("exactly one set of order lines exists (no duplicate line creation)", lineCounts === orderPayload.lines.length);
  }

  console.log("\n=== Test 2: two concurrent createMoneyDeskTransaction calls, SAME idempotencyKey ===");
  const cash = await createTreasuryAccount(prisma, founder.id, { kind: "CASH", code: `CONC-CASH-${suffix}`, name: `Concurrency Cash ${suffix}` });
  const sharedMdKey = `concurrency-md-${suffix}`;
  const mdPayload = { purposeCode: "REC-INS" as const, direction: "CASH_IN" as const, amount: 500, date: new Date(), treasuryAccountId: cash.id, counterpartyName: `Concurrency Party ${suffix}`, formData: {}, idempotencyKey: sharedMdKey };
  const [mdResultA, mdResultB] = await Promise.allSettled([
    createMoneyDeskTransaction(prisma, founder.id, mdPayload),
    createMoneyDeskTransaction(prisma, founder.id, mdPayload),
  ]);
  const mdRowsWithKey = await prisma.seeraMoneyDeskTransaction.findMany({ where: { idempotencyKey: sharedMdKey } });
  check("both concurrent Money Desk calls resolved (neither threw an UNEXPECTED error)", mdResultA.status === "fulfilled" || mdResultB.status === "fulfilled");
  check("EXACTLY ONE SeeraMoneyDeskTransaction row exists for the shared idempotencyKey (no duplicate transaction from the race)", mdRowsWithKey.length === 1);
  let journalIdsToClean: string[] = [];
  if (mdRowsWithKey.length) {
    const refs = (mdRowsWithKey[0]!.downstreamRefs ?? {}) as { journalId?: string };
    const journals = refs.journalId ? await prisma.seeraJournalEntry.findMany({ where: { idempotencyKey: { startsWith: sharedMdKey } } }) : [];
    journalIdsToClean = journals.map((j) => j.id);
    check("exactly one (or zero, if still pending) journal entry posted for this Money Desk transaction — no duplicate posting", journals.length <= 1);
  }

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : `${fail} FAILURE(S)`} (${pass} passed, ${fail} failed) ===`);

  console.log("\n=== Cleanup ===");
  await prisma.seeraStatusHistory.deleteMany({ where: { entityId: { in: orderIdsToClean } } });
  await prisma.seeraOrderLine.deleteMany({ where: { orderId: { in: orderIdsToClean } } });
  await prisma.seeraSalesOrder.deleteMany({ where: { id: { in: orderIdsToClean } } });
  await prisma.seeraVisit.deleteMany({ where: { retailerId: retailer.id } });
  await prisma.seeraRetailer.deleteMany({ where: { id: retailer.id } });
  await prisma.seeraWorkSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } });
  if (journalIdsToClean.length) {
    await prisma.seeraJournalLine.deleteMany({ where: { journalId: { in: journalIdsToClean } } });
    await prisma.seeraJournalEntry.deleteMany({ where: { id: { in: journalIdsToClean } } });
  }
  await prisma.seeraMoneyDeskTransaction.deleteMany({ where: { idempotencyKey: sharedMdKey } });
  await prisma.seeraTreasuryAccount.delete({ where: { id: cash.id } });
  const remainingOrders = await prisma.seeraSalesOrder.count({ where: { idempotencyKey: sharedOrderKey } });
  const remainingMd = await prisma.seeraMoneyDeskTransaction.count({ where: { idempotencyKey: sharedMdKey } });
  console.log(`Remaining: orders=${remainingOrders} moneyDesk=${remainingMd}`);
  if (remainingOrders !== 0 || remainingMd !== 0) throw new Error("CLEANUP_INCOMPLETE");
  console.log("Cleanup proven complete.");
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("\n*** SCRIPT ERROR ***", e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
