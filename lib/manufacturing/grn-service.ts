import type { ManufacturingUnit, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { mfgNumberFor } from "./numbering";
import { postMaterialMovementInTx, postMaterialMovement } from "./ledger-service";

// GRN (spec §36) — physical material receipt, deliberately independent from
// the Finance Vendor Bill (financial obligation). Only accepted quantity
// becomes real stock; rejected quantity never does (spec §35: "Do not
// automatically increase material stock merely because vendor bill exists").
export async function createGrn(db: PrismaClient, actorId: string, input: { date: Date; vendorId: string; purchaseRef?: string; idempotencyKey: string; lines: { materialId: string; supplierLotRef?: string; quantity: number; unit: ManufacturingUnit; canonicalQuantity: number; acceptedQuantity: number; rejectedQuantity?: number; unitCost?: number; manufactureDate?: Date; expiryDate?: Date; locationId: string; documentFileId?: string }[] }) {
  await authorize(db, { actorId, permission: "mfg_grn:manage" });
  for (const line of input.lines) {
    if (line.acceptedQuantity + (line.rejectedQuantity ?? 0) > line.canonicalQuantity + 0.0001) throw new FoundationError("GRN_LINE_QUANTITY_MISMATCH", "Accepted + rejected cannot exceed received quantity", 400);
  }
  const grn = await db.seeraGrn.create({ data: { grnNumber: mfgNumberFor("GRN", input.idempotencyKey), date: input.date, vendorId: input.vendorId, purchaseRef: input.purchaseRef, status: "DRAFT", actorId, idempotencyKey: input.idempotencyKey, lines: { create: input.lines.map((l) => ({ ...l, rejectedQuantity: l.rejectedQuantity ?? 0 })) } }, include: { lines: true } });
  await recordAudit(db, { actorId, action: "mfg.grn.created", entityType: "SeeraGrn", entityId: grn.id, afterState: { vendorId: input.vendorId, lines: input.lines.length } });
  return grn;
}

// Posting creates the internal lot(s) and the physical IN movement for
// accepted quantity only.
export async function postGrn(db: PrismaClient, actorId: string, grnId: string) {
  await authorize(db, { actorId, permission: "mfg_grn:manage" });
  const grn = await db.seeraGrn.findUniqueOrThrow({ where: { id: grnId }, include: { lines: true } });
  if (grn.status !== "DRAFT") throw new FoundationError("GRN_NOT_DRAFT", "Only a draft GRN can be posted", 409);
  return db.$transaction(async (tx) => {
    for (const line of grn.lines) {
      const lotNumber = mfgNumberFor("LOT", `${grn.idempotencyKey}:${line.id}`);
      const lot = await tx.seeraManufacturingLot.upsert({ where: { lotNumber }, update: {}, create: { lotNumber, materialId: line.materialId, supplierLotRef: line.supplierLotRef, vendorId: grn.vendorId, manufactureDate: line.manufactureDate, expiryDate: line.expiryDate, qcStatus: "PENDING", sourceGrnId: grn.id } });
      await tx.seeraGrnLine.update({ where: { id: line.id }, data: { internalLotId: lot.id } });
      const acceptedQuantity = Number(line.acceptedQuantity);
      if (acceptedQuantity > 0) {
        await postMaterialMovementInTx(tx, actorId, { materialId: line.materialId, lotId: lot.id, movementType: "PURCHASE_RECEIPT", direction: "IN", quantity: acceptedQuantity, unit: line.unit, canonicalQuantity: acceptedQuantity, toLocationId: line.locationId, sourceType: "SeeraGrn", sourceId: grn.id, reason: `GRN ${grn.grnNumber} accepted receipt`, idempotencyKey: `${grn.idempotencyKey}:in:${line.id}` });
        // Weighted-average cost update (spec §46) — only when a real receipt
        // cost was captured on this line; otherwise the material's cost
        // stays whatever it was (never backfilled from selling price).
        if (line.unitCost != null) {
          const lineUnitCost = Number(line.unitCost);
          const priorMovements = await tx.seeraManufacturingMovement.findMany({ where: { materialId: line.materialId, direction: "IN" } });
          const priorQty = priorMovements.reduce((s, m) => s + Number(m.canonicalQuantity), 0) - acceptedQuantity;
          const material = await tx.seeraManufacturingMaterial.findUniqueOrThrow({ where: { id: line.materialId } });
          const priorCost = Number(material.unitCost ?? lineUnitCost);
          const newAvgCost = priorQty > 0 ? (priorQty * priorCost + acceptedQuantity * lineUnitCost) / (priorQty + acceptedQuantity) : lineUnitCost;
          await tx.seeraManufacturingMaterial.update({ where: { id: line.materialId }, data: { unitCost: newAvgCost } });
        }
      }
    }
    const updated = await tx.seeraGrn.update({ where: { id: grnId }, data: { status: "POSTED" } });
    await recordAudit(tx, { actorId, action: "mfg.grn.posted", entityType: "SeeraGrn", entityId: grnId });
    return updated;
  });
}

export async function grnQcRelease(db: PrismaClient, actorId: string, grnLineId: string, decision: "PASSED" | "FAILED") {
  await authorize(db, { actorId, permission: "mfg_qc:release" });
  const line = await db.seeraGrnLine.findUniqueOrThrow({ where: { id: grnLineId } });
  const updated = await db.seeraGrnLine.update({ where: { id: grnLineId }, data: { qcStatus: decision } });
  if (line.internalLotId) await db.seeraManufacturingLot.update({ where: { id: line.internalLotId }, data: { qcStatus: decision } });
  await recordAudit(db, { actorId, action: "mfg.grn.qc_decided", entityType: "SeeraGrnLine", entityId: grnLineId, afterState: { decision } });
  return updated;
}

// Supplier return / material rejection (spec §37) — physical stock OUT only;
// no Company finished-goods returns modeled here.
export async function supplierMaterialReturn(db: PrismaClient, actorId: string, input: { materialId: string; lotId?: string; quantity: number; unit: string; canonicalQuantity: number; fromLocationId: string; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_grn:manage" });
  if (!input.reason.trim()) throw new FoundationError("RETURN_REASON_REQUIRED", "A reason is required", 400);
  return postMaterialMovement(db, actorId, { materialId: input.materialId, lotId: input.lotId, movementType: "SUPPLIER_RETURN", direction: "OUT", quantity: input.quantity, unit: input.unit as never, canonicalQuantity: input.canonicalQuantity, fromLocationId: input.fromLocationId, sourceType: "SupplierReturn", sourceId: input.idempotencyKey, reason: input.reason, idempotencyKey: input.idempotencyKey });
}

export async function listGrns(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraGrn.findMany({ orderBy: { date: "desc" }, include: { lines: true } });
}

export async function grnPendingQc(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  return db.seeraGrnLine.findMany({ where: { qcStatus: "PENDING" }, include: { grn: true } });
}
