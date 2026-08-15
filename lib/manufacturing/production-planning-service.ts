import type { PrismaClient } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { recordAudit } from "@/lib/foundation/audit-service";
import { FoundationError } from "@/lib/foundation/errors";
import { mfgNumberFor } from "./numbering";
import { activeBomFor } from "./bom-service";
import { materialStockPosition } from "./ledger-service";

export async function createProductionPlan(db: PrismaClient, actorId: string, input: { period: "DAY" | "WEEK" | "CUSTOM"; periodStart: Date; periodEnd: Date; idempotencyKey: string; lines: { productSkuId: string; targetQuantity: number; targetBatches: number; requiredDate: Date; priority?: string; notes?: string }[] }) {
  await authorize(db, { actorId, permission: "mfg_plan:manage" });
  const plan = await db.seeraProductionPlan.create({ data: { planNumber: mfgNumberFor("PLAN", input.idempotencyKey), period: input.period, periodStart: input.periodStart, periodEnd: input.periodEnd, status: "DRAFT", createdById: actorId, lines: { create: input.lines.map((l) => ({ ...l, priority: l.priority ?? "NORMAL" })) } }, include: { lines: true } });
  await recordAudit(db, { actorId, action: "mfg.plan.created", entityType: "SeeraProductionPlan", entityId: plan.id, afterState: { lines: input.lines.length } });
  return plan;
}

export async function approveProductionPlan(db: PrismaClient, actorId: string, planId: string) {
  await authorize(db, { actorId, permission: "mfg_plan:manage" });
  const updated = await db.seeraProductionPlan.update({ where: { id: planId }, data: { status: "APPROVED" } });
  await recordAudit(db, { actorId, action: "mfg.plan.approved", entityType: "SeeraProductionPlan", entityId: planId });
  return updated;
}

export async function listProductionPlans(db: PrismaClient, actorId: string) {
  await authorize(db, { actorId, permission: "mfg_ledger:view" });
  return db.seeraProductionPlan.findMany({ orderBy: { periodStart: "desc" }, include: { lines: true } });
}

// Material Requirement Planning (spec §16) — Active BOM x planned
// batch/output quantity, compared against real available stock (which
// already nets out existing RESERVE movements from other approved orders,
// via materialStockPosition). Never subtracts stock merely because a plan
// line exists — this is a read-only projection.
export async function materialRequirementPlan(db: PrismaClient, actorId: string, planLineId: string) {
  await authorize(db, { actorId, permission: "mfg_plan:manage" });
  const line = await db.seeraProductionPlanLine.findUniqueOrThrow({ where: { id: planLineId } });
  const bom = await activeBomFor(db, line.productSkuId);
  if (!bom) return { productSkuId: line.productSkuId, bomStatus: "BOM_NOT_CONFIGURED" as const, requirements: [] };
  const batches = line.targetBatches;
  const requirements = await Promise.all(
    bom.lines.map(async (bl) => {
      const required = Number(bl.canonicalQuantity) * batches;
      const position = await materialStockPosition(db, bl.materialId);
      const material = await db.seeraManufacturingMaterial.findUnique({ where: { id: bl.materialId } });
      const shortage = Math.max(0, required - position.available);
      return { materialId: bl.materialId, materialName: material?.name ?? bl.materialId, required, available: position.available, shortage, expectedBalance: position.available - required };
    }),
  );
  return { productSkuId: line.productSkuId, bomStatus: "OK" as const, bomId: bom.id, bomVersion: bom.version, requirements };
}

export async function cancelProductionPlan(db: PrismaClient, actorId: string, planId: string, reason: string) {
  await authorize(db, { actorId, permission: "mfg_plan:manage" });
  if (!reason.trim()) throw new FoundationError("CANCEL_REASON_REQUIRED", "A reason is required", 400);
  const updated = await db.seeraProductionPlan.update({ where: { id: planId }, data: { status: "CANCELLED" } });
  await recordAudit(db, { actorId, action: "mfg.plan.cancelled", entityType: "SeeraProductionPlan", entityId: planId, afterState: { reason } });
  return updated;
}
