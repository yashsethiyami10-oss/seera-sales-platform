import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getBatchDetail } from "@/actions/manufacturing";
import { BatchDetail } from "@/components/os-manufacturing/BatchDetail";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getBatchDetail(id);
  if (!result.success || !result.data) notFound();
  const batch = result.data;

  return (
    <Workspace>
      <PageHeader title={`Batch ${batch.batchNumber}`} />
      <div className="px-6 pb-10">
        <BatchDetail
          batch={{
            id: batch.id, batchNumber: batch.batchNumber, status: batch.status, qualityStatus: batch.qualityStatus,
            plannedQuantity: Number(batch.plannedQuantity), actualQuantity: batch.actualQuantity ? Number(batch.actualQuantity) : null,
            unitOfMeasure: batch.unitOfMeasure, transferredToInventoryAt: batch.transferredToInventoryAt,
            inspections: batch.inspections.map((i) => ({ id: i.id, inspectionNumber: i.inspectionNumber, status: i.status, inspectionType: i.inspectionType })),
          }}
        />
      </div>
    </Workspace>
  );
}
