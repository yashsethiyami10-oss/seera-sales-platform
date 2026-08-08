import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listInstProducts } from "@/actions/inst-shared";
import { CreateQuotationForm } from "@/components/os-sales/quotations/CreateQuotationForm";

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const productsResult = await listInstProducts();

  if (!params.opportunityId) {
    return <Workspace><PageHeader title="New Quotation" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>Start a quotation from an Opportunity page.</p></Workspace>;
  }

  return (
    <Workspace>
      <PageHeader title="New Quotation" description="Module 9 — Quotation Management" />
      <div className="px-6 pb-10">
        <CreateQuotationForm opportunityId={params.opportunityId} products={productsResult.success ? productsResult.data : []} />
      </div>
    </Workspace>
  );
}
