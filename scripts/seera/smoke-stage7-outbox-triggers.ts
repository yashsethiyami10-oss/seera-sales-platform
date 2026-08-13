import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { placeRetailerOrder, recordInventoryMovement } from "../../lib/sales-distribution/workflow-service";
import { acceptAndPrepareRetailerOrder, recordEasyDeliveryOutcome } from "../../lib/sales-distribution/distributor-easy-mode-service";
import { listRetailerCommunications } from "../../lib/sales-distribution/retailer-communication-service";

// STAGE 7 smoke test — ORDER_ACCEPTED, ORDER_PARTIAL, DELIVERED were DEFINED in the retailer
// communication event matrix but never actually triggered anywhere (queueRetailerCommunication was
// only ever called from Executive checkout). Proves the newly-wired triggers fire for real actions.
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
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id, mobile: { not: null } } });

  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 3, sourceType: "SmokeTestOpening", sourceId: `s7-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 7 smoke opening stock", idempotencyKey: `s7-opening-${suffix}` });

  const before = await listRetailerCommunications(db, { retailerId: retailer.id });
  const order = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s7-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 2, rate: 60 }] },
  );

  const { delivery } = await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, {
    orderId: order.id,
    decision: "ACCEPT",
    lines: [{ lineId: order.lines[0]!.id, quantity: 2 }],
    idempotencyKey: `s7-accept-${suffix}`,
  });
  const afterAccept = await listRetailerCommunications(db, { retailerId: retailer.id });
  const acceptedEvent = afterAccept.find((c) => c.eventType === "ORDER_ACCEPTED" && !before.some((b) => b.id === c.id));
  assert(!!acceptedEvent, "expected a real ORDER_ACCEPTED communication to be queued after Distributor ACCEPT — this event type was previously dead");
  console.log(`[1] OK — ORDER_ACCEPTED now genuinely queued (id=${acceptedEvent!.id}, status=${acceptedEvent!.status}) — previously defined but never triggered`);

  await recordEasyDeliveryOutcome(db, distributorOwner.id, { deliveryId: delivery!.id, outcome: "DELIVERED", lines: [{ lineId: order.lines[0]!.id, quantity: 2 }] });
  const afterDeliver = await listRetailerCommunications(db, { retailerId: retailer.id });
  const deliveredEvent = afterDeliver.find((c) => c.eventType === "DELIVERED" && !afterAccept.some((b) => b.id === c.id));
  assert(!!deliveredEvent, "expected a real DELIVERED communication to be queued after the delivery outcome — this event type was previously dead");
  console.log(`[2] OK — DELIVERED now genuinely queued (id=${deliveredEvent!.id}, status=${deliveredEvent!.status}) — previously defined but never triggered`);

  // Partial path.
  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 1, sourceType: "SmokeTestOpening", sourceId: `s7-partial-opening-${suffix}`, sourcePortal: "distributor", reason: "Stage 7 smoke partial opening stock", idempotencyKey: `s7-partial-opening-${suffix}` });
  const partialOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `s7-partial-order-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 3, rate: 60 }] },
  );
  await acceptAndPrepareRetailerOrder(db, distributorOwner.id, distributor1.id, {
    orderId: partialOrder.id,
    decision: "PARTIAL_ACCEPT",
    lines: [{ lineId: partialOrder.lines[0]!.id, quantity: 1 }],
    idempotencyKey: `s7-partial-accept-${suffix}`,
  });
  const afterPartial = await listRetailerCommunications(db, { retailerId: retailer.id });
  const partialEvent = afterPartial.find((c) => c.eventType === "ORDER_PARTIAL" && !afterDeliver.some((b) => b.id === c.id));
  assert(!!partialEvent, "expected a real ORDER_PARTIAL communication to be queued after Distributor PARTIAL_ACCEPT");
  console.log(`[3] OK — ORDER_PARTIAL now genuinely queued (id=${partialEvent!.id}, status=${partialEvent!.status}) — previously defined but never triggered`);

  console.log("\nALL STAGE 7 OUTBOX-TRIGGER SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
