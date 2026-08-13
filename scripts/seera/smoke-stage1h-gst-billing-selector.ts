import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { createDistributorReplenishment, fulfilDistributorReplenishment, allocateOrderStock, dispatchAllocatedOrder, recordInventoryMovement } from "../../lib/sales-distribution/workflow-service";
import { createBillingDraft, issueBillingDraft } from "../../lib/sales-distribution/billing-service";

// STAGE 1H smoke test — GST Billing "From Distributor Order" selector, real data (not empty-state):
//  B1. A real, dispatched DISTRIBUTOR_REPLENISHMENT order (real Seera catalog, governed price) is
//      created and dispatched.
//  B2. The EXACT selector query OperationalWorkspace.tsx uses for the S.S. GST Billing "orders"
//      dropdown (status in DISPATCHED/PARTIAL_DELIVERED/DELIVERED, sellerPartnerId scoped) returns
//      this real order.
//  B3. A real TAX_INVOICE billing draft is created FROM that order's buyer/lines context and issued
//      — real ledger entry posted, immutable once issued.
// Safe to re-run: fresh idempotency keys per run.

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
runtime.searchParams.set("connection_limit", "6");
runtime.searchParams.set("pool_timeout", "120");
runtime.searchParams.set("connect_timeout", "30");
const db = new PrismaClient({ datasourceUrl: runtime.toString() });

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-WHITE" } });

  // STAGE 12: recordInventoryMovement's quantity is canonical physical PIECES; the "quantity: 3"
  // order below is 3 Boxes of Cake White = 120 physical pieces, so opening stock must cover that
  // (was "10" pre-Stage-12, when the ledger was still box-denominated).
  await recordInventoryMovement(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 150, sourceType: "SmokeTestOpening", sourceId: `s1h-opening-${suffix}`, sourcePortal: "super-stockist", reason: "Stage 1H smoke opening stock", idempotencyKey: `s1h-opening-${suffix}` });

  const order = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `s1h-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 3 }] });
  await fulfilDistributorReplenishment(db, ss1Owner.id, ss1.id, { orderId: order.id, accepted: [{ lineId: order.lines[0]!.id, quantity: 3 }], action: "ACCEPT" });
  await allocateOrderStock(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: order.id, lines: [{ lineId: order.lines[0]!.id, quantity: 3 }], idempotencyKey: `s1h-allocate-${suffix}` });
  await dispatchAllocatedOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: order.id, idempotencyKey: `s1h-dispatch-${suffix}`, vehicleNumber: "MH-04-XY-2222" });
  console.log(`[B1] OK — real DISTRIBUTOR_REPLENISHMENT order ${order.orderNumber} created and dispatched (real Seera catalog, governed ₹315 rate)`);

  // The EXACT query OperationalWorkspace.tsx uses for the S.S. GST Billing "orders" selector.
  const selectorOrders = await db.seeraSalesOrder.findMany({
    where: { sellerPartnerId: { in: [ss1.id] }, type: "DISTRIBUTOR_REPLENISHMENT", status: { in: ["DISPATCHED", "PARTIAL_DELIVERED", "DELIVERED"] } },
    include: { buyerPartner: { select: { legalName: true, tradeName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const found = selectorOrders.find((o) => o.id === order.id);
  assert(!!found, "expected the real GST Billing 'From Distributor Order' selector query to return this real dispatched order — not an empty state");
  console.log(`[B2] OK — the real GST Billing orders selector returns this order (${found!.buyerPartner?.tradeName ?? found!.buyerPartner?.legalName} · ${found!.orderNumber})`);

  const draft = await createBillingDraft(db, ss1Owner.id, {
    type: "TAX_INVOICE",
    issuerType: "SUPER_STOCKIST",
    issuerId: ss1.id,
    buyerType: "DISTRIBUTOR",
    buyerId: distributor1.id,
    sourcePortal: "super-stockist",
    orderId: order.id,
    lines: [{ skuId: cakeSku.id, quantity: 3, rate: 315 }],
    idempotencyKey: `s1h-invoice-${suffix}`,
  });
  assert(draft.status === "DRAFT" && Number(draft.grandTotal) === 945, `expected a DRAFT invoice for ₹945 (3 x ₹315), got status=${draft.status} grandTotal=${draft.grandTotal}`);
  const issued = await issueBillingDraft(db, ss1Owner.id, draft.id);
  assert(issued.status === "ISSUED", `expected ISSUED, got ${issued.status}`);
  const ledgerEntry = await db.seeraFinancialEntry.findFirst({ where: { documentId: issued.id, type: "INVOICE", status: "POSTED" } });
  assert(!!ledgerEntry, "expected a real POSTED ledger entry from issuing this invoice");
  console.log(`[B3] OK — real TAX_INVOICE issued FROM this order (${issued.documentNumber}, ₹${issued.grandTotal}), real ledger entry posted (${ledgerEntry!.entryNumber})`);

  console.log("\nALL STAGE 1H GST BILLING SELECTOR SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
