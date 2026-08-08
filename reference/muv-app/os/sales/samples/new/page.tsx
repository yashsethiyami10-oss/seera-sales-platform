import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listInstProducts } from "@/actions/inst-shared";
import { IssueSampleForm } from "@/components/os-sales/samples/IssueSampleForm";

export default async function NewSamplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const result = await listInstProducts();
  return (
    <Workspace>
      <PageHeader title="Issue Sample" description="Module 7 — Sample Management" />
      <div className="px-6 pb-10">
        <IssueSampleForm products={result.success ? result.data : []} opportunityId={params.opportunityId} customerId={params.customerId} />
      </div>
    </Workspace>
  );
}
