import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SupplierForm } from "@/components/os-suppliers/SupplierForm";

export default function NewSupplierPage() {
  return (
    <Workspace>
      <PageHeader
        title="New Supplier"
        actions={<Link href="/os/suppliers" className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}><ArrowLeft size={14} /> Back</Link>}
      />
      <div className="px-6 pb-10">
        <SupplierForm />
      </div>
    </Workspace>
  );
}
