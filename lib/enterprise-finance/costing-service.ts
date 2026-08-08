import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ENTERPRISE_ORGANIZATION } from "@/lib/enterprise/context";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireFinancePrincipal } from "./context";

/**
 * Milestone 8 — Manufacturing Costing. Standard costing to start (the
 * approved architecture's own recommended starting point) — a material's
 * "standard cost" is its most recent accepted Goods Receipt unit price,
 * not a separately-maintained standard-cost master (that would be a second
 * source of truth to keep in sync; this derives directly from real
 * procurement history instead). Only direct material cost is computed
 * automatically from real data (Milestone 7's EnterpriseMaterialAllocation
 * consumption); labor/machine/utility/overhead/QC/wastage/freight/landed/
 * subcontracting are real, first-class columns on FinanceBatchCost (never
 * hidden inside a single "other" bucket) but are entered manually via
 * recordAdditionalBatchCost until a future milestone sources them from a
 * timesheet/utility-metering system that doesn't exist yet — every
 * component the approved architecture asked for is modeled and traceable,
 * not silently limited to raw-material value alone.
 */

export async function getStandardMaterialCost(variantId: string): Promise<Prisma.Decimal> {
  const lastReceiptItem = await prisma.enterprisePurchaseOrderItem.findFirst({
    where: { variantId, receivedQuantity: { gt: 0 } },
    orderBy: { purchaseOrder: { orderDate: "desc" } },
    select: { unitPrice: true },
  });
  return lastReceiptItem?.unitPrice ?? new Prisma.Decimal(0);
}

export async function computeAndRecordBatchCost(batchId: string) {
  const batch = await prisma.enterpriseBatch.findUniqueOrThrow({ where: { id: batchId } });
  const allocations = await prisma.enterpriseMaterialAllocation.findMany({ where: { productionOrderId: batch.productionOrderId, status: "CONSUMED" } });

  let directMaterialCost = new Prisma.Decimal(0);
  for (const allocation of allocations) {
    const unitCost = await getStandardMaterialCost(allocation.materialVariantId);
    directMaterialCost = directMaterialCost.plus(unitCost.times(allocation.consumedQuantity));
  }

  const existing = await prisma.financeBatchCost.findUnique({ where: { batchId } });
  const packaging = existing?.packagingCost ?? new Prisma.Decimal(0);
  const labor = existing?.directLaborCost ?? new Prisma.Decimal(0);
  const machine = existing?.machineCost ?? new Prisma.Decimal(0);
  const utility = existing?.utilityCost ?? new Prisma.Decimal(0);
  const overhead = existing?.overheadCost ?? new Prisma.Decimal(0);
  const qc = existing?.qualityControlCost ?? new Prisma.Decimal(0);
  const normalWastage = existing?.normalWastageCost ?? new Prisma.Decimal(0);
  const abnormalWastage = existing?.abnormalWastageCost ?? new Prisma.Decimal(0);
  const freight = existing?.freightInwardAllocated ?? new Prisma.Decimal(0);
  const otherLanded = existing?.otherLandedCost ?? new Prisma.Decimal(0);
  const subcontracting = existing?.subcontractingCost ?? new Prisma.Decimal(0);

  const totalCost = directMaterialCost.plus(packaging).plus(labor).plus(machine).plus(utility).plus(overhead).plus(qc).plus(normalWastage).plus(abnormalWastage).plus(freight).plus(otherLanded).plus(subcontracting);
  const actualQty = batch.actualQuantity ?? new Prisma.Decimal(0);
  const costPerUnit = actualQty.greaterThan(0) ? totalCost.dividedBy(actualQty) : null;

  const record = await prisma.financeBatchCost.upsert({
    where: { batchId },
    create: {
      organizationKey: ENTERPRISE_ORGANIZATION, batchId, directMaterialCost, totalCost, costPerUnit,
    },
    update: { directMaterialCost, totalCost, costPerUnit, version: { increment: 1 } },
  });
  return record;
}

/** Manual entry for the non-derivable cost components (labor/machine/utility/overhead/QC/wastage/freight/landed/subcontracting). */
export async function recordAdditionalBatchCost(batchId: string, input: Partial<{
  packagingCost: number; directLaborCost: number; machineCost: number; utilityCost: number; overheadCost: number;
  qualityControlCost: number; normalWastageCost: number; abnormalWastageCost: number; freightInwardAllocated: number;
  otherLandedCost: number; subcontractingCost: number;
}>) {
  await requireFinancePrincipal(PERMISSIONS.FINANCE_COSTING_MANAGE);
  await prisma.financeBatchCost.upsert({
    where: { batchId },
    create: { organizationKey: ENTERPRISE_ORGANIZATION, batchId, ...input },
    update: { ...input, version: { increment: 1 } },
  });
  return computeAndRecordBatchCost(batchId);
}

export async function getBatchCost(batchId: string) {
  await requireFinancePrincipal(PERMISSIONS.FINANCE_COSTING_VIEW);
  return prisma.financeBatchCost.findUnique({ where: { batchId } });
}

export async function listBatchCosts(input: { page?: number; pageSize?: number }) {
  const principal = await requireFinancePrincipal(PERMISSIONS.FINANCE_COSTING_VIEW);
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where = { organizationKey: principal.organizationKey };
  const [items, total] = await Promise.all([
    prisma.financeBatchCost.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.financeBatchCost.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

/** Inventory Valuation Report — Warehouse Valuation (§21/24): quantity × standard cost, per variant, derived live (never a separate stored ledger). */
export async function getInventoryValuation() {
  await requireFinancePrincipal(PERMISSIONS.FINANCE_COSTING_VIEW);
  const inventories = await prisma.inventory.findMany({ where: { quantity: { gt: 0 } }, select: { variantId: true, quantity: true, variant: { select: { sku: true, product: { select: { name: true } } } } } });
  const rows = [];
  for (const inv of inventories) {
    const unitCost = await getStandardMaterialCost(inv.variantId);
    rows.push({ variantId: inv.variantId, sku: inv.variant.sku, productName: inv.variant.product.name, quantity: inv.quantity, unitCost: Number(unitCost), value: Number(unitCost) * inv.quantity });
  }
  return { rows, totalValue: rows.reduce((sum, r) => sum + r.value, 0) };
}
