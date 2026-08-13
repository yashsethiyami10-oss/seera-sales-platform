import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
import { startFieldDay, endFieldDay, placeRetailerOrder } from "../../lib/sales-distribution/workflow-service";
import { executiveCheckIn, executiveCheckOut } from "../../lib/sales-distribution/field-portal-service";
import { syncOfflineOperation } from "../../lib/phase-11/offline-sync-service";
import { FoundationError } from "../../lib/foundation/errors";

// STAGE 1A P0 smoke test — Sales Executive:
//  1. Start Day double-submit: proves the SERVER-SIDE floor holds even if a client-side race somehow
//     fires two startFieldDay calls concurrently (defense in depth alongside the already-fixed
//     client-side busy-state-before-GPS-await guard in FieldJourney.tsx).
//  2. Offline Sync Now: proves syncOfflineOperation (the real function /api/offline/sync calls)
//     actually performs a canonical write for a real offline-queued action, and that re-syncing the
//     SAME clientOperationId is idempotent (no duplicate order/movement) — the two properties the
//     Founder needs proven, not just present in source.
// Safe to re-run: uses a fresh idempotencyKey/clientOperationId suffix each run and cleans up any
// dangling session first.

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
  const exec = await db.user.findUniqueOrThrow({ where: { normalizedEmail: "review-sales-executive-1@seera.test" } });
  const suffix = Date.now();

  // Clean up any dangling open visit/session from a prior interrupted run.
  const openVisit = await db.seeraVisit.findFirst({ where: { workSession: { employeeId: exec.id, status: "ACTIVE" }, checkedOutAt: null } });
  if (openVisit) await executiveCheckOut(db, exec.id, openVisit.id, { outcome: "NO_ORDER", noOrderReason: "Smoke cleanup", photoExceptionReason: "OTHER" }).catch(() => {});
  const dangling = await db.seeraWorkSession.findFirst({ where: { employeeId: exec.id, status: "ACTIVE" } });
  if (dangling) await endFieldDay(db, exec.id, dangling.id, { outcome: "COMPLETED" });

  // ============= TEST 1: Start Day double-submit — server-side floor =============
  const startInput = { employeeRole: "SALES_EXECUTIVE" as const, workingType: "RETAILING", remarks: `Stage 1A P0 smoke ${suffix}` };
  const [resultA, resultB] = await Promise.allSettled([
    startFieldDay(db, exec.id, startInput),
    startFieldDay(db, exec.id, startInput),
  ]);
  const succeeded = [resultA, resultB].filter((r) => r.status === "fulfilled");
  const failed = [resultA, resultB].filter((r) => r.status === "rejected");
  assert(succeeded.length === 1, `expected exactly ONE of two concurrent Start Day calls to succeed, got ${succeeded.length}`);
  assert(failed.length === 1, `expected exactly ONE of two concurrent Start Day calls to fail, got ${failed.length}`);
  const rejection = (failed[0] as PromiseRejectedResult).reason;
  assert(rejection instanceof FoundationError && rejection.code === "ACTIVE_WORKDAY_EXISTS", `expected the losing call to fail cleanly with ACTIVE_WORKDAY_EXISTS, got ${rejection}`);
  const activeSessions = await db.seeraWorkSession.count({ where: { employeeId: exec.id, status: "ACTIVE" } });
  assert(activeSessions === 1, `expected exactly 1 active work session after the race, found ${activeSessions} (would mean duplicate Start Day)`);
  console.log("[T1] OK — concurrent Start Day double-submit: exactly one session created, loser rejected cleanly with ACTIVE_WORKDAY_EXISTS, no duplicate in DB");

  const session = (succeeded[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof startFieldDay>>>).value;

  // ============= TEST 2: Offline Sync Now — real canonical write + idempotency =============
  const retailer = await db.seeraRetailer.findFirstOrThrow({ where: { lifecycle: "ACTIVE", salespersonId: exec.id, distributorId: { not: null } } });
  const visit = await executiveCheckIn(db, exec.id, { workSessionId: session.id, retailerId: retailer.id, idempotencyKey: `stage1a-p0-checkin-${suffix}` });

  const clientOperationId = randomUUID();
  const offlinePayload = {
    clientOperationId,
    deviceId: `stage1a-p0-device-${suffix}`,
    sessionContext: { sessionId: `stage1a-p0-session-${suffix}`, appVersion: "1.0.0-smoke", platform: "android" },
    entityType: "SeeraVisit",
    actionType: "VISIT_CHECK_OUT" as const,
    localCreatedAt: new Date().toISOString(),
    payloadVersion: 1 as const,
    payload: { visitId: visit.id, outcome: "NO_ORDER", noOrderReason: "Offline sync smoke test", photoExceptionReason: "OTHER" },
  };

  const firstSync = await syncOfflineOperation(db, exec.id, offlinePayload);
  assert(firstSync.status === "SYNCED", `expected first sync to reach SYNCED, got ${firstSync.status}`);
  const visitAfterFirstSync = await db.seeraVisit.findUniqueOrThrow({ where: { id: visit.id } });
  assert(visitAfterFirstSync.checkedOutAt !== null, "expected the offline-queued checkout to actually apply the real canonical write (checkedOutAt set)");
  console.log(`[T2a] OK — Sync Now performed a real canonical write (visit ${visit.id} checked out via offline queue, not simulated)`);

  const secondSync = await syncOfflineOperation(db, exec.id, offlinePayload);
  assert(secondSync.id === firstSync.id && secondSync.status === "SYNCED", "expected re-syncing the SAME clientOperationId to be idempotent (same record, still SYNCED, no duplicate/second write)");
  const offlineOpCount = await db.seeraOfflineOperation.count({ where: { userId: exec.id, clientOperationId } });
  assert(offlineOpCount === 1, `expected exactly 1 SeeraOfflineOperation row for this clientOperationId (idempotent), found ${offlineOpCount}`);
  console.log("[T2b] OK — re-syncing the same clientOperationId is idempotent: same record returned, no duplicate write, no duplicate offline-operation row");

  // Also prove an ORDER_DRAFT offline action produces exactly one real order, not a duplicate.
  const seeraSku = await db.seeraSku.findFirstOrThrow({ where: { brand: "Seera", status: "ACTIVE" } });
  const orderClientOpId = randomUUID();
  const orderPayload = {
    clientOperationId: orderClientOpId,
    deviceId: `stage1a-p0-device-${suffix}`,
    sessionContext: { sessionId: `stage1a-p0-session-${suffix}`, appVersion: "1.0.0-smoke", platform: "android" },
    entityType: "SeeraSalesOrder",
    actionType: "ORDER_DRAFT" as const,
    localCreatedAt: new Date().toISOString(),
    payloadVersion: 1 as const,
    payload: { retailerId: retailer.id, commercialPartyId: retailer.distributorId, lines: [{ skuId: seeraSku.id, quantity: 1, rate: 50 }] },
  };
  await syncOfflineOperation(db, exec.id, orderPayload);
  await syncOfflineOperation(db, exec.id, orderPayload); // re-sync same id, must not duplicate
  const orderCount = await db.seeraSalesOrder.count({ where: { idempotencyKey: orderClientOpId } });
  assert(orderCount === 1, `expected exactly 1 order for this offline ORDER_DRAFT clientOperationId even after re-sync, found ${orderCount}`);
  console.log("[T2c] OK — offline ORDER_DRAFT synced to exactly one real retailer order, re-sync did not duplicate it");

  await endFieldDay(db, exec.id, session.id, { outcome: "COMPLETED" });
  console.log("\nALL STAGE 1A P0 (START DAY DOUBLE-SUBMIT + SYNC NOW) SMOKE CHECKS PASSED");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
