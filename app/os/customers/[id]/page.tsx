import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getCustomerDetail } from "@/actions/customers";
import { listCustomerTypes, listInstitutionCategories, listPaymentTerms } from "@/actions/master-data";
import { listTerritories } from "@/actions/territories";
import { CustomerDetailTabs } from "@/components/os-customers/CustomerDetailTabs";
import { CustomerActiveToggle } from "@/components/os-customers/CustomerActiveToggle";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [detail, types, categories, terms, territories, owners] = await Promise.all([
    getCustomerDetail(id),
    listCustomerTypes({ activeOnly: true }),
    listInstitutionCategories({ activeOnly: true }),
    listPaymentTerms({ activeOnly: true }),
    listTerritories({ activeOnly: true }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!detail.success) notFound();
  const customer = detail.data;

  return (
    <Workspace>
      <PageHeader
        title={customer.name}
        description={customer.customerCode ?? undefined}
        actions={
          <>
            <CustomerActiveToggle customerId={customer.id} active={customer.active} />
            <Link href="/os/customers" className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
              <ArrowLeft size={14} /> Back
            </Link>
          </>
        }
      />
      <div className="px-6 pb-10 max-w-3xl">
        <CustomerDetailTabs
          customer={customer}
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
