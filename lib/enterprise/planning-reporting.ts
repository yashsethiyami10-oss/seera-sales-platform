import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/sales/constants";
import { requireEnterprisePrincipal } from "./context";
import { enterpriseTransaction, nextEnterpriseNumber, recordEnterpriseMutation } from "./governance";

export async function generatePlanningSnapshot() {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_PLANNING_GENERATE, "ENTERPRISE_PLANNING_ENABLED");
  return enterpriseTransaction(async (tx) => {
    const [inventory, reservations, openOrders, demand] = await Promise.all([
      tx.inventory.findMany({ select: { variantId: true, quantity: true, lowStockThreshold: true } }),
      tx.inventoryReservation.groupBy({ by: ["variantId"], where: { status: "ACTIVE" }, _sum: { quantity: true } }),
      tx.enterprisePurchaseOrderItem.groupBy({ by: ["variantId"], where: { purchaseOrder: { organizationKey: principal.organizationKey, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } } }, _sum: { quantity: true, receivedQuantity: true } }),
      tx.enterpriseDemandPlanItem.groupBy({ by: ["variantId"], where: { organizationKey: principal.organizationKey }, _sum: { quantity: true } }),
    ]);
    const available = Object.fromEntries(inventory.map((row) => [row.variantId, row.quantity]));
    const reserved = Object.fromEntries(reservations.map((row) => [row.variantId, row._sum.quantity ?? 0]));
    const incoming = Object.fromEntries(openOrders.map((row) => [row.variantId, Number(row._sum.quantity ?? 0) - Number(row._sum.receivedQuantity ?? 0)]));
    const demandQuantities = Object.fromEntries(demand.map((row) => [row.variantId, Number(row._sum.quantity ?? 0)]));
    const required = Object.fromEntries(Object.entries(demandQuantities).map(([variantId, qty]) => [
      variantId, Math.max(0, qty - (available[variantId] ?? 0) + (reserved[variantId] ?? 0) - (incoming[variantId] ?? 0)),
    ]));
    const snapshotNumber = await nextEnterpriseNumber(tx, principal.organizationKey, "PLANNING_SNAPSHOT", "PLAN");
    const entity = await tx.enterprisePlanningSnapshot.create({
      data: {
        organizationKey: principal.organizationKey, snapshotNumber, snapshotType: "MATERIAL_REQUIREMENTS",
        inputReferences: { demandPlanItems: demand.length }, demandQuantities,
        availableInventory: available, reservedInventory: reserved, incomingSupply: incoming,
        requiredMaterials: required, recommendedProcurement: required, recommendedProduction: {},
        policyReferences: { key: "ENTERPRISE_PLANNING_POLICY" }, calculationVersion: "DETERMINISTIC_V1",
        createdById: principal.id,
      },
    });
    const correlationId = await recordEnterpriseMutation(tx, principal, {
      module: "enterprise_planning", action: "PLANNING_SNAPSHOT_GENERATED",
      entityType: "EnterprisePlanningSnapshot", entityId: entity.id,
      description: `Planning snapshot ${snapshotNumber} generated`, next: { calculationVersion: entity.calculationVersion },
    });
    return { entity, correlationId };
  });
}

export async function getOperationalDashboard() {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REPORTING_VIEW, "ENTERPRISE_REPORTING_ENABLED");
  const org = principal.organizationKey;
  const [vendors, requisitions, purchaseOrders, productionOrders, batches, inspections, movements, snapshots] = await Promise.all([
    prisma.enterpriseVendor.groupBy({ by: ["status"], where: { organizationKey: org }, _count: true }),
    prisma.enterprisePurchaseRequisition.groupBy({ by: ["status"], where: { organizationKey: org }, _count: true }),
    prisma.enterprisePurchaseOrder.groupBy({ by: ["status"], where: { organizationKey: org }, _count: true, _sum: { grandTotal: true } }),
    prisma.enterpriseProductionOrder.groupBy({ by: ["status"], where: { organizationKey: org }, _count: true, _sum: { plannedQuantity: true, actualQuantity: true } }),
    prisma.enterpriseBatch.groupBy({ by: ["status"], where: { organizationKey: org }, _count: true }),
    prisma.enterpriseQualityDecision.groupBy({ by: ["decision"], where: { organizationKey: org }, _count: true }),
    prisma.enterpriseWarehouseMovement.count({ where: { organizationKey: org } }),
    prisma.enterprisePlanningSnapshot.count({ where: { organizationKey: org } }),
  ]);
  return { vendors, requisitions, purchaseOrders, productionOrders, batches, inspections, warehouseMovements: movements, planningSnapshots: snapshots };
}

export async function runEnterpriseBackgroundRefresh(idempotencyKey: string) {
  const principal = await requireEnterprisePrincipal(PERMISSIONS.ENTERPRISE_REPORTING_VIEW, "ENTERPRISE_REPORTING_ENABLED");
  const existing = await prisma.salesAuditLog.findFirst({
    where: { module: "enterprise_background", action: "REFRESH_COMPLETED", recordId: idempotencyKey },
  });
  if (existing) return { repeated: true, auditId: existing.id };
  const dashboard = await getOperationalDashboard();
  const audit = await prisma.salesAuditLog.create({
    data: {
      userId: principal.id, module: "enterprise_background", action: "REFRESH_COMPLETED",
      recordType: "EnterpriseRefresh", recordId: idempotencyKey,
      newValue: { organizationKey: principal.organizationKey, dashboard },
    },
  });
  return { repeated: false, auditId: audit.id };
}

