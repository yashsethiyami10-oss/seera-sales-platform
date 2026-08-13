import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { dispatchRetailerCommunications, reclaimStaleOutboxLocks, queueRetailerCommunication } from "../../lib/sales-distribution/retailer-communication-service";
import { dispatchAllocatedOrder, allocateOrderStock, placeRetailerOrder, createDistributorReplenishment, fulfilRetailerOrder, recordInventoryMovement } from "../../lib/sales-distribution/workflow-service";
import { acceptAndAllocateDistributorOrder } from "../../lib/sales-distribution/super-stockist-easy-mode-service";

// PRE-LAUNCH PASS 0B smoke test — the dispatch WORKER's state machine (consumer side; Stage 7's
// smoke script already covers the PRODUCER side — event types actually getting queued). Proves,
// against the real TEST DB: claim-once, success->PUBLISHED, failure->FAILED with backoff, bounded
// retry->DEAD_LETTER, stale PROCESSING reclaim (and that a fresh lock is left alone), that a
// provider failure never fakes PUBLISHED, and that OUT_FOR_DELIVERY only ever queues for a genuine
// RETAILER_ORDER dispatch, never for S.S.<->Distributor replenishment dispatch (the shared
// dispatchAllocatedOrder function). Safe to re-run: fresh idempotency keys/suffix per run.

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

const succeedingProvider = () => ({ sendWhatsApp: async () => ({ id: "fake-provider-message-id" }) });
const failingProvider = () => ({
  sendWhatsApp: async () => {
    throw new Error("PROVIDER_CREDENTIALS_MISSING");
  },
});

async function main() {
  console.log(`[SEERA DB GUARD] role=${target.role} fingerprint=${target.fingerprint}`);
  const suffix = Date.now();
  const executive1 = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const ss1Owner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-ss-owner@seera.test" } });
  const distributorOwner = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-distributor-owner@seera.test" } });
  const ss1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-SS-01" } });
  const distributor1 = await db.seeraPartner.findUniqueOrThrow({ where: { code: "IV26-D-01" } });
  const cakeSku = await db.seeraSku.findUniqueOrThrow({ where: { code: "SEERA-CAKE-BLUE" } });
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: executive1.id, distributorId: distributor1.id, mobile: { not: null } } });

  // ============= T1: claim + success -> PUBLISHED =============
  const q1 = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, actorId: executive1.id });
  assert(q1.queued && q1.outboxEventId, "expected T1 event to queue (retailer has a mobile on file)");
  const r1 = await dispatchRetailerCommunications(db, succeedingProvider, { limit: 50 });
  const t1Result = r1.find((x) => x.id === q1.outboxEventId);
  assert(t1Result?.status === "PUBLISHED", `expected T1 row to be PUBLISHED after a successful provider call, got ${t1Result?.status}`);
  const t1Row = await db.outboxEvent.findUniqueOrThrow({ where: { id: q1.outboxEventId! } });
  assert(t1Row.status === "PUBLISHED" && t1Row.publishedAt != null, "expected persisted row to be PUBLISHED with publishedAt set");
  console.log(`[T1] OK — claimed once, provider succeeded, row PUBLISHED (id=${t1Row.id})`);

  // ============= T2: failure -> FAILED with backoff (availableAt pushed to the future) =============
  const q2 = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, actorId: executive1.id });
  assert(q2.queued && q2.outboxEventId, "expected T2 event to queue");
  const before2 = new Date();
  await dispatchRetailerCommunications(db, failingProvider, { limit: 50 });
  const t2Row = await db.outboxEvent.findUniqueOrThrow({ where: { id: q2.outboxEventId! } });
  assert(t2Row.status === "FAILED", `expected T2 row to be FAILED after a provider throw, got ${t2Row.status}`);
  assert(t2Row.attempts === 1, `expected attempts=1 after first failure, got ${t2Row.attempts}`);
  assert(t2Row.lastErrorCode === "PROVIDER_CREDENTIALS_MISSING", `expected the real provider error to be recorded, got ${t2Row.lastErrorCode}`);
  assert(t2Row.availableAt.getTime() > before2.getTime(), "expected availableAt to be pushed into the future (backoff) after a failure, not left immediately retryable");
  console.log(`[T2] OK — provider threw, row FAILED (attempts=${t2Row.attempts}, retryable at ${t2Row.availableAt.toISOString()}) — no fake PUBLISHED`);

  // ============= T3: exhausted retries -> DEAD_LETTER =============
  const q3 = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, actorId: executive1.id });
  assert(q3.queued && q3.outboxEventId, "expected T3 event to queue");
  // Fast-forward this one row to one attempt short of the cap, immediately retryable, so this run's
  // dispatch pushes it over the edge — proves the terminal transition without waiting through 4
  // real backoff windows.
  await db.outboxEvent.update({ where: { id: q3.outboxEventId! }, data: { attempts: 4, availableAt: new Date() } });
  await dispatchRetailerCommunications(db, failingProvider, { limit: 50 });
  const t3Row = await db.outboxEvent.findUniqueOrThrow({ where: { id: q3.outboxEventId! } });
  assert(t3Row.status === "DEAD_LETTER", `expected T3 row to be DEAD_LETTER after exhausting retries, got ${t3Row.status}`);
  assert(t3Row.attempts === 5, `expected attempts=5 (MAX_ATTEMPTS) at dead-letter, got ${t3Row.attempts}`);
  const deadLetterAudit = await db.auditLog.findFirst({ where: { action: "outbox.dead_lettered", entityId: t3Row.id } });
  assert(!!deadLetterAudit, "expected a recordAudit entry for the dead-letter transition");
  console.log(`[T3] OK — retry cap reached, row DEAD_LETTER (attempts=${t3Row.attempts}), audited`);

  // A dead-lettered row must never be picked up again.
  const r3b = await dispatchRetailerCommunications(db, succeedingProvider, { limit: 50 });
  assert(!r3b.some((x) => x.id === t3Row.id), "expected a DEAD_LETTER row to never be re-selected for dispatch");
  console.log(`[T3b] OK — DEAD_LETTER row correctly excluded from future dispatch candidates`);

  // ============= T4: stale PROCESSING lock reclaimed =============
  const q4 = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, actorId: executive1.id });
  assert(q4.queued && q4.outboxEventId, "expected T4 event to queue");
  const staleLockTime = new Date(Date.now() - 10 * 60_000); // 10 minutes ago — older than the 5-minute stale threshold
  await db.outboxEvent.update({ where: { id: q4.outboxEventId! }, data: { status: "PROCESSING", lockedAt: staleLockTime } });
  const reclaimedCount = await reclaimStaleOutboxLocks(db, "SeeraRetailer");
  assert(reclaimedCount >= 1, `expected at least 1 stale lock reclaimed, got ${reclaimedCount}`);
  const t4Row = await db.outboxEvent.findUniqueOrThrow({ where: { id: q4.outboxEventId! } });
  assert(t4Row.status === "PENDING" && t4Row.lockedAt === null, `expected T4 row reclaimed back to PENDING, got status=${t4Row.status} lockedAt=${t4Row.lockedAt}`);
  const reclaimAudit = await db.auditLog.findFirst({ where: { action: "outbox.stale_lock_reclaimed" }, orderBy: { occurredAt: "desc" } });
  assert(!!reclaimAudit, "expected a recordAudit entry for the stale-lock reclaim batch");
  console.log(`[T4] OK — stale PROCESSING lock (10 min old) reclaimed back to PENDING, audited`);

  // ============= T5: a FRESH PROCESSING lock is left alone =============
  const q5 = await queueRetailerCommunication(db, { eventType: "FOLLOW_UP", retailerId: retailer.id, actorId: executive1.id });
  assert(q5.queued && q5.outboxEventId, "expected T5 event to queue");
  await db.outboxEvent.update({ where: { id: q5.outboxEventId! }, data: { status: "PROCESSING", lockedAt: new Date() } });
  await reclaimStaleOutboxLocks(db, "SeeraRetailer");
  const t5Row = await db.outboxEvent.findUniqueOrThrow({ where: { id: q5.outboxEventId! } });
  assert(t5Row.status === "PROCESSING", `expected a fresh (just-locked) PROCESSING row to be left alone, got ${t5Row.status}`);
  // And it must not be re-selected as a dispatch candidate while genuinely in-flight (proves the
  // no-double-publish guard at the query level, not just the atomic-claim level).
  const r5 = await dispatchRetailerCommunications(db, succeedingProvider, { limit: 50 });
  assert(!r5.some((x) => x.id === t5Row.id), "expected an actively-held PROCESSING row to never be re-selected by a concurrent/subsequent dispatch pass");
  console.log(`[T5] OK — fresh PROCESSING lock left alone by reclaim, and excluded from concurrent dispatch candidates (no double-publish surface)`);
  // Clean up T5's row so it doesn't linger PROCESSING forever in TEST data.
  await db.outboxEvent.update({ where: { id: q5.outboxEventId! }, data: { status: "PENDING", lockedAt: null } });

  // ============= T6: OUT_FOR_DELIVERY is RETAILER_ORDER-only, never for replenishment dispatch =============
  // STAGE 12: recordInventoryMovement's quantity is canonical physical PIECES; the "quantity: 1"
  // Distributor replenishment order below is 1 Box of Cake Blue = 40 physical pieces, so opening
  // stock must cover that (was "5" pre-Stage-12, when the ledger was still box-denominated).
  await recordInventoryMovement(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 50, sourceType: "SmokeTestOpening", sourceId: `p0b-ss-opening-${suffix}`, sourcePortal: "super-stockist", reason: "Pass 0B smoke opening stock", idempotencyKey: `p0b-ss-opening-${suffix}` });
  const replenOrder = await createDistributorReplenishment(db, distributorOwner.id, distributor1.id, { idempotencyKey: `p0b-do-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 1 }] });
  await acceptAndAllocateDistributorOrder(db, ss1Owner.id, ss1.id, { orderId: replenOrder.id, decision: "ACCEPT", lines: [{ lineId: replenOrder.lines[0]!.id, quantity: 1 }], idempotencyKey: `p0b-accept-${suffix}` });
  const beforeSsDispatch = await db.outboxEvent.count({ where: { aggregateType: "SeeraRetailer", eventType: "OUT_FOR_DELIVERY" } });
  await dispatchAllocatedOrder(db, ss1Owner.id, { partyType: "SUPER_STOCKIST", partyId: ss1.id, orderId: replenOrder.id, idempotencyKey: `p0b-ss-dispatch-${suffix}` });
  const afterSsDispatch = await db.outboxEvent.count({ where: { aggregateType: "SeeraRetailer", eventType: "OUT_FOR_DELIVERY" } });
  assert(afterSsDispatch === beforeSsDispatch, `expected S.S.->Distributor dispatch to queue ZERO retailer OUT_FOR_DELIVERY events, count went from ${beforeSsDispatch} to ${afterSsDispatch}`);
  console.log(`[T6a] OK — S.S.->Distributor replenishment dispatch queued no retailer OUT_FOR_DELIVERY event (correctly scoped)`);

  await recordInventoryMovement(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, skuId: cakeSku.id, type: "OPENING", direction: "IN", quantity: 2, sourceType: "SmokeTestOpening", sourceId: `p0b-dist-opening-${suffix}`, sourcePortal: "distributor", reason: "Pass 0B smoke opening stock", idempotencyKey: `p0b-dist-opening-${suffix}` });
  const retailOrder = await placeRetailerOrder(
    db,
    { actorId: executive1.id, sourcePortal: "sales-executive", commercialPartyType: "DISTRIBUTOR", commercialPartyId: distributor1.id },
    { retailerId: retailer.id, idempotencyKey: `p0b-ro-${suffix}`, lines: [{ skuId: cakeSku.id, quantity: 1, rate: 60 }] },
  );
  await fulfilRetailerOrder(db, distributorOwner.id, distributor1.id, { orderId: retailOrder.id, accepted: [{ lineId: retailOrder.lines[0]!.id, quantity: 1 }], action: "ACCEPT" });
  await allocateOrderStock(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, lines: [{ lineId: retailOrder.lines[0]!.id, quantity: 1 }], idempotencyKey: `p0b-ro-alloc-${suffix}` });
  await dispatchAllocatedOrder(db, distributorOwner.id, { partyType: "DISTRIBUTOR", partyId: distributor1.id, orderId: retailOrder.id, idempotencyKey: `p0b-ro-dispatch-${suffix}` });
  const outForDeliveryEvent = await db.outboxEvent.findFirst({ where: { aggregateType: "SeeraRetailer", aggregateId: retailer.id, eventType: "OUT_FOR_DELIVERY" }, orderBy: { createdAt: "desc" } });
  assert(!!outForDeliveryEvent, "expected a real OUT_FOR_DELIVERY event to queue for a genuine Distributor->Retailer dispatch");
  console.log(`[T6b] OK — Distributor->Retailer dispatch correctly queued OUT_FOR_DELIVERY (id=${outForDeliveryEvent!.id})`);

  console.log("\nALL PRE-LAUNCH PASS 0B OUTBOX-WORKER SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
