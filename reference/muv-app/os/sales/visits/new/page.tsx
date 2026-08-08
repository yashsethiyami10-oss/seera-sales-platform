import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { CheckInForm } from "@/components/os-sales/visits/CheckInForm";

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <Workspace>
      <PageHeader title="Check In" description="Module 4 — Visit Management" />
      <div className="px-6 pb-10">
        <CheckInForm opportunityId={params.opportunityId} customerId={params.customerId} leadId={params.leadId} />
      </div>
    </Workspace>
  );
}
