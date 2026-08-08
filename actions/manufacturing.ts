"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toErrorResponse } from "@/lib/errors";
import { requireEnterprisePrincipal } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import * as vendorService from "@/lib/enterprise/vendor-service";
import * as procurementService from "@/lib/enterprise/procurement-service";
import * as operationsService from "@/lib/enterprise/operations-services";
import { transferReleasedBatchToInventory } from "@/lib/enterprise/finished-goods-service";
import { computeAndRecordBatchCost } from "@/lib/enterprise-finance/costing-service";
import { recordFinanceEvent } from "@/lib/enterprise-finance/event-posting-service";

/**
 * Milestone 7 — Manufacturing (Including Procurement). The MUV-OS-shell
 * "use server" boundary for app/os/manufacturing/* — thin wrappers over the
 * already-frozen lib/enterprise/* Business Services (writes) plus the
 * list/detail reads the new UI needs. Every wrapped function still
 * self-enforces its own permission/feature-flag check inside
 * requireEnterprisePrincipal — this file adds no new authorization logic,
 * only the { success, data } / { success, error } shape every other
 * actions/*.ts file in this codebase already uses.
 */

const revalidateManufacturing = () => revalidatePath("/os/manufacturing", "layout");

// --- Suppliers (Vendors) ---

export async function listSuppliers(input?: { q?: string; status?: string; page?: number; pageSize?: number }) {
  try { return { success: true as const, data: await vendorService.listVendors(input ?? {}) }; } catch (err) { return toErrorResponse(err); }
}
export async function createSupplier(input: unknown) {
  try {
    const result = await vendorService.createVendor(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function transitionSupplier(id: string, targetStatus: string, version: number, reason?: string) {
  try {
    const result = await vendorService.transitionVendor(id, targetStatus, version, reason);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Procurement: Requisitions, Purchase Orders, Goods Receipts ---

export async function listRequisitions(input?: { q?: string; status?: string; page?: number; pageSize?: number }) {
  try { return { success: true as const, data: await procurementService.listPurchaseRequisitions(input ?? {}) }; } catch (err) { return toErrorResponse(err); }
}
export async function createRequisition(input: unknown) {
  try {
    const result = await procurementService.createPurchaseRequisition(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function submitRequisition(id: string, version: number) {
  try {
    const result = await procurementService.submitPurchaseRequisition(id, version);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function listOrders(input?: { q?: string; status?: string; page?: number; pageSize?: number }) {
  try { return { success: true as const, data: await procurementService.listPurchaseOrders(input ?? {}) }; } catch (err) { return toErrorResponse(err); }
}
export async function createOrder(input: unknown) {
  try {
    const result = await procurementService.createPurchaseOrder(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function issueOrder(id: string, version: number) {
  try {
    const result = await procurementService.issuePurchaseOrder(id, version);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function listReceipts(input?: { q?: string; page?: number; pageSize?: number }) {
  try { return { success: true as const, data: await procurementService.listGoodsReceipts(input ?? {}) }; } catch (err) { return toErrorResponse(err); }
}
export async function createGoodsReceipt(input: unknown) {
  try {
    const result = await procurementService.receiveGoods(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Formula / BOM ---

export async function listFormulas(input?: { q?: string; page?: number; pageSize?: number }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_FORMULA_VIEW, "ENTERPRISE_FORMULA_BOM_ENABLED");
    const page = Math.max(1, input?.page ?? 1), pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    const where = { organizationKey: principal.organizationKey, ...(input?.q ? { OR: [{ formulaCode: { contains: input.q, mode: "insensitive" as const } }, { name: { contains: input.q, mode: "insensitive" as const } }] } : {}) };
    const [items, total] = await Promise.all([
      prisma.enterpriseFormula.findMany({ where, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseFormula.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } };
  } catch (err) { return toErrorResponse(err); }
}
export async function createFormula(input: unknown) {
  try {
    const result = await operationsService.createFormula(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function transitionFormula(id: string, target: "UNDER_REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "ARCHIVED", version: number) {
  try {
    const result = await operationsService.transitionFormulaRevision(id, target, version);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Production: Plans, Orders, Reservation ---

export async function listProductionPlans(input?: { page?: number; pageSize?: number }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, "ENTERPRISE_MANUFACTURING_ENABLED");
    const page = Math.max(1, input?.page ?? 1), pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    const where = { organizationKey: principal.organizationKey };
    const [items, total] = await Promise.all([
      prisma.enterpriseProductionPlan.findMany({ where, orderBy: { planDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseProductionPlan.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } };
  } catch (err) { return toErrorResponse(err); }
}
export async function createProductionPlan(input: unknown) {
  try {
    const result = await operationsService.createProductionPlan(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function listProductionOrders(input?: { status?: string; page?: number; pageSize?: number }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, "ENTERPRISE_MANUFACTURING_ENABLED");
    const page = Math.max(1, input?.page ?? 1), pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    const where = { organizationKey: principal.organizationKey, ...(input?.status ? { status: input.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.enterpriseProductionOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseProductionOrder.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } };
  } catch (err) { return toErrorResponse(err); }
}
export async function getProductionOrderDetail(id: string) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PRODUCTION_VIEW, "ENTERPRISE_MANUFACTURING_ENABLED");
    const order = await prisma.enterpriseProductionOrder.findFirst({
      where: { id, organizationKey: principal.organizationKey },
      include: { formulaRevision: { include: { formula: true, ingredients: true } }, allocations: true, batches: { include: { history: true, inspections: { include: { results: true, decision: true } } } } },
    });
    return { success: true as const, data: order };
  } catch (err) { return toErrorResponse(err); }
}
export async function createProductionOrder(input: unknown) {
  try {
    const result = await operationsService.createProductionOrder(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function transitionProductionOrder(id: string, target: string, version: number, reason?: string) {
  try {
    const result = await operationsService.transitionProductionOrder(id, target, version, reason);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function reserveProductionMaterials(productionOrderId: string) {
  try {
    const result = await operationsService.reserveProductionMaterials(productionOrderId);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Batch Management ---

export async function listBatches(input?: { status?: string; page?: number; pageSize?: number }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_BATCH_VIEW, "ENTERPRISE_BATCH_ENABLED");
    const page = Math.max(1, input?.page ?? 1), pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    const where = { organizationKey: principal.organizationKey, ...(input?.status ? { status: input.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.enterpriseBatch.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseBatch.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } };
  } catch (err) { return toErrorResponse(err); }
}
export async function getBatchDetail(id: string) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_BATCH_VIEW, "ENTERPRISE_BATCH_ENABLED");
    const batch = await prisma.enterpriseBatch.findFirst({
      where: { id, organizationKey: principal.organizationKey },
      include: { history: { orderBy: { createdAt: "desc" } }, inspections: { include: { results: true, decision: true } }, productionOrder: true },
    });
    return { success: true as const, data: batch };
  } catch (err) { return toErrorResponse(err); }
}
export async function createBatch(input: { productionOrderId: string; plannedQuantity: number; unitOfMeasure: string; manufacturingDate?: Date; expiryDate?: Date; operatorIds?: string[] }) {
  try {
    const result = await operationsService.createBatch(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
/**
 * Records how much was actually produced and marks the batch COMPLETED —
 * the "Production" step's real output, and the gate before an inspection
 * is meaningful (recordQualityDecision reads actualQuantity indirectly via
 * the batch it decides on). Only valid from CREATED, matching the fact that
 * createBatch (operations-services.ts) is currently the only other writer
 * of batch.status besides the QC-driven RELEASED/REJECTED/QC_HOLD path.
 */
export async function recordBatchActualQuantity(id: string, actualQuantity: number) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_BATCH_UPDATE, "ENTERPRISE_BATCH_ENABLED");
    const { enterpriseTransaction, recordEnterpriseMutation } = await import("@/lib/enterprise/governance");
    const { AppError, NotFoundError } = await import("@/lib/errors");
    const result = await enterpriseTransaction(async (tx) => {
      const current = await tx.enterpriseBatch.findFirst({ where: { id, organizationKey: principal.organizationKey } });
      if (!current) throw new NotFoundError("Batch");
      if (current.status !== "CREATED") throw new AppError(`Only a newly created batch can record actual quantity (this batch is ${current.status.toLowerCase()})`, 409, "INVALID_TRANSITION");
      const batch = await tx.enterpriseBatch.update({
        where: { id }, data: { actualQuantity, completedAt: new Date(), completedById: principal.id, status: "COMPLETED", version: { increment: 1 } },
      });
      await tx.enterpriseBatchStatusHistory.create({ data: { organizationKey: principal.organizationKey, batchId: id, previousStatus: current.status, newStatus: "COMPLETED", reason: "Production completed", changedById: principal.id } });
      const correlationId = await recordEnterpriseMutation(tx, principal, {
        module: "enterprise_batch", action: "BATCH_COMPLETED", entityType: "EnterpriseBatch",
        entityId: id, description: `Batch ${current.batchNumber}: production completed (${actualQuantity} ${current.unitOfMeasure})`,
        previous: { status: current.status }, next: { status: "COMPLETED", actualQuantity },
      });
      return { entity: batch, correlationId };
    });
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Quality Control ---

export async function listInspections(input?: { status?: string; page?: number; pageSize?: number }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_QUALITY_VIEW, "ENTERPRISE_QUALITY_ENABLED");
    const page = Math.max(1, input?.page ?? 1), pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    const where = { organizationKey: principal.organizationKey, ...(input?.status ? { status: input.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.enterpriseInspection.findMany({ where, include: { batch: true, results: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.enterpriseInspection.count({ where }),
    ]);
    return { success: true as const, data: { items, total, page, pageSize, pages: Math.ceil(total / pageSize) } };
  } catch (err) { return toErrorResponse(err); }
}
export async function createInspection(input: { batchId: string; inspectionType: string }) {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_QUALITY_INSPECT, "ENTERPRISE_QUALITY_ENABLED");
    const { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } = await import("@/lib/enterprise/governance");
    const result = await enterpriseTransaction(async (tx) => {
      const inspectionNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "INSPECTION", "INSP");
      const inspection = await tx.enterpriseInspection.create({
        data: { organizationKey: principal.organizationKey, inspectionNumber, inspectionType: input.inspectionType, batchId: input.batchId, createdById: principal.id },
      });
      const correlationId = await recordEnterpriseMutation(tx, principal, {
        module: "enterprise_quality", action: "INSPECTION_CREATED", entityType: "EnterpriseInspection",
        entityId: inspection.id, description: `Inspection ${inspectionNumber} created`, next: { status: inspection.status },
      });
      return { entity: inspection, correlationId };
    });
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}
export async function recordQualityDecision(input: { inspectionId: string; decision: "PASSED" | "CONDITIONALLY_PASSED" | "FAILED" | "HOLD" | "RELEASED" | "REJECTED" | "REWORK_REQUIRED"; reasonCode?: string; comments?: string; overrideReason?: string }) {
  try {
    const result = await operationsService.recordQualityDecision(input);
    revalidateManufacturing();
    return { success: true as const, data: result.entity };
  } catch (err) { return toErrorResponse(err); }
}

// --- Finished Goods ---

export async function transferBatchToFinishedGoods(batchId: string) {
  try {
    // Milestone 8 — Manufacturing Costing. Roll up the batch's cost (direct
    // material, derived from real consumption + standard cost; other
    // components as already recorded) before the transfer, so the
    // Finished-Goods journal posts at the batch's real cost, not its sale
    // value — WIP -> Finished Goods is a cost transfer, never revenue.
    const cost = await computeAndRecordBatchCost(batchId);
    const result = await transferReleasedBatchToInventory(batchId);
    revalidateManufacturing();
    revalidatePath("/os/operations");

    if (cost.totalCost.greaterThan(0)) {
      const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_WAREHOUSE_TRANSFER, "ENTERPRISE_WAREHOUSE_ENABLED");
      await recordFinanceEvent({
        actingUserId: principal.id, sourceModule: "enterprise_finished_goods", sourceEventAction: "FINISHED_GOODS_TRANSFERRED",
        sourceRecordId: batchId, amount: cost.totalCost, description: `Batch ${result.entity.batchNumber}: WIP transferred to Finished Goods at cost`,
      }).catch(() => {});
    }

    return { success: true as const, data: { batch: result.entity, inventoryQuantity: result.inventory.quantity, batchCost: Number(cost.totalCost) } };
  } catch (err) { return toErrorResponse(err); }
}

// --- Reports ---

export async function getManufacturingSummary() {
  try {
    const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REPORTING_VIEW, "ENTERPRISE_REPORTING_ENABLED");
    const [openRequisitions, openOrders, activeProductionOrders, pendingInspections, releasedBatchesAwaitingTransfer] = await Promise.all([
      prisma.enterprisePurchaseRequisition.count({ where: { organizationKey: principal.organizationKey, status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }),
      prisma.enterprisePurchaseOrder.count({ where: { organizationKey: principal.organizationKey, status: "ISSUED" } }),
      prisma.enterpriseProductionOrder.count({ where: { organizationKey: principal.organizationKey, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } } }),
      prisma.enterpriseInspection.count({ where: { organizationKey: principal.organizationKey, status: "PENDING" } }),
      prisma.enterpriseBatch.count({ where: { organizationKey: principal.organizationKey, status: "RELEASED", transferredToInventoryAt: null } }),
    ]);
    return { success: true as const, data: { openRequisitions, openOrders, activeProductionOrders, pendingInspections, releasedBatchesAwaitingTransfer } };
  } catch (err) { return toErrorResponse(err); }
}
