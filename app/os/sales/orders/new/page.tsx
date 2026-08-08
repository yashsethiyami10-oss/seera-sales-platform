import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listInstProducts } from "@/actions/inst-shared";
import { CreateDirectBusinessOrderForm } from "@/components/os-orders/CreateDirectBusinessOrderForm";

/**
 * Milestone 4.2 — Direct Business Order Workflow. Mirrors
 * app/os/sales/quotations/new/page.tsx's exact structure and URL shape
 * (?opportunityId=) for consistency between the two lead-conversion paths.
 */
export default async function NewDirectBusinessOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const productsResult = await listInstProducts();

  if (!params.opportunityId) {
    return <Workspace><PageHeader title="New Business Order" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>Start a direct business order from a Lead or Opportunity page.</p></Workspace>;
  }

  return (
    <Workspace>
      <PageHeader title="New Business Order" description="Direct Business Order — no quotation required" />
      <div className="px-6 pb-10">
        <CreateDirectBusinessOrderForm opportunityId={params.opportunityId} products={productsResult.success ? productsResult.data : []} />
      </div>
    </Workspace>
  );
}
