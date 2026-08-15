import type { ManufacturingUnit, PackLevel, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// Packaging BOM (spec §12) — independently versioned/governed from the
// chemical formula BOM. Daily production consumes packaging based on ACTUAL
// packed output, not theoretical chemical batch input (batch-execution-service
// reads this at output-recording time, not at issue time).
export async function createPackagingBomDraft(db: PrismaClient, actorId: string, input: { productSkuId: string; packLevel?: PackLevel; unitsPerParent?: number; effectiveFrom: Date; notes?: string; lines: { materialId: string; quantityPerUnit: number; unit: ManufacturingUnit; canonicalQuantity: number; notes?: string }[] }) {
  await authorize(db, { actorId, permission: "mfg_bom:manage" });
  const packLevel = input.packLevel ?? "PRIMARY";
  const lastVersion = await db.seeraPackagingBom.findFirst({ where: { productSkuId: input.productSkuId, packLevel }, orderBy: { version: "desc" } });
  const version = (lastVersion?.version ?? 0) + 1;
  const bom = await db.seeraPackagingBom.create({ data: { productSkuId: input.productSkuId, packLevel, version, status: "DRAFT", unitsPerParent: input.unitsPerParent, effectiveFrom: input.effectiveFrom, notes: input.notes, lines: { create: input.lines } }, include: { lines: true } });
  await recordAudit(db, { actorId, action: "mfg.packaging_bom.draft_created", entityType: "SeeraPackagingBom", entityId: bom.id, afterState: { productSkuId: input.productSkuId, packLevel, version } });
  return bom;
}

export async function approvePackagingBom(db: PrismaClient, actorId: string, packagingBomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:approve" });
  return db.seeraPackagingBom.update({ where: { id: packagingBomId }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() } });
}

export async function activatePackagingBom(db: PrismaClient, actorId: string, packagingBomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:approve" });
  const pbom = await db.seeraPackagingBom.findUniqueOrThrow({ where: { id: packagingBomId } });
  if (pbom.status !== "APPROVED") throw new FoundationError("PACKAGING_BOM_NOT_APPROVED", "Packaging BOM must be approved before activation", 409);
  return db.$transaction(async (tx) => {
    const previousActive = await tx.seeraPackagingBom.findFirst({ where: { productSkuId: pbom.productSkuId, packLevel: pbom.packLevel, status: "ACTIVE" } });
    const activated = await tx.seeraPackagingBom.update({ where: { id: packagingBomId }, data: { status: "ACTIVE" } });
    if (previousActive) await tx.seeraPackagingBom.update({ where: { id: previousActive.id }, data: { status: "SUPERSEDED" } });
    await recordAudit(tx, { actorId, action: "mfg.packaging_bom.activated", entityType: "SeeraPackagingBom", entityId: packagingBomId });
    return activated;
  });
}

export async function activePackagingBomFor(db: PrismaClient, productSkuId: string, packLevel: PackLevel = "PRIMARY") {
  return db.seeraPackagingBom.findFirst({ where: { productSkuId, packLevel, status: "ACTIVE" }, include: { lines: true } });
}

export async function listPackagingBoms(db: PrismaClient, actorId: string, productSkuId?: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraPackagingBom.findMany({ where: { productSkuId }, orderBy: [{ productSkuId: "asc" }, { version: "desc" }], include: { lines: true } });
}
