import type { DeviationType, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Deviation/Incident record (spec §59) — captures what happened and who's
// responsible for follow-up; deliberately never generates remediation advice.
export async function createDeviation(db: PrismaClient, actorId: string, input: { batchId?: string; productionOrderId?: string; deviationType: DeviationType; description: string; impact?: string; immediateAction?: string; responsibleUserId?: string; documentFileId?: string; idempotencyKey: string }) {
  await authorize(db, { actorId, permission: "mfg_deviation:manage" });
  if (!input.description.trim()) throw new FoundationError("DEVIATION_DESCRIPTION_REQUIRED", "A description is required", 400);
  const record = await db.seeraDeviationRecord.create({ data: { ...input, status: "OPEN", actorId } });
  await recordAudit(db, { actorId, action: "mfg.deviation.created", entityType: "SeeraDeviationRecord", entityId: record.id, afterState: { deviationType: input.deviationType } });
  return record;
}

export async function reviewDeviation(db: PrismaClient, actorId: string, deviationId: string) {
  await authorize(db, { actorId, permission: "mfg_deviation:manage" });
  return db.seeraDeviationRecord.update({ where: { id: deviationId }, data: { status: "REVIEWED" } });
}

export async function closeDeviation(db: PrismaClient, actorId: string, deviationId: string, reason: string) {
  await authorize(db, { actorId, permission: "mfg_deviation:manage" });
  if (!reason.trim()) throw new FoundationError("CLOSE_REASON_REQUIRED", "A closure reason is required", 400);
  const updated = await db.seeraDeviationRecord.update({ where: { id: deviationId }, data: { status: "CLOSED", closedAt: new Date() } });
  await recordAudit(db, { actorId, action: "mfg.deviation.closed", entityType: "SeeraDeviationRecord", entityId: deviationId, afterState: { reason } });
  return updated;
}

export async function listDeviations(db: PrismaClient, actorId: string, status?: string) {
  await authorize(db, { actorId, permission: "mfg_reports:view" });
  return db.seeraDeviationRecord.findMany({ where: { status: status as never }, orderBy: { createdAt: "desc" } });
}
