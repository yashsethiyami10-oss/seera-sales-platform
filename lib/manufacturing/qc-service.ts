import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// QC framework (spec §26) — generic, configurable. Never invents detergent
// quality specifications; min/max/target values are supplied by the caller
// (Founder/QC, or a TEST_ONLY fixture), never hardcoded here.
export async function createQcTemplate(db: PrismaClient, actorId: string, input: { productSkuId: string; version: number; parameter: string; unit?: string; minValue?: number; maxValue?: number; targetValue?: number; isRequired?: boolean; method?: string; sequence?: number }) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  const template = await db.seeraQcTemplate.create({ data: { ...input, isRequired: input.isRequired ?? true, sequence: input.sequence ?? 0 } });
  await recordAudit(db, { actorId, action: "mfg.qc_template.created", entityType: "SeeraQcTemplate", entityId: template.id, afterState: { productSkuId: input.productSkuId, parameter: input.parameter } });
  return template;
}

export async function qcTemplatesFor(db: PrismaClient, productSkuId: string) {
  return db.seeraQcTemplate.findMany({ where: { productSkuId, isActive: true }, orderBy: { sequence: "asc" } });
}

export async function recordBatchQc(db: PrismaClient, actorId: string, input: { batchId: string; templateId?: string; parameter: string; unit?: string; observedValue?: number; remarks?: string; documentFileId?: string }) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  let passFail: boolean | null = null;
  if (input.templateId && input.observedValue != null) {
    const template = await db.seeraQcTemplate.findUnique({ where: { id: input.templateId } });
    if (template) {
      const withinMin = template.minValue == null || input.observedValue >= Number(template.minValue);
      const withinMax = template.maxValue == null || input.observedValue <= Number(template.maxValue);
      passFail = withinMin && withinMax;
    }
  }
  const record = await db.seeraBatchQc.create({ data: { batchId: input.batchId, templateId: input.templateId, parameter: input.parameter, unit: input.unit, observedValue: input.observedValue, passFail, remarks: input.remarks, documentFileId: input.documentFileId, testerId: actorId } });
  await recordAudit(db, { actorId, action: "mfg.qc.recorded", entityType: "SeeraBatchQc", entityId: record.id, afterState: { batchId: input.batchId, parameter: input.parameter, passFail } });
  return record;
}

export async function holdBatch(db: PrismaClient, actorId: string, batchId: string, reason: string) {
  await authorize(db, { actorId, permission: "mfg_qc:release" });
  if (!reason.trim()) throw new FoundationError("HOLD_REASON_REQUIRED", "A reason is required to hold a batch", 400);
  const updated = await db.seeraProductionBatch.update({ where: { id: batchId }, data: { qcStatus: "HOLD" } });
  await db.seeraFinishedGoodsReceipt.updateMany({ where: { batchId }, data: { qcStatus: "HOLD" } });
  await recordAudit(db, { actorId, action: "mfg.batch.held", entityType: "SeeraProductionBatch", entityId: batchId, afterState: { reason } });
  return updated;
}

export async function failBatch(db: PrismaClient, actorId: string, batchId: string, reason: string) {
  await authorize(db, { actorId, permission: "mfg_qc:release" });
  if (!reason.trim()) throw new FoundationError("FAIL_REASON_REQUIRED", "A reason is required to fail a batch", 400);
  const updated = await db.seeraProductionBatch.update({ where: { id: batchId }, data: { qcStatus: "FAILED" } });
  await db.seeraFinishedGoodsReceipt.updateMany({ where: { batchId }, data: { qcStatus: "FAILED" } });
  await recordAudit(db, { actorId, action: "mfg.batch.failed", entityType: "SeeraProductionBatch", entityId: batchId, afterState: { reason } });
  return updated;
}

// THE QC gate (spec §24/§26): the ONLY path finished goods becomes real
// Company-available stock. Posts into the EXISTING SeeraInventoryMovement
// ledger (partyType COMPANY — see schema comment) rather than a second
// finished-goods truth; lot number = batch number for forward traceability.
export async function releaseBatch(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_qc:release" });
  const batch = await db.seeraProductionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const fgReceipt = await db.seeraFinishedGoodsReceipt.findUnique({ where: { batchId } });
  if (!fgReceipt) throw new FoundationError("NO_FINISHED_GOODS_RECEIPT", "No finished-goods receipt exists for this batch yet", 409);
  if (fgReceipt.qcStatus === "RELEASED") return fgReceipt;
  if (fgReceipt.qcStatus === "FAILED") throw new FoundationError("BATCH_QC_FAILED", "A failed batch cannot be released — use rework governance instead", 409);
  return db.$transaction(async (tx) => {
    const movement = await tx.seeraInventoryMovement.create({
      data: { partyType: "COMPANY", partyId: "SEERA_COMPANY", skuId: batch.productSkuId, type: "RECEIPT", direction: "IN", quantity: fgReceipt.quantity, sourceType: "SeeraFinishedGoodsReceipt", sourceId: fgReceipt.id, actorId, sourcePortal: "manufacturing", reason: `QC-released finished goods — batch ${batch.batchNumber}`, idempotencyKey: `${fgReceipt.idempotencyKey}:inventory-in` },
    });
    const updatedReceipt = await tx.seeraFinishedGoodsReceipt.update({ where: { batchId }, data: { qcStatus: "RELEASED", inventoryMovementId: movement.id } });
    await tx.seeraProductionBatch.update({ where: { id: batchId }, data: { qcStatus: "RELEASED", status: "COMPLETED" } });
    await recordAudit(tx, { actorId, action: "mfg.batch.released", entityType: "SeeraFinishedGoodsReceipt", entityId: updatedReceipt.id, afterState: { batchNumber: batch.batchNumber, quantity: Number(fgReceipt.quantity), inventoryMovementId: movement.id } });
    return updatedReceipt;
  });
}

export async function qcQueue(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  return db.seeraProductionBatch.findMany({ where: { qcStatus: { in: ["PENDING", "HOLD"] } }, orderBy: { date: "desc" } });
}

export async function batchQcHistory(db: PrismaClient, actorId: string, batchId: string) {
  await authorize(db, { actorId, permission: "mfg_qc:enter" });
  return db.seeraBatchQc.findMany({ where: { batchId }, orderBy: { sampleDate: "asc" } });
}
