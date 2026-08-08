import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listCustomerTypes, listInstitutionCategories, listPaymentTerms } from "@/actions/master-data";
import { listTerritories } from "@/actions/territories";
import { CustomerForm } from "@/components/os-customers/CustomerForm";

export default async function NewCustomerPage() {
  const [types, categories, terms, territories, owners] = await Promise.all([
    listCustomerTypes({ activeOnly: true }),
    listInstitutionCategories({ activeOnly: true }),
    listPaymentTerms({ activeOnly: true }),
    listTerritories({ activeOnly: true }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <Workspace>
      <PageHeader
        title="New Customer"
        actions={
          <Link href="/os/customers" className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
            <ArrowLeft size={14} /> Back to Customers
          </Link>
        }
      />
      <div className="px-6 pb-10 max-w-3xl">
        <CustomerForm
          customerTypes={types.success ? types.data : []}
          institutionCategories={categories.success ? categories.data : []}
          paymentTerms={terms.success ? terms.data : []}
          territories={territories.success ? territories.data : []}
          owners={owners.map((o) => ({ id: o.id, name: o.name ?? o.id }))}
        />
      </div>
    </Workspace>
  );
}
