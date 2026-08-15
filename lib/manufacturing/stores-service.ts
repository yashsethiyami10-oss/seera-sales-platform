import type { StockAdjustmentDirection, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { mfgNumberFor } from "./numbering";
import { assertSufficientStock, postMaterialMovementInTx } from "./ledger-service";

// Stock Transfer (spec §38) — atomic balanced movement, no quantity
// created/destroyed: one OUT + one IN, both referencing the same transfer.
export async function transferStock(db: PrismaClient, actorId: string, input: { materialId: string; lotId?: string; quantity: number; unit: string; canonicalQuantity: number; fromLocationId: string; toLocationId: string; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_stock_transfer:manage" });
  if (input.fromLocationId === input.toLocationId) throw new FoundationError("TRANSFER_SAME_LOCATION", "Source and destination must differ", 400);
  await assertSufficientStock(db, input.materialId, input.canonicalQuantity, input.lotId);
  return db.$transaction(async (tx) => {
    const transfer = await tx.seeraStockTransfer.create({ data: { transferNumber: mfgNumberFor("TRF", input.idempotencyKey), materialId: input.materialId, lotId: input.lotId, quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, reason: input.reason, actorId, idempotencyKey: input.idempotencyKey } });
    await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: "TRANSFER_OUT", direction: "OUT", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, fromLocationId: input.fromLocationId, sourceType: "SeeraStockTransfer", sourceId: transfer.id, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:out` });
    await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: "TRANSFER_IN", direction: "IN", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, toLocationId: input.toLocationId, sourceType: "SeeraStockTransfer", sourceId: transfer.id, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:in` });
    await recordAudit(tx, { actorId, action: "mfg.stock.transferred", entityType: "SeeraStockTransfer", entityId: transfer.id, afterState: { materialId: input.materialId, canonicalQuantity: input.canonicalQuantity } });
    return transfer;
  });
}

// Manual adjustment — exception only (spec §39), never the primary daily
// workflow; reason mandatory, threshold-based approval reuses the generic
// SeeraApprovalItem queue (see approval-policy-service.ts).
export async function adjustStock(db: PrismaClient, actorId: string, input: { materialId: string; lotId?: string; direction: StockAdjustmentDirection; quantity: number; unit: string; canonicalQuantity: number; locationId: string; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_stock_adjustment:manage" });
  if (!input.reason.trim()) throw new FoundationError("ADJUSTMENT_REASON_REQUIRED", "A reason is required for a stock adjustment", 400);
  if (input.direction === "DECREASE") await assertSufficientStock(db, input.materialId, input.canonicalQuantity, input.lotId);
  return db.$transaction(async (tx) => {
    const adjustment = await tx.seeraStockAdjustment.create({ data: { adjustmentNumber: mfgNumberFor("ADJ", input.idempotencyKey), materialId: input.materialId, lotId: input.lotId, direction: input.direction, quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, locationId: input.locationId, reason: input.reason, actorId, idempotencyKey: input.idempotencyKey } });
    await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: input.direction === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT", direction: input.direction === "INCREASE" ? "IN" : "OUT", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, toLocationId: input.direction === "INCREASE" ? input.locationId : undefined, fromLocationId: input.direction === "DECREASE" ? input.locationId : undefined, sourceType: "SeeraStockAdjustment", sourceId: adjustment.id, reason: input.reason, idempotencyKey: `${input.idempotencyKey}:movement` });
    await recordAudit(tx, { actorId, action: "mfg.stock.adjusted", entityType: "SeeraStockAdjustment", entityId: adjustment.id, afterState: { direction: input.direction, canonicalQuantity: input.canonicalQuantity, reason: input.reason } });
    return adjustment;
  });
}

// Physical Stock Count (spec §40) — never overwrites inventory directly;
// variance is reviewed then converted into a governed adjustment movement.
export async function startStockCount(db: PrismaClient, actorId: string, input: { locationId: string; date: Date; idempotencyKey: string; materialIds: string[] }) {
  await authorize(db, { actorId, permission: "mfg_stock_count:manage" });
  const { materialStockPosition } = await import("./ledger-service");
  const lines = await Promise.all(input.materialIds.map(async (materialId) => { const position = await materialStockPosition(db, materialId); return { materialId, systemQuantity: position.physical, physicalQuantity: position.physical, varianceQuantity: 0 }; }));
  const count = await db.seeraStockCount.create({ data: { countNumber: mfgNumberFor("CNT", input.idempotencyKey), locationId: input.locationId, date: input.date, status: "DRAFT", actorId, lines: { create: lines } }, include: { lines: true } });
  await recordAudit(db, { actorId, action: "mfg.stock_count.started", entityType: "SeeraStockCount", entityId: count.id, afterState: { locationId: input.locationId, lines: lines.length } });
  return count;
}

export async function recordStockCountLine(db: PrismaClient, actorId: string, lineId: string, physicalQuantity: number) {
  await authorize(db, { actorId, permission: "mfg_stock_count:manage" });
  const line = await db.seeraStockCountLine.findUniqueOrThrow({ where: { id: lineId } });
  return db.seeraStockCountLine.update({ where: { id: lineId }, data: { physicalQuantity, varianceQuantity: physicalQuantity - Number(line.systemQuantity) } });
}

export async function approveStockCount(db: PrismaClient, actorId: string, countId: string) {
  await authorize(db, { actorId, permission: "mfg_stock_count:manage" });
  const count = await db.seeraStockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: true } });
  if (count.status !== "DRAFT" && count.status !== "REVIEWED") throw new FoundationError("STOCK_COUNT_NOT_ELIGIBLE", "Stock count already closed", 409);
  return db.$transaction(async (tx) => {
    for (const line of count.lines) {
      const variance = Number(line.varianceQuantity);
      if (variance === 0) continue;
      const material = await tx.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: line.materialId } });
      const movement = await postMaterialMovementInTx(tx, actorId, { materialId: line.materialId, lotId: line.lotId ?? undefined, movementType: "STOCK_COUNT_CORRECTION", direction: variance > 0 ? "IN" : "OUT", quantity: Math.abs(variance), unit: material.baseUnit, canonicalQuantity: Math.abs(variance), toLocationId: variance > 0 ? count.locationId : undefined, fromLocationId: variance < 0 ? count.locationId : undefined, sourceType: "SeeraStockCount", sourceId: count.id, reason: line.reason || "Stock count correction", idempotencyKey: `${count.countNumber}:${line.id}:correction` });
      await tx.seeraStockCountLine.update({ where: { id: line.id }, data: { adjustmentMovementId: movement.id } });
    }
    const updated = await tx.seeraStockCount.update({ where: { id: countId }, data: { status: "CLOSED" } });
    await recordAudit(tx, { actorId, action: "mfg.stock_count.approved", entityType: "SeeraStockCount", entityId: countId, afterState: { correctedLines: count.lines.filter((l) => Number(l.varianceQuantity) !== 0).length } });
    return updated;
  });
}

export async function listStockCounts(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraStockCount.findMany({ orderBy: { date: "desc" }, include: { lines: true } });
}
