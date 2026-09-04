import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { mfgNumberFor } from "./numbering";
import { activeBomFor } from "./bom-service";
import { activeSopFor } from "./sop-service";
import { activePackagingBomFor } from "./packaging-bom-service";
import { materialStockPosition, postMaterialMovementInTx } from "./ledger-service";

// Production Order (spec §17) — snapshots BOM/SOP version at creation so
// later BOM changes never retroactively alter this order's requirement.
export async function createProductionOrder(db: PrismaClient, actorId: string, input: { productSkuId: string; plannedBatches: number; plannedOutput: number; productionDate: Date; shiftId?: string; machineId?: string; supervisorId?: string; priority?: string; planLineId?: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_order:manage" });
  const bom = await activeBomFor(db, input.productSkuId);
  if (!bom) throw new FoundationError("BOM_SOP_NOT_CONFIGURED", "BOM / SOP NOT CONFIGURED — no active BOM exists for this product", 409);
  const sop = await activeSopFor(db, input.productSkuId);
  const packagingBom = await activePackagingBomFor(db, input.productSkuId);
  const existing = await db.seeraProductionOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const order = await db.seeraProductionOrder.create({
    data: { orderNumber: mfgNumberFor("PO", input.idempotencyKey), productSkuId: input.productSkuId, plannedBatches: input.plannedBatches, plannedOutput: input.plannedOutput, bomId: bom.id, bomVersion: bom.version, packagingBomId: packagingBom?.id, sopId: sop?.id, productionDate: input.productionDate, shiftId: input.shiftId, machineId: input.machineId, supervisorId: input.supervisorId, priority: input.priority ?? "NORMAL", status: "DRAFT", planLineId: input.planLineId, createdById: actorId, idempotencyKey: input.idempotencyKey },
  });
  await recordAudit(db, { actorId, action: "mfg.production_order.created", entityType: "SeeraProductionOrder", entityId: order.id, afterState: { productSkuId: input.productSkuId, bomVersion: bom.version, plannedBatches: input.plannedBatches } });
  return order;
}

export async function approveProductionOrder(db: PrismaClient, actorId: string, orderId: string) {
  await authorize(db, { actorId, permission: "mfg_order:manage" });
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "DRAFT") throw new FoundationError("ORDER_NOT_DRAFT", "Only a draft order can be approved", 409);
  const updated = await db.seeraProductionOrder.update({ where: { id: orderId }, data: { status: "APPROVED" } });
  await recordAudit(db, { actorId, action: "mfg.production_order.approved", entityType: "SeeraProductionOrder", entityId: orderId });
  return updated;
}

// Material Availability Gate (spec §18) — READY only if every required
// material has enough available stock; never allows reservation past what's
// physically available.
export async function materialAvailabilityGate(db: PrismaClient, orderId: string) {
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: order.bomId }, include: { lines: true } });
  const rows = await Promise.all(
    bom.lines.map(async (bl) => {
      const required = Number(bl.canonicalQuantity) * order.plannedBatches;
      const position = await materialStockPosition(db, bl.materialId);
      return { materialId: bl.materialId, required, available: position.available, shortage: Math.max(0, required - position.available) };
    }),
  );
  const ready = rows.every((r) => r.shortage === 0);
  return { ready, rows };
}

export async function reserveOrderMaterials(db: PrismaClient, actorId: string, orderId: string) {
  await authorize(db, { actorId, permission: "mfg_order:manage" });
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "APPROVED") throw new FoundationError("ORDER_NOT_APPROVED", "Order must be approved before reserving material", 409);
  const gate = await materialAvailabilityGate(db, orderId);
  if (!gate.ready) throw new FoundationError("MATERIAL_SHORTAGE", "Insufficient material to reserve this order", 409, { rows: gate.rows });
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: order.bomId }, include: { lines: true } });
  // Final Integration mission, Part W — same bare-5000ms-timeout bug class found (and fixed) 5
  // times already this session: a loop posting one material movement per BOM line, real work
  // that scales with recipe size and can legitimately exceed 5s. Production is currently unused
  // in real production (0 rows) — hardening this before real usage begins.
  return db.$transaction(async (tx) => {
    for (const bl of bom.lines) {
      const quantity = Number(bl.canonicalQuantity) * order.plannedBatches;
      await postMaterialMovementInTx(tx, actorId, { materialId: bl.materialId, movementType: "PRODUCTION_ISSUE", direction: "RESERVE", quantity, unit: bl.unit, canonicalQuantity: quantity, sourceType: "SeeraProductionOrder", sourceId: order.id, reason: `Reserved for production order ${order.orderNumber}`, idempotencyKey: `${order.idempotencyKey}:reserve:${bl.materialId}` });
    }
    const updated = await tx.seeraProductionOrder.update({ where: { id: orderId }, data: { status: "READY" } });
    await recordAudit(tx, { actorId, action: "mfg.production_order.reserved", entityType: "SeeraProductionOrder", entityId: orderId, afterState: { lines: bom.lines.length } });
    return updated;
  }, { timeout: 15_000 });
}

async function releaseOrderReservations(db: PrismaClient, actorId: string, orderId: string) {
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  const reserveMovements = await db.seeraManufacturingMovement.findMany({ where: { sourceType: "SeeraProductionOrder", sourceId: order.id, direction: "RESERVE" } });
  const releaseMovements = await db.seeraManufacturingMovement.findMany({ where: { sourceType: "SeeraProductionOrder", sourceId: order.id, direction: "RELEASE" } });
  const releasedKeys = new Set(releaseMovements.map((m) => m.idempotencyKey.replace(":release", ":reserve")));
  return db.$transaction(async (tx) => {
    for (const m of reserveMovements) {
      const reserveKey = m.idempotencyKey;
      if (releasedKeys.has(reserveKey)) continue;
      await postMaterialMovementInTx(tx, actorId, { materialId: m.materialId, movementType: m.movementType, direction: "RELEASE", quantity: Number(m.quantity), unit: m.unit, canonicalQuantity: Number(m.canonicalQuantity), sourceType: "SeeraProductionOrder", sourceId: order.id, reason: `Reservation released for order ${order.orderNumber}`, idempotencyKey: `${reserveKey}:release` });
    }
  }, { timeout: 15_000 });
}

// Cancellation (spec §63) — releases reservations, never deletes history;
// already-issued material must be returned separately (batch-execution-service).
export async function cancelProductionOrder(db: PrismaClient, actorId: string, orderId: string, reason: string) {
  await authorize(db, { actorId, permission: "mfg_order:manage" });
  if (!reason.trim()) throw new FoundationError("CANCEL_REASON_REQUIRED", "A reason is required to cancel a production order", 400);
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new FoundationError("ORDER_NOT_CANCELLABLE", "Order cannot be cancelled from its current status", 409);
  await releaseOrderReservations(db, actorId, orderId);
  const updated = await db.seeraProductionOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  await recordAudit(db, { actorId, action: "mfg.production_order.cancelled", entityType: "SeeraProductionOrder", entityId: orderId, afterState: { reason } });
  return updated;
}

export { releaseOrderReservations };

export async function listProductionOrders(db: PrismaClient, actorId: string, filter?: { status?: string; productionDate?: Date }) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraProductionOrder.findMany({ where: { status: filter?.status as never, productionDate: filter?.productionDate }, orderBy: { productionDate: "desc" } });
}

export async function productionOrderDetail(db: PrismaClient, actorId: string, orderId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const order = await db.seeraProductionOrder.findUniqueOrThrow({ where: { id: orderId } });
  const [bom, gate, batches] = await Promise.all([db.seeraBom.findUnique({ where: { id: order.bomId }, include: { lines: true } }), materialAvailabilityGate(db, orderId), db.seeraProductionBatch.findMany({ where: { productionOrderId: orderId } })]);
  return { order, bom, gate, batches };
}
