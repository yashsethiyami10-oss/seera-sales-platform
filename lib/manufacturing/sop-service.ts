import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// SOP governance (spec §14) — a document + version record, never parsed or
// interpreted automatically into a BOM. Historical batches keep their exact
// SOP version reference forever (batches snapshot sopId at creation).
export async function createSopDraft(db: PrismaClient, actorId: string, input: { productSkuId: string; effectiveFrom: Date; documentFileId?: string; linkedBomId?: string; supersedes?: string; notes?: string }) {
  await authorize(db, { actorId, permission: "mfg_sop:manage" });
  const lastVersion = await db.seeraSop.findFirst({ where: { productSkuId: input.productSkuId }, orderBy: { version: "desc" } });
  const version = (lastVersion?.version ?? 0) + 1;
  const sop = await db.seeraSop.create({ data: { ...input, version, status: "DRAFT" } });
  await recordAudit(db, { actorId, action: "mfg.sop.draft_created", entityType: "SeeraSop", entityId: sop.id, afterState: { productSkuId: input.productSkuId, version } });
  return sop;
}

export async function approveSop(db: PrismaClient, actorId: string, sopId: string) {
  await authorize(db, { actorId, permission: "mfg_sop:approve" });
  const updated = await db.seeraSop.update({ where: { id: sopId }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() } });
  await recordAudit(db, { actorId, action: "mfg.sop.approved", entityType: "SeeraSop", entityId: sopId });
  return updated;
}

export async function activateSop(db: PrismaClient, actorId: string, sopId: string) {
  await authorize(db, { actorId, permission: "mfg_sop:approve" });
  const sop = await db.seeraSop.findUniqueOrThrow({ where: { id: sopId } });
  if (sop.status !== "APPROVED") throw new FoundationError("SOP_NOT_APPROVED", "SOP must be approved before activation", 409);
  return db.$transaction(async (tx) => {
    const previousActive = await tx.seeraSop.findFirst({ where: { productSkuId: sop.productSkuId, status: "ACTIVE" } });
    const activated = await tx.seeraSop.update({ where: { id: sopId }, data: { status: "ACTIVE" } });
    if (previousActive) await tx.seeraSop.update({ where: { id: previousActive.id }, data: { status: "SUPERSEDED" } });
    await recordAudit(tx, { actorId, action: "mfg.sop.activated", entityType: "SeeraSop", entityId: sopId, afterState: { productSkuId: sop.productSkuId, version: sop.version } });
    return activated;
  });
}

export async function activeSopFor(db: PrismaClient, productSkuId: string) {
  return db.seeraSop.findFirst({ where: { productSkuId, status: "ACTIVE" } });
}

export async function listSops(db: PrismaClient, actorId: string, productSkuId?: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraSop.findMany({ where: { productSkuId }, orderBy: [{ productSkuId: "asc" }, { version: "desc" }] });
}
