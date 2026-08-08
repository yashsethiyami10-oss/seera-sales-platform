import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listSuppliers } from "@/actions/manufacturing";
import { SuppliersManager } from "@/components/os-manufacturing/SuppliersManager";

export default async function SuppliersPage() {
  const result = await listSuppliers({ pageSize: 50 });
  return (
    <Workspace>
      <PageHeader title="Suppliers" description="Vendor registry — approval and lifecycle" />
      <div className="px-6 pb-10">
        {result.success ? <SuppliersManager initialVendors={result.data.items} /> : <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>}
      </div>
    </Workspace>
  );
}
