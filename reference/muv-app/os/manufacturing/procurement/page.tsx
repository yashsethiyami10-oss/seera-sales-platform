import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { prisma } from "@/lib/prisma";
import { listRequisitions, listOrders, listReceipts, listSuppliers } from "@/actions/manufacturing";
import { ProcurementManager } from "@/components/os-manufacturing/ProcurementManager";

export default async function ProcurementPage() {
  const [requisitionsResult, ordersResult, receiptsResult, vendorsResult, warehouses, variants] = await Promise.all([
    listRequisitions({ pageSize: 50 }),
    listOrders({ pageSize: 50 }),
    listReceipts({ pageSize: 50 }),
    listSuppliers({ status: "ACTIVE", pageSize: 100 }),
    prisma.warehouse.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.productVariant.findMany({ take: 300, select: { id: true, sku: true, size: true, product: { select: { name: true } } }, orderBy: { sku: "asc" } }),
  ]);

  if (!requisitionsResult.success || !ordersResult.success || !receiptsResult.success || !vendorsResult.success) {
    const failed = [requisitionsResult, ordersResult, receiptsResult, vendorsResult].find((r) => !r.success);
    return (
      <Workspace>
        <PageHeader title="Procurement" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{!failed!.success && failed!.error.message}</p>
      </Workspace>
    );
  }

  return (
    <Workspace>
      <PageHeader title="Procurement" description="Purchase Requisitions, Purchase Orders, Goods Receipt" />
      <div className="px-6 pb-10">
        <ProcurementManager
          variants={variants.map((v) => ({ id: v.id, label: `${v.product.name} — ${v.size} (${v.sku})` }))}
          vendors={vendorsResult.data.items.map((v) => ({ id: v.id, vendorCode: v.vendorCode, displayName: v.displayName }))}
          warehouses={warehouses}
          requisitions={requisitionsResult.data.items}
          orders={ordersResult.data.items.map((o) => ({ ...o, grandTotal: Number(o.grandTotal), items: o.items.map((i) => ({ ...i, quantity: Number(i.quantity), receivedQuantity: Number(i.receivedQuantity) })) }))}
          receipts={receiptsResult.data.items}
        />
      </div>
    </Workspace>
  );
}
