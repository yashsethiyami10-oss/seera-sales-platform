import type { WastageType, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { postMaterialMovementInTx } from "./ledger-service";
import { mfgNumberFor } from "./numbering";

export async function recordWastage(db: PrismaClient, actorId: string, input: { productionOrderId?: string; batchId?: string; materialId?: string; wastageType: WastageType; expectedQuantity?: number; actualQuantity?: number; wasteQuantity: number; unit: string; reason: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_wastage:record" });
  if (input.wasteQuantity <= 0) throw new FoundationError("INVALID_WASTE_QUANTITY", "Waste quantity must be positive", 400);
  if (!input.reason.trim()) throw new FoundationError("WASTE_REASON_REQUIRED", "A reason is required", 400);
  return db.$transaction(async (tx) => {
    let movementId: string | undefined;
    if (input.materialId) {
      const movement = await postMaterialMovementInTx(tx, actorId, { materialId: input.materialId, movementType: "WASTAGE", direction: "OUT", quantity: input.wasteQuantity, unit: input.unit as never, canonicalQuantity: input.wasteQuantity, sourceType: input.batchId ? "SeeraProductionBatch" : "SeeraProductionOrder", sourceId: input.batchId ?? input.productionOrderId ?? "unspecified", reason: input.reason, idempotencyKey: `${input.idempotencyKey}:movement` });
      movementId = movement.id;
    }
    const record = await tx.seeraWastageRecord.create({ data: { ...input, unit: input.unit as never, movementId, actorId } });
    await recordAudit(tx, { actorId, action: "mfg.wastage.recorded", entityType: "SeeraWastageRecord", entityId: record.id, afterState: { wastageType: input.wastageType, wasteQuantity: input.wasteQuantity } });
    return record;
  });
}

export async function wastageReport(db: PrismaClient, actorId: string, input: { from: Date; to: Date }) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  const records = await db.seeraWastageRecord.findMany({ where: { createdAt: { gte: input.from, lte: input.to } }, orderBy: { createdAt: "desc" } });
  const byType = new Map<string, number>();
  for (const r of records) byType.set(r.wastageType, (byType.get(r.wastageType) ?? 0) + Number(r.wasteQuantity));
  return { records, byType: [...byType.entries()].map(([wastageType, total]) => ({ wastageType, total })) };
}

export const wastageNumber = mfgNumberFor;
