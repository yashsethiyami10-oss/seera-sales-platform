import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getProductionOrderDetail } from "@/actions/manufacturing";
import { ProductionOrderDetail } from "@/components/os-manufacturing/ProductionOrderDetail";

export default async function ProductionOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getProductionOrderDetail(id);
  if (!result.success || !result.data) notFound();
  const order = result.data;

  return (
    <Workspace>
      <PageHeader title={`Production Order ${order.productionOrderNumber}`} />
      <div className="px-6 pb-10">
        <ProductionOrderDetail
          order={{
            id: order.id, productionOrderNumber: order.productionOrderNumber, status: order.status, version: order.version,
            plannedQuantity: Number(order.plannedQuantity), plannedBatchCount: order.plannedBatchCount, unitOfMeasure: order.unitOfMeasure,
            formulaRevision: { formula: { formulaCode: order.formulaRevision.formula.formulaCode, name: order.formulaRevision.formula.name } },
            allocations: order.allocations.map((a) => ({ id: a.id, materialVariantId: a.materialVariantId, plannedQuantity: Number(a.plannedQuantity), allocatedQuantity: Number(a.allocatedQuantity), consumedQuantity: Number(a.consumedQuantity), status: a.status })),
            batches: order.batches.map((b) => ({ id: b.id, batchNumber: b.batchNumber, status: b.status, qualityStatus: b.qualityStatus, plannedQuantity: Number(b.plannedQuantity), actualQuantity: b.actualQuantity ? Number(b.actualQuantity) : null })),
          }}
        />
      </div>
    </Workspace>
  );
}
