import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireEnterprisePrincipal, requireVersion } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";
import { recordFinanceEvent } from "@/lib/enterprise-finance/event-posting-service";
import { getStandardMaterialCost } from "@/lib/enterprise-finance/costing-service";

const formulaInput = z.object({
  formulaCode: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(160),
  outputVariantId: z.string().cuid(),
  standardBatchSize: z.coerce.number().positive(),
  unitOfMeasure: z.string().min(1).max(30),
  expectedYield: z.coerce.number().positive(),
  ingredients: z.array(z.object({
    materialVariantId: z.string().cuid(), quantity: z.coerce.number().positive(),
    unitOfMeasure: z.string().min(1).max(30), sequence: z.number().int().optional(),
  })).min(1),
});

export async function createFormula(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_FORMULA_CREATE, "ENTERPRISE_FORMULA_BOM_ENABLED");
  const data = formulaInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const formula = await tx.enterpriseFormula.create({
      data: {
        organizationKey: principal.organizationKey, formulaCode: data.formulaCode,
        name: data.name, outputVariantId: data.outputVariantId, createdById: principal.id,
        revisions: { create: {
          organizationKey: principal.organizationKey, revisionNumber: 1, standardBatchSize: data.standardBatchSize,
          unitOfMeasure: data.unitOfMeasure, expectedYield: data.expectedYield, createdById: principal.id,
          ingredients: { create: data.ingredients.map((row) => ({ ...row, organizationKey: principal.organizationKey })) },
        } },
      },
      include: { revisions: { include: { ingredients: true } } },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_formula", action: "FORMULA_CREATED", entityType: "EnterpriseFormula",
      entityId: formula.id, description: `Formula ${formula.formulaCode} created`,
      next: { revision: 1, status: "DRAFT" },
    });
    return { entity: formula, correlationId };
  });
}

export async function transitionFormulaRevision(id: string, target: "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "ARCHIVED", version: number) {
  const permission = target === "APPROVED" ? PERMISSIONS.ENTERPRISE_FORMULA_APPROVE
    : target === "ACTIVE" ? PERMISSIONS.ENTERPRISE_FORMULA_ACTIVATE
      : PERMISSIONS.ENTERPRISE_FORMULA_SUBMIT;
  const principal = await requireEnterprisePrincipal(permission, "ENTERPRISE_FORMULA_BOM_ENABLED");
  const allowed: Record<string, string[]> = {
    DRAFT: ["UNDER_REVIEW", "ARCHIVED"], UNDER_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
    APPROVED: ["ACTIVE", "ARCHIVED"], ACTIVE: ["SUPERSEDED"], REJECTED: ["DRAFT"], SUPERSEDED: ["ARCHIVED"],
  };
  return enterpriseTransaction(async (tx) => {
    const current = await tx.enterpriseFormulaRevision.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Formula revision");
    requireVersion(current.revisionNumber, version);
    if (!allowed[current.status]?.includes(target)) throw new AppError("Invalid formula transition", 409, "INVALID_TRANSITION");
    const entity = await tx.enterpriseFormulaRevision.update({
      where: { id },
      data: {
        status: target,
        approvedById: target === "APPROVED" ? principal.id : current.approvedById,
        approvedAt: target === "APPROVED" ? new Date() : current.approvedAt,
        effectiveFrom: target === "ACTIVE" ? new Date() : current.effectiveFrom,
      },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_formula", action: `FORMULA_${target}`, entityType: "EnterpriseFormulaRevision",
      entityId: id, description: `Formula revision ${current.revisionNumber}: ${current.status} → ${target}`,
      previous: { status: current.status }, next: { status: target },
    });
    return { entity, correlationId };
  });
}

const productionOrderInput = z.object({
  productionPlanId: z.string().cuid().optional(), productVariantId: z.string().cuid(),
  formulaRevisionId: z.string().cuid(), plannedQuantity: z.coerce.number().positive(),
  unitOfMeasure: z.string().min(1).max(30), plannedBatchCount: z.number().int().positive().default(1),
  warehouseId: z.string().cuid().optional(), productionLineId: z.string().cuid().optional(),
  workCenterId: z.string().cuid().optional(), machineId: z.string().cuid().optional(),
  scheduledStart: z.coerce.date().optional(), scheduledCompletion: z.coerce.date().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

export async function createProductionOrder(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_ORDER_CREATE, "ENTERPRISE_MANUFACTURING_ENABLED");
  const data = productionOrderInput.parse(input);
  return enterpriseTransaction(async (tx) => {
    const revision = await tx.enterpriseFormulaRevision.findFirst({
      where: { id: data.formulaRevisionId, organizationKey: principal.organizationKey, status: "ACTIVE" },
    });
    if (!revision) throw new AppError("An active formula revision is required");
    const productionOrderNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "PRODUCTION_ORDER", "PO");
    const entity = await tx.enterpriseProductionOrder.create({
      data: { ...data, organizationKey: principal.organizationKey, productionOrderNumber, createdById: principal.id },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_production", action: "PRODUCTION_ORDER_CREATED", entityType: "EnterpriseProductionOrder",
      entityId: entity.id, description: `Production order ${productionOrderNumber} created`,
      next: { status: entity.status, formulaRevisionId: revision.id },
    });
    return { entity, correlationId };
  });
}

export async function transitionProductionOrder(id: string, target: string, version: number, reason?: string) {
  const principal = await requireEnterprisePrincipal(
    target === "APPROVED" ? PERMISSIONS.ENTERPRISE_PRODUCTION_ORDER_APPROVE
      : target === "COMPLETED_PENDING_QC" ? PERMISSIONS.ENTERPRISE_PRODUCTION_COMPLETE
        : PERMISSIONS.ENTERPRISE_PRODUCTION_EXECUTE,
    "ENTERPRISE_MANUFACTURING_ENABLED",
  );
  const allowed: Record<string, string[]> = {
    DRAFT: ["PLANNED", "CANCELLED"], PLANNED: ["PENDING_APPROVAL"], PENDING_APPROVAL: ["APPROVED", "CANCELLED"],
    APPROVED: ["SCHEDULED"], SCHEDULED: ["MATERIAL_RESERVED"], MATERIAL_RESERVED: ["IN_PROGRESS"],
    IN_PROGRESS: ["PAUSED", "COMPLETED_PENDING_QC"], PAUSED: ["IN_PROGRESS", "CANCELLED"],
    COMPLETED_PENDING_QC: ["COMPLETED"], COMPLETED: ["CLOSED"],
  };
  let consumedValue = new Prisma.Decimal(0);
  const result = await enterpriseTransaction(async (tx) => {
    const current = await tx.enterpriseProductionOrder.findFirst({ where: { id, organizationKey: principal.organizationKey } });
    if (!current) throw new NotFoundError("Production order");
    requireVersion(current.version, version);
    if (!allowed[current.status]?.includes(target)) throw new AppError("Invalid production transition", 409, "INVALID_TRANSITION");

    // Milestone 7 — Manufacturing (Including Procurement). MATERIAL_RESERVED
    // -> IN_PROGRESS is the only edge into IN_PROGRESS (per the allowed map
    // above), so this is exactly "Production" starting per the approved
    // workflow (Raw Material Reservation -> Production) — consuming the
    // reserved materials here, atomically with the status change, rather
    // than requiring a separate explicit "consume" click.
    if (target === "IN_PROGRESS") {
      const allocations = await tx.enterpriseMaterialAllocation.findMany({ where: { productionOrderId: id, status: "ALLOCATED" } });
      for (const allocation of allocations) {
        consumedValue = consumedValue.plus((await getStandardMaterialCost(allocation.materialVariantId)).times(allocation.allocatedQuantity));
        const quantity = Number(allocation.allocatedQuantity);
        const inventory = await tx.inventory.findUnique({ where: { variantId: allocation.materialVariantId } });
        if (!inventory || inventory.quantity < quantity) throw new AppError("Reserved raw material stock is no longer available", 409, "INSUFFICIENT_STOCK");
        await tx.enterpriseMaterialAllocation.update({ where: { id: allocation.id }, data: { consumedQuantity: allocation.allocatedQuantity, status: "CONSUMED" } });
        const updatedInventory = await tx.inventory.update({ where: { variantId: allocation.materialVariantId }, data: { quantity: { decrement: Math.round(quantity) } } });
        const movementNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "WAREHOUSE_MOVEMENT", "WM");
        await tx.enterpriseWarehouseMovement.create({
          data: {
            organizationKey: principal.organizationKey, movementNumber, movementType: "PRODUCTION_CONSUMPTION",
            sourceWarehouseId: allocation.warehouseId, variantId: allocation.materialVariantId, quantity: Math.round(quantity),
            unitOfMeasure: current.unitOfMeasure, businessReferenceType: "EnterpriseProductionOrder", businessReferenceId: current.id,
            businessReferenceNumber: current.productionOrderNumber, actorId: principal.id, correlationId: crypto.randomUUID(),
          },
        });
        await tx.stockLedgerEntry.create({
          data: {
            movementNumber, movementType: "PRODUCTION_CONSUMPTION", warehouseId: allocation.warehouseId, variantId: allocation.materialVariantId,
            quantity: -Math.round(quantity), referenceEntity: "EnterpriseProductionOrder", referenceId: current.id,
            referenceNumber: current.productionOrderNumber, userId: principal.id,
          },
        });
        await tx.stockHistory.create({
          data: { inventoryId: updatedInventory.id, change: -Math.round(quantity), reason: "RAW_MATERIAL_CONSUMPTION", changedById: principal.id, note: `Consumed by production order ${current.productionOrderNumber}` },
        });
      }
    }

    const entity = await tx.enterpriseProductionOrder.update({
      where: { id }, data: {
        status: target, version: { increment: 1 }, updatedById: principal.id,
        startedAt: target === "IN_PROGRESS" && !current.startedAt ? new Date() : current.startedAt,
        completedAt: target.startsWith("COMPLETED") ? new Date() : current.completedAt,
      },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_production", action: `PRODUCTION_${target}`, entityType: "EnterpriseProductionOrder",
      entityId: id, description: `${current.productionOrderNumber}: ${current.status} → ${target}`,
      previous: { status: current.status }, next: { status: target, reason: reason ?? null },
    });
    return { entity, correlationId };
  });

  // Milestone 8 — Finance & Accounts event-driven integration. Fired after
  // commit, never inside the transaction — a Finance posting failure must
  // never fail (or roll back) the production transition itself.
  if (target === "IN_PROGRESS" && consumedValue.greaterThan(0)) {
    await recordFinanceEvent({
      actingUserId: principal.id, sourceModule: "enterprise_production", sourceEventAction: "PRODUCTION_IN_PROGRESS",
      sourceRecordId: id, amount: consumedValue, description: `${result.entity.productionOrderNumber}: raw material consumed into WIP`,
    }).catch(() => {});
  }
  return result;
}

/**
 * Milestone 7 — Manufacturing (Including Procurement). The new, explicit
 * "Raw Material Reservation" workflow step approved between Production
 * Order and Production. Reuses the SCHEDULED -> MATERIAL_RESERVED edge
 * already present in transitionProductionOrder's own allowed map (that
 * status value already existed, unused — no new status introduced) and
 * performs the actual reservation as its side effect, atomically with the
 * status change, mirroring reserveInventoryAndAssignWarehouse's exact
 * pattern from Milestone 5. Available stock is computed as
 * Inventory.quantity (Current Stock, approved decision 1) minus the live
 * sum of open EnterpriseMaterialAllocation rows (Reserved Stock) — never by
 * aggregating StockLedgerEntry.
 */
export async function reserveProductionMaterials(productionOrderId: string) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_EXECUTE, "ENTERPRISE_MANUFACTURING_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const order = await tx.enterpriseProductionOrder.findFirst({
      where: { id: productionOrderId, organizationKey: principal.organizationKey, status: "SCHEDULED" },
      include: { formulaRevision: { include: { ingredients: true } } },
    });
    if (!order) throw new AppError("Production order must be SCHEDULED to reserve materials");
    if (!order.warehouseId) throw new AppError("Production order has no warehouse assigned");
    if (order.formulaRevision.ingredients.length === 0) throw new AppError("Formula revision has no ingredients defined");

    const ratio = Number(order.plannedQuantity) / Number(order.formulaRevision.standardBatchSize);
    const materialIds = order.formulaRevision.ingredients.map((ingredient) => ingredient.materialVariantId);
    const [inventories, openAllocations] = await Promise.all([
      tx.inventory.findMany({ where: { variantId: { in: materialIds } }, select: { variantId: true, quantity: true } }),
      tx.enterpriseMaterialAllocation.groupBy({ by: ["materialVariantId"], where: { materialVariantId: { in: materialIds }, status: "ALLOCATED" }, _sum: { allocatedQuantity: true } }),
    ]);
    const currentByVariant = new Map(inventories.map((i) => [i.variantId, i.quantity]));
    const reservedByVariant = new Map(openAllocations.map((a) => [a.materialVariantId, Number(a._sum.allocatedQuantity ?? 0)]));

    const shortfalls: string[] = [];
    const required: { materialVariantId: string; quantity: number }[] = [];
    for (const ingredient of order.formulaRevision.ingredients) {
      const need = Number(ingredient.quantity) * ratio;
      const current = currentByVariant.get(ingredient.materialVariantId) ?? 0;
      const reserved = reservedByVariant.get(ingredient.materialVariantId) ?? 0;
      const available = current - reserved;
      if (available < need) shortfalls.push(`${ingredient.materialVariantId}: need ${need.toFixed(3)} ${ingredient.unitOfMeasure}, only ${available.toFixed(3)} available`);
      required.push({ materialVariantId: ingredient.materialVariantId, quantity: need });
    }
    if (shortfalls.length > 0) throw new AppError(`Insufficient raw material stock — ${shortfalls.join("; ")}`, 409, "INSUFFICIENT_STOCK");

    for (const item of required) {
      await tx.enterpriseMaterialAllocation.create({
        data: {
          organizationKey: principal.organizationKey, productionOrderId: order.id, materialVariantId: item.materialVariantId,
          warehouseId: order.warehouseId!, plannedQuantity: item.quantity, allocatedQuantity: item.quantity, status: "ALLOCATED",
        },
      });
    }
    const updated = await tx.enterpriseProductionOrder.update({
      where: { id: order.id }, data: { status: "MATERIAL_RESERVED", version: { increment: 1 }, materialAvailability: "AVAILABLE", updatedById: principal.id },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_production", action: "MATERIALS_RESERVED", entityType: "EnterpriseProductionOrder",
      entityId: order.id, description: `${order.productionOrderNumber}: raw materials reserved for ${required.length} ingredient(s)`,
      next: { status: updated.status, materialCount: required.length },
    });
    return { entity: updated, correlationId };
  });
}

const productionPlanInput = z.object({
  planDate: z.coerce.date(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(),
});

export async function createProductionPlan(input: unknown) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_PLAN, "ENTERPRISE_MANUFACTURING_ENABLED");
  const data = productionPlanInput.parse(input);
  if (data.periodEnd < data.periodStart) throw new AppError("Period end must not be before period start");
  return enterpriseTransaction(async (tx) => {
    const productionPlanNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "PRODUCTION_PLAN", "PP");
    const entity = await tx.enterpriseProductionPlan.create({
      data: { organizationKey: principal.organizationKey, productionPlanNumber, planDate: data.planDate, periodStart: data.periodStart, periodEnd: data.periodEnd, createdById: principal.id },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_production", action: "PRODUCTION_PLAN_CREATED", entityType: "EnterpriseProductionPlan",
      entityId: entity.id, description: `Production plan ${productionPlanNumber} created`, next: { status: entity.status },
    });
    return { entity, correlationId };
  });
}

export async function createBatch(input: {
  productionOrderId: string; plannedQuantity: number; unitOfMeasure: string;
  manufacturingDate?: Date; expiryDate?: Date; operatorIds?: string[];
}) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_BATCH_CREATE, "ENTERPRISE_BATCH_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const order = await tx.enterpriseProductionOrder.findFirst({
      where: { id: input.productionOrderId, organizationKey: principal.organizationKey, status: { in: ["APPROVED", "SCHEDULED", "MATERIAL_RESERVED", "IN_PROGRESS"] } },
    });
    if (!order) throw new AppError("Production order is not eligible for batch creation");
    const batchNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "BATCH", "BAT");
    const entity = await tx.enterpriseBatch.create({
      data: {
        organizationKey: principal.organizationKey, batchNumber, productionOrderId: order.id,
        formulaRevisionId: order.formulaRevisionId, productVariantId: order.productVariantId,
        plannedQuantity: input.plannedQuantity, unitOfMeasure: input.unitOfMeasure,
        manufacturingDate: input.manufacturingDate, expiryDate: input.expiryDate,
        warehouseId: order.warehouseId, productionLineId: order.productionLineId,
        workCenterId: order.workCenterId, machineId: order.machineId,
        operatorIds: input.operatorIds ?? [], status: "CREATED", createdById: principal.id,
        history: { create: { organizationKey: principal.organizationKey, newStatus: "CREATED", reason: "Batch created", changedById: principal.id } },
      },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_batch", action: "BATCH_CREATED", entityType: "EnterpriseBatch",
      entityId: entity.id, description: `Batch ${batchNumber} created`, next: { status: entity.status },
    });
    return { entity, correlationId };
  });
}

export async function recordQualityDecision(input: {
  inspectionId: string; decision: "PASSED" | "CONDITIONALLY_PASSED" | "FAILED" | "HOLD" | "RELEASED" | "REJECTED" | "REWORK_REQUIRED";
  reasonCode?: string; comments?: string; overrideReason?: string;
}) {
  const permission = input.decision === "RELEASED" ? PERMISSIONS.ENTERPRISE_QUALITY_RELEASE
    : input.decision === "REJECTED" ? PERMISSIONS.ENTERPRISE_QUALITY_REJECT
      : PERMISSIONS.ENTERPRISE_QUALITY_DECIDE;
  const principal = await requireEnterprisePrincipal(permission, "ENTERPRISE_QUALITY_ENABLED");
  if (input.overrideReason && !principal.isFounder && !principal.permissions.has(PERMISSIONS.ENTERPRISE_QUALITY_OVERRIDE)) {
    throw new AppError("Quality override permission denied", 403, "FORBIDDEN");
  }
  return enterpriseTransaction(async (tx) => {
    const inspection = await tx.enterpriseInspection.findFirst({
      where: { id: input.inspectionId, organizationKey: principal.organizationKey },
    });
    if (!inspection) throw new NotFoundError("Inspection");
    if (await tx.enterpriseQualityDecision.findUnique({ where: { inspectionId: inspection.id } })) {
      throw new AppError("Quality decision is already finalized", 409, "IMMUTABLE_RECORD");
    }
    const entity = await tx.enterpriseQualityDecision.create({
      data: { ...input, organizationKey: principal.organizationKey, decidedById: principal.id },
    });
    await tx.enterpriseInspection.update({ where: { id: inspection.id }, data: { status: input.decision, inspectedAt: new Date(), inspectedById: principal.id } });
    if (inspection.batchId) {
      const batchStatus = input.decision === "RELEASED" || input.decision === "PASSED" ? "RELEASED"
        : input.decision === "REJECTED" || input.decision === "FAILED" ? "REJECTED" : "QC_HOLD";
      const batch = await tx.enterpriseBatch.update({ where: { id: inspection.batchId }, data: { qualityStatus: input.decision, status: batchStatus, version: { increment: 1 }, releasedById: batchStatus === "RELEASED" ? principal.id : null } });
      await tx.enterpriseBatchStatusHistory.create({ data: { organizationKey: principal.organizationKey, batchId: batch.id, newStatus: batchStatus, reason: input.reasonCode, changedById: principal.id } });
    }
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_quality", action: `QC_${input.decision}`, entityType: "EnterpriseQualityDecision",
      entityId: entity.id, description: `Inspection ${inspection.inspectionNumber}: ${input.decision}`,
      next: { decision: input.decision, reasonCode: input.reasonCode ?? null, overrideReason: input.overrideReason ?? null },
    });
    return { entity, correlationId };
  });
}

