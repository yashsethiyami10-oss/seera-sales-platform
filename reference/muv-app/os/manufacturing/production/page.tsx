import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listProductionPlans, listProductionOrders } from "@/actions/manufacturing";
import { ProductionManager } from "@/components/os-manufacturing/ProductionManager";

export default async function ProductionPage() {
  const [plansResult, ordersResult, activeRevisions, warehouses] = await Promise.all([
    listProductionPlans({ pageSize: 50 }),
    listProductionOrders({ pageSize: 50 }),
    prisma.enterpriseFormulaRevision.findMany({ where: { status: "ACTIVE" }, include: { formula: true }, orderBy: { effectiveFrom: "desc" } }),
    prisma.warehouse.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  if (!plansResult.success || !ordersResult.success) {
    return (
      <Workspace>
        <PageHeader title="Production" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!plansResult.success ? plansResult.error.message : !ordersResult.success ? ordersResult.error.message : ""}</p>
      </Workspace>
    );
  }

  return (
    <Workspace>
      <PageHeader title="Production" description="Production Plans and Production Orders" />
      <div className="px-6 pb-10">
        <ProductionManager
          plans={plansResult.data.items}
          orders={ordersResult.data.items.map((o) => ({ ...o, plannedQuantity: Number(o.plannedQuantity) }))}
          activeRevisions={activeRevisions.map((r) => ({ id: r.id, revisionNumber: r.revisionNumber, standardBatchSize: Number(r.standardBatchSize), formula: { formulaCode: r.formula.formulaCode, name: r.formula.name, outputVariantId: r.formula.outputVariantId } }))}
          warehouses={warehouses}
        />
      </div>
    </Workspace>
  );
}
