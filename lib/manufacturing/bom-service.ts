import type { ManufacturingUnit, PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";

// BOM/Formulation Engine (spec §11/§13). Deliberately NEVER seeds real Seera
// formulation lines — every line here is created only when a caller (a human,
// via the UI, or a TEST_ONLY_MANUFACTURING_FIXTURE proof script) explicitly
// supplies materials/quantities. Versioning: exactly one ACTIVE version per
// productSkuId at a time; activating a new version supersedes the old one
// without altering its historical rows — production orders/batches snapshot
// bomId+bomVersion at creation and are never affected by later changes.

export async function createBomDraft(db: PrismaClient, actorId: string, input: { productSkuId: string; standardBatchSize: number; batchUnit: ManufacturingUnit; expectedOutput?: number; expectedYieldPct?: number; sopId?: string; notes?: string; lines: { materialId: string; requiredQuantity: number; unit: ManufacturingUnit; canonicalQuantity: number; lossAllowancePct?: number; stage?: string; isRequired?: boolean; sequence?: number; notes?: string }[] }) {
  await authorize(db, { actorId, permission: "mfg_bom:manage" });
  const lastVersion = await db.seeraBom.findFirst({ where: { productSkuId: input.productSkuId }, orderBy: { version: "desc" } });
  const version = (lastVersion?.version ?? 0) + 1;
  const bom = await db.seeraBom.create({
    data: { productSkuId: input.productSkuId, version, status: "DRAFT", effectiveFrom: new Date(), standardBatchSize: input.standardBatchSize, batchUnit: input.batchUnit, expectedOutput: input.expectedOutput, expectedYieldPct: input.expectedYieldPct, sopId: input.sopId, notes: input.notes, createdById: actorId, lines: { create: input.lines.map((l) => ({ ...l, isRequired: l.isRequired ?? true, sequence: l.sequence ?? 0 })) } },
    include: { lines: true },
  });
  await recordAudit(db, { actorId, action: "mfg.bom.draft_created", entityType: "SeeraBom", entityId: bom.id, afterState: { productSkuId: input.productSkuId, version, lines: input.lines.length } });
  return bom;
}

export type BomValidationError = { code: string; message: string };
export async function validateBom(db: PrismaClient, bomId: string): Promise<BomValidationError[]> {
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: bomId }, include: { lines: true } });
  const errors: BomValidationError[] = [];
  if (bom.lines.length === 0) errors.push({ code: "NO_LINES", message: "BOM has no material lines" });
  if (Number(bom.standardBatchSize) <= 0) errors.push({ code: "INVALID_BATCH_SIZE", message: "Standard batch size must be positive" });
  for (const line of bom.lines) {
    if (Number(line.requiredQuantity) <= 0 || Number(line.canonicalQuantity) <= 0) errors.push({ code: "INVALID_LINE_QUANTITY", message: `Line for material ${line.materialId} has a non-positive quantity` });
    const material = await db.seeraManufacturingMaterial.findUnique({ where: { id: line.materialId } });
    if (!material) errors.push({ code: "MATERIAL_NOT_FOUND", message: `Material ${line.materialId} not found` });
    else if (!material.isActive) errors.push({ code: "MATERIAL_INACTIVE", message: `Material ${material.name} is inactive` });
  }
  const materialIds = bom.lines.map((l) => l.materialId);
  if (new Set(materialIds).size !== materialIds.length) errors.push({ code: "DUPLICATE_MATERIAL_LINE", message: "The same material appears in more than one line" });
  return errors;
}

export async function submitBomForReview(db: PrismaClient, actorId: string, bomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:manage" });
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: bomId } });
  if (bom.status !== "DRAFT") throw new FoundationError("BOM_NOT_DRAFT", "Only a draft BOM can be submitted for review", 409);
  const errors = await validateBom(db, bomId);
  if (errors.length) throw new FoundationError("BOM_VALIDATION_FAILED", "BOM failed validation", 400, { errors });
  return db.seeraBom.update({ where: { id: bomId }, data: { status: "UNDER_REVIEW" } });
}

export async function approveBom(db: PrismaClient, actorId: string, bomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:approve" });
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: bomId } });
  if (bom.status !== "UNDER_REVIEW") throw new FoundationError("BOM_NOT_UNDER_REVIEW", "BOM must be under review before approval", 409);
  const updated = await db.seeraBom.update({ where: { id: bomId }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() } });
  await recordAudit(db, { actorId, action: "mfg.bom.approved", entityType: "SeeraBom", entityId: bomId });
  return updated;
}

// BOM Impact Preview (spec §81) — old-vs-new comparison shown before
// activation; never mutates history.
export async function bomActivationImpact(db: PrismaClient, bomId: string) {
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: bomId }, include: { lines: true } });
  const currentActive = await db.seeraBom.findFirst({ where: { productSkuId: bom.productSkuId, status: "ACTIVE" }, include: { lines: true } });
  const oldByMaterial = new Map((currentActive?.lines ?? []).map((l) => [l.materialId, Number(l.canonicalQuantity)]));
  const newByMaterial = new Map(bom.lines.map((l) => [l.materialId, Number(l.canonicalQuantity)]));
  const materialIds = new Set([...oldByMaterial.keys(), ...newByMaterial.keys()]);
  const changes = [...materialIds].map((materialId) => ({ materialId, oldQuantity: oldByMaterial.get(materialId) ?? 0, newQuantity: newByMaterial.get(materialId) ?? 0, changed: (oldByMaterial.get(materialId) ?? 0) !== (newByMaterial.get(materialId) ?? 0) })).filter((c) => c.changed);
  return { currentActiveVersion: currentActive?.version ?? null, newVersion: bom.version, changes };
}

// Only one valid ACTIVE version per productSkuId (spec §13) — activating
// supersedes the prior ACTIVE version, which keeps its own row (and every
// production batch that snapshot it) untouched.
export async function activateBom(db: PrismaClient, actorId: string, bomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:approve" });
  const bom = await db.seeraBom.findUniqueOrThrow({ where: { id: bomId } });
  if (bom.status !== "APPROVED") throw new FoundationError("BOM_NOT_APPROVED", "BOM must be approved before activation", 409);
  return db.$transaction(async (tx) => {
    const previousActive = await tx.seeraBom.findFirst({ where: { productSkuId: bom.productSkuId, status: "ACTIVE" } });
    const activated = await tx.seeraBom.update({ where: { id: bomId }, data: { status: "ACTIVE" } });
    if (previousActive) await tx.seeraBom.update({ where: { id: previousActive.id }, data: { status: "SUPERSEDED", supersededById: activated.id, effectiveUntil: new Date() } });
    await recordAudit(tx, { actorId, action: "mfg.bom.activated", entityType: "SeeraBom", entityId: bomId, afterState: { productSkuId: bom.productSkuId, version: bom.version, supersededVersion: previousActive?.version ?? null } });
    return activated;
  });
}

export async function retireBom(db: PrismaClient, actorId: string, bomId: string) {
  await authorize(db, { actorId, permission: "mfg_bom:approve" });
  const updated = await db.seeraBom.update({ where: { id: bomId }, data: { status: "RETIRED", effectiveUntil: new Date() } });
  await recordAudit(db, { actorId, action: "mfg.bom.retired", entityType: "SeeraBom", entityId: bomId });
  return updated;
}

export async function activeBomFor(db: PrismaClient, productSkuId: string) {
  return db.seeraBom.findFirst({ where: { productSkuId, status: "ACTIVE" }, include: { lines: true } });
}

export async function listBoms(db: PrismaClient, actorId: string, productSkuId?: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraBom.findMany({ where: { productSkuId }, orderBy: [{ productSkuId: "asc" }, { version: "desc" }], include: { lines: true } });
}

export async function bomDetail(db: PrismaClient, actorId: string, bomId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraBom.findUniqueOrThrow({ where: { id: bomId }, include: { lines: true } });
}
