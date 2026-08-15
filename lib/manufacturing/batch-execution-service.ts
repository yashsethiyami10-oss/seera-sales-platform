import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { mfgNumberFor } from "./numbering";
import { postMaterialMovementInTx, assertSufficientStock } from "./ledger-service";
import { releaseOrderReservations } from "./production-order-service";

// Two-step material issue (spec §21): Store confirms actual issued qty/lot,
// moving RAW STORE -> WIP physically (not yet "consumed"). Optional — the
// one-step recordDailyProduction below covers simpler operations directly.
export async function issueToProduction(db: PrismaClient, actorId: string, input: { productionOrderId: string; materialId: string; lotId?: string; quantity: number; unit: string; canonicalQuantity: number; fromLocationId: string; toLocationId: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_batch:execute" });
  await assertSufficientStock(db, input.materialId, input.canonicalQuantity, input.lotId);
  return db.$transaction(async (tx) => {
    const movement = await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: "PRODUCTION_ISSUE", direction: "OUT", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, sourceType: "SeeraProductionOrder", sourceId: input.productionOrderId, reason: "Material issued to production", idempotencyKey: `${input.idempotencyKey}:movement` });
    const event = await tx.seeraProductionMaterialEvent.create({ data: { kind: "ISSUE", productionOrderId: input.productionOrderId, materialId: input.materialId, lotId: input.lotId, quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, actorId, movementId: movement.id, idempotencyKey: input.idempotencyKey } });
    await recordAudit(tx, { actorId, action: "mfg.material.issued", entityType: "SeeraProductionMaterialEvent", entityId: event.id, afterState: { materialId: input.materialId, canonicalQuantity: input.canonicalQuantity } });
    return event;
  });
}

export async function returnUnusedMaterial(db: PrismaClient, actorId: string, input: { productionOrderId: string; materialId: string; lotId?: string; quantity: number; unit: string; canonicalQuantity: number; toLocationId: string; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_batch:execute" });
  if (!input.reason.trim()) throw new FoundationError("RETURN_REASON_REQUIRED", "A reason is required for a material return", 400);
  return db.$transaction(async (tx) => {
    const movement = await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: "PRODUCTION_RETURN", direction: "IN", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, toLocationId: input.toLocationId, sourceType: "SeeraProductionOrder", sourceId: input.productionOrderId, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:movement` });
    const event = await tx.seeraProductionMaterialEvent.create({ data: { kind: "RETURN", productionOrderId: input.productionOrderId, materialId: input.materialId, lotId: input.lotId, quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, toLocationId: input.toLocationId, reason: input.reason, actorId, movementId: movement.id, idempotencyKey: input.idempotencyKey } });
    await recordAudit(tx, { actorId, action: "mfg.material.returned", entityType: "SeeraProductionMaterialEvent", entityId: event.id, afterState: { materialId: input.materialId, canonicalQuantity: input.canonicalQuantity } });
    return event;
  });
}

// THE core daily workflow (spec §19/§20). One confirm does everything:
// theoretical consumption from the active BOM (batches x BOM line), packaging
// consumption from ACTUAL packed output (not theoretical batch input, per
// spec §12), a new traceable batch record, yield computation, and a
// finished-goods receipt that stays QC-PENDING (not yet available — see
// qc-service.ts for the release gate). Retry-safe end to end.
export async function recordDailyProduction(
  db: PrismaClient,
  actorId: string,
  input: { productionOrderId: string; date: Date; batchCount: number; actualOutputQuantity: number; outputUnit: string; shiftId?: string; machineId?: string; supervisorId?: string; operatorIds?: string[]; finishedGoodsLocationId: string; rawStoreLocationId: string; packagingStoreLocationId: string; idempotencyKey: string },
) {
  await authorize(db, { actorId, permission: "mfg_batch:execute" });
  // Idempotency MUST be checked before any state-dependent guard below: this
  // very call is what can flip the order out of READY/IN_PROGRESS (into
  // AWAITING_QC, when it completes the order's last batch) — a network retry
  // of that exact same request must still succeed harmlessly by returning the
  // batch already created, not fail against a status the first successful
  // attempt itself produced.
  const existingBatch = await db.seeraProductionBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingBatch) return existingBatch;
  if (input.batchCount <= 0) throw new FoundationError("INVALID_BATCH_COUNT", "Batch count must be positive", 400);
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: input.productionOrderId } });
  if (!["READY", "IN_PROGRESS"].includes(order.status)) throw new FoundationError("ORDER_NOT_READY", "Production order must be READY or IN_PROGRESS to record production", 409);
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: order.bomId }, include: { lines: true } });
  const packagingBom = order.packagingBomId ? await db.seeraPackagingBom.findUnique({ where: { id: order.packagingBomId }, include: { lines: true } }) : null;

  return db.$transaction(async (tx) => {
    const batch = await tx.seeraProductionBatch.create({
      data: { batchNumber: mfgNumberFor("BATCH", input.idempotencyKey), productionOrderId: order.id, productSkuId: order.productSkuId, bomId: order.bomId, bomVersion: order.bomVersion, sopId: order.sopId, date: input.date, shiftId: input.shiftId, machineId: input.machineId, supervisorId: input.supervisorId, operatorIds: input.operatorIds ?? [], plannedQuantity: Number(bom.standardBatchSize) * input.batchCount, actualOutputQuantity: input.actualOutputQuantity, status: "AWAITING_QC", qcStatus: "PENDING", idempotencyKey: input.idempotencyKey },
    });

    // Theoretical raw-material consumption: release the RESERVE made at
    // reserveOrderMaterials time and post the matching physical OUT — this is
    // the AUTO-CONSUME STANDARD path (spec §20); recordActualConsumption
    // below is the correction path when real measurement differs.
    for (const bl of bom.lines) {
      const theoretical = Number(bl.canonicalQuantity) * input.batchCount;
      const release = await postMaterialMovementInTx(tx, actorId, { materialId: bl.materialId, movementType: "PRODUCTION_ISSUE", direction: "RELEASE", quantity: theoretical, unit: bl.unit, canonicalQuantity: theoretical, sourceType: "SeeraProductionOrder", sourceId: order.id, reason: `Consumption for batch ${batch.batchNumber}`, idempotencyKey: `${input.idempotencyKey}:release:${bl.materialId}` });
      void release;
      const consumeMovement = await postMaterialMovementInTx(tx, actorId, { materialId: bl.materialId, movementType: "PRODUCTION_CONSUMPTION", direction: "OUT", quantity: theoretical, unit: bl.unit, canonicalQuantity: theoretical, fromLocationId: input.rawStoreLocationId, sourceType: "SeeraProductionBatch", sourceId: batch.id, reason: `Consumed for batch ${batch.batchNumber}`, idempotencyKey: `${input.idempotencyKey}:consume:${bl.materialId}` });
      await tx.seeraProductionMaterialEvent.create({ data: { kind: "CONSUMPTION", productionOrderId: order.id, batchId: batch.id, materialId: bl.materialId, theoreticalQuantity: theoretical, quantity: theoretical, unit: bl.unit, canonicalQuantity: theoretical, fromLocationId: input.rawStoreLocationId, actorId, movementId: consumeMovement.id, idempotencyKey: `${input.idempotencyKey}:event:${bl.materialId}` } });
    }

    // Packaging consumption from ACTUAL packed output, not theoretical batch
    // input (spec §12/§19 step 3) — genuinely separate calculation basis.
    if (packagingBom) {
      for (const pl of packagingBom.lines) {
        const requiredCanonical = Number(pl.canonicalQuantity) * input.actualOutputQuantity;
        const packMovement = await postMaterialMovementInTx(tx, actorId, { materialId: pl.materialId, movementType: "PRODUCTION_CONSUMPTION", direction: "OUT", quantity: requiredCanonical, unit: pl.unit, canonicalQuantity: requiredCanonical, fromLocationId: input.packagingStoreLocationId, sourceType: "SeeraProductionBatch", sourceId: batch.id, reason: `Packaging consumed for batch ${batch.batchNumber}`, idempotencyKey: `${input.idempotencyKey}:pack:${pl.materialId}` });
        await tx.seeraProductionMaterialEvent.create({ data: { kind: "CONSUMPTION", productionOrderId: order.id, batchId: batch.id, materialId: pl.materialId, theoreticalQuantity: requiredCanonical, quantity: requiredCanonical, unit: pl.unit, canonicalQuantity: requiredCanonical, fromLocationId: input.packagingStoreLocationId, actorId, movementId: packMovement.id, idempotencyKey: `${input.idempotencyKey}:packevent:${pl.materialId}` } });
      }
    }

    const expectedOutput = bom.expectedOutput ? Number(bom.expectedOutput) * input.batchCount : Number(bom.standardBatchSize) * input.batchCount;
    const yieldPct = expectedOutput > 0 ? Math.round((input.actualOutputQuantity / expectedOutput) * 10000) / 100 : null;
    const updatedBatch = await tx.seeraProductionBatch.update({ where: { id: batch.id }, data: { yieldPct } });

    // Finished-goods receipt record — stays QC-PENDING; it does NOT post to
    // the Company inventory ledger yet (see qc-service.ts's releaseBatch).
    const fgReceipt = await tx.seeraFinishedGoodsReceipt.create({ data: { batchId: batch.id, productSkuId: order.productSkuId, quantity: input.actualOutputQuantity, unit: input.outputUnit as never, locationId: input.finishedGoodsLocationId, qcStatus: "PENDING", idempotencyKey: `${input.idempotencyKey}:fg` } });

    const remainingBatches = order.plannedBatches - (await tx.seeraProductionBatch.count({ where: { productionOrderId: order.id } }));
    await tx.seeraProductionOrder.update({ where: { id: order.id }, data: { status: remainingBatches > 0 ? "IN_PROGRESS" : "AWAITING_QC" } });

    await recordAudit(tx, { actorId, action: "mfg.batch.recorded", entityType: "SeeraProductionBatch", entityId: batch.id, afterState: { batchNumber: batch.batchNumber, actualOutputQuantity: input.actualOutputQuantity, yieldPct } });
    return { ...updatedBatch, fgReceiptId: fgReceipt.id };
  });
}

// Correction path (spec §20): record what was ACTUALLY measured for one
// material against a batch already recorded at theoretical consumption —
// posts the compensating movement (extra OUT if more was used, IN/return if
// less) and updates the event + computes variance, never silently rewrites
// the original theoretical entry.
export async function recordActualConsumption(db: PrismaClient, actorId: string, input: { batchId: string; materialId: string; actualQuantity: number; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_batch:execute" });
  const event = await db.seeraProductionMaterialEvent.findFirst({ where: { batchId: input.batchId, materialId: input.materialId, kind: "CONSUMPTION" } });
  if (!event) throw new FoundationError("CONSUMPTION_EVENT_NOT_FOUND", "No consumption event found for this batch/material", 404);
  const theoretical = Number(event.theoreticalQuantity ?? event.quantity);
  const delta = input.actualQuantity - theoretical;
  if (delta === 0) return { event, variance: 0 };
  return db.$transaction(async (tx) => {
    if (delta > 0) {
      await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, movementType: "PRODUCTION_CONSUMPTION", direction: "OUT", quantity: delta, unit: event.unit, canonicalQuantity: delta, fromLocationId: event.fromLocationId ?? undefined, sourceType: "SeeraProductionBatch", sourceId: input.batchId, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:extra` });
    } else {
      await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, movementType: "PRODUCTION_RETURN", direction: "IN", quantity: -delta, unit: event.unit, canonicalQuantity: -delta, toLocationId: event.fromLocationId ?? undefined, sourceType: "SeeraProductionBatch", sourceId: input.batchId, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:excess-return` });
    }
    const updated = await tx.seeraProductionMaterialEvent.update({ where: { id: event.id }, data: { quantity: input.actualQuantity, canonicalQuantity: input.actualQuantity } });
    await recordAudit(tx, { actorId, action: "mfg.consumption.corrected", entityType: "SeeraProductionMaterialEvent", entityId: event.id, beforeState: { theoretical }, afterState: { actual: input.actualQuantity, variance: delta, reason: input.reason } });
    return { event: updated, variance: delta };
  });
}

export async function batchDetail(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const [batch, events, qc, fgReceipt, wastage] = await Promise.all([
    db.seeraProductionBatch.findUniqueOrThrow({ where: { id: batchId } }),
    db.seeraProductionMaterialEvent.findMany({ where: { batchId } }),
    db.seeraBatchQc.findMany({ where: { batchId } }),
    db.seeraFinishedGoodsReceipt.findUnique({ where: { batchId } }),
    db.seeraWastageRecord.findMany({ where: { batchId } }),
  ]);
  const consumptionVariance = events.filter((e) => e.kind === "CONSUMPTION").map((e) => ({ materialId: e.materialId, theoretical: Number(e.theoreticalQuantity ?? 0), actual: Number(e.canonicalQuantity), variance: Number(e.canonicalQuantity) - Number(e.theoreticalQuantity ?? 0) }));
  return { batch, events, qc, fgReceipt, wastage, consumptionVariance };
}

export { releaseOrderReservations };
