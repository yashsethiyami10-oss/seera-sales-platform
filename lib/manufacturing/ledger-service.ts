import type { ManufacturingMovementType, Prisma, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

export type MaterialMovementInput = {
  materialId: string;
  lotId?: string;
  movementType: ManufacturingMovementType;
  direction: "IN" | "OUT" | "RESERVE" | "RELEASE";
  quantity: number;
  unit: string;
  canonicalQuantity: number;
  fromLocationId?: string;
  toLocationId?: string;
  sourceType: string;
  sourceId: string;
  reason: string;
  approvalId?: string;
  idempotencyKey: string;
};

// The immutable raw/packaging/WIP material ledger (spec §8) — mirrors the
// proven SeeraInventoryMovement pattern from Sales V1 (IN/OUT/RESERVE/RELEASE,
// idempotencyKey-unique retry safety, sourceType/sourceId pointer back to the
// business event) rather than inventing a new shape, since that pattern is
// already audited and correct in this codebase.
export async function postMaterialMovementInTx(tx: Prisma.TransactionClient, actorId: string, input: MaterialMovementInput) {
  if (input.canonicalQuantity <= 0) throw new FoundationError("INVALID_MOVEMENT_QUANTITY", "Movement quantity must be positive", 400);
  const existing = await tx.seeraManufacturingMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  const movement = await tx.seeraManufacturingMovement.create({ data: { ...input, unit: input.unit as never, actorId } });
  await recordAudit(tx, { actorId, action: "mfg.movement.posted", entityType: "SeeraManufacturingMovement", entityId: movement.id, afterState: { materialId: input.materialId, movementType: input.movementType, direction: input.direction, canonicalQuantity: input.canonicalQuantity } });
  return movement;
}

export async function postMaterialMovement(db: PrismaClient, actorId: string, input: MaterialMovementInput) {
  return db.$transaction((tx) => postMaterialMovementInTx(tx, actorId, input));
}

// Never allow a physical OUT/RESERVE that would drive on-hand/available below
// zero (spec §18: "Default: Do not allow consumption that would create
// negative stock"). Computed the same way inventoryPosition() computes it
// for Sales V1 — physical-in minus physical-out, minus net reservations.
export async function materialStockPosition(db: PrismaClient, materialId: string, lotId?: string) {
  const movements = await db.seeraManufacturingMovement.findMany({ where: { materialId, lotId: lotId ?? undefined } });
  let physical = 0;
  let reserved = 0;
  let qcHold = 0;
  for (const m of movements) {
    const qty = Number(m.canonicalQuantity);
    if (m.direction === "IN") physical += qty;
    else if (m.direction === "OUT") physical -= qty;
    else if (m.direction === "RESERVE") reserved += qty;
    else if (m.direction === "RELEASE") reserved -= qty;
    if (m.movementType === "QC_HOLD") qcHold += qty;
    if (m.movementType === "QC_RELEASE") qcHold -= qty;
  }
  const available = Math.max(0, physical - reserved - qcHold);
  return { physical, reserved: Math.max(0, reserved), qcHold: Math.max(0, qcHold), available };
}

export async function assertSufficientStock(db: PrismaClient, materialId: string, requiredCanonicalQuantity: number, lotId?: string) {
  const position = await materialStockPosition(db, materialId, lotId);
  if (position.available < requiredCanonicalQuantity) throw new FoundationError("INSUFFICIENT_MATERIAL_STOCK", `Insufficient available stock — required ${requiredCanonicalQuantity}, available ${position.available}`, 409);
  return position;
}

export async function materialLedger(db: PrismaClient, actorId: string, input: { materialId: string; from?: Date; to?: Date }) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const movements = await db.seeraManufacturingMovement.findMany({ where: { materialId: input.materialId, occurredAt: { gte: input.from, lte: input.to } }, orderBy: { occurredAt: "asc" } });
  let running = 0;
  return movements.map((m) => {
    const qty = Number(m.canonicalQuantity);
    if (m.direction === "IN") running += qty;
    else if (m.direction === "OUT") running -= qty;
    return { ...m, quantity: Number(m.quantity), canonicalQuantity: qty, runningBalance: running };
  });
}

export async function lotLedger(db: PrismaClient, actorId: string, lotId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  const movements = await db.seeraManufacturingMovement.findMany({ where: { lotId }, orderBy: { occurredAt: "asc" } });
  return movements.map((m) => ({ ...m, quantity: Number(m.quantity), canonicalQuantity: Number(m.canonicalQuantity) }));
}
