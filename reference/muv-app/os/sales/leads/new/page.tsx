import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listTerritories } from "@/actions/territories";
import { listInstLeadSources, listInstSalesUsers } from "@/actions/inst-shared";
import { LeadForm } from "@/components/os-sales/leads/LeadForm";

export default async function NewLeadPage() {
  const [territoriesResult, sourcesResult, usersResult] = await Promise.all([
    listTerritories({ activeOnly: true }), listInstLeadSources(), listInstSalesUsers(),
  ]);

  return (
    <Workspace>
      <PageHeader title="New Lead" description="Institutional Sales OS" />
      <div className="px-6 max-w-3xl pb-10">
        <LeadForm
          territories={territoriesResult.success ? territoriesResult.data : []}
          leadSources={sourcesResult.success ? sourcesResult.data : []}
          officers={usersResult.success ? usersResult.data.map((u) => ({ id: u.id, name: u.name ?? "Unnamed" })) : []}
        />
      </div>
    </Workspace>
  );
}
