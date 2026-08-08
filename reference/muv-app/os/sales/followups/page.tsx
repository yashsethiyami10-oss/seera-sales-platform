import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listFollowUps } from "@/actions/inst-followups";
import { FollowUpForm } from "@/components/os-sales/followups/FollowUpForm";
import { FollowUpActions } from "@/components/os-sales/followups/FollowUpActions";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const result = await listFollowUps({ opportunityId: params.opportunityId, page: 1, pageSize: 50 });
  if (!result.success) {
    return <Workspace><PageHeader title="Follow-ups" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total } = result.data;
  const overdueCount = items.filter((f) => f.isOverdue).length;

  return (
    <Workspace>
      <PageHeader title="Follow-ups" description={`${total} total · ${overdueCount} overdue`} />
      <div className="px-6 mb-4">
        <div className="muv-os-card rounded-2xl p-3" style={{ border: "1px solid var(--card-border)" }}>
          <FollowUpForm opportunityId={params.opportunityId} />
        </div>
      </div>
      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Due", "Type", "Related To", "Assigned To", "Notes", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No follow-ups.</td></tr>
              ) : (
                items.map((f) => (
                  <tr key={f.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: f.isOverdue ? "#ef4444" : "rgba(var(--text-rgb),0.85)" }}>{new Date(f.dueDate).toLocaleDateString("en-IN")}{f.isOverdue && " (overdue)"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.type}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.customer?.name ?? f.lead?.organizationName ?? f.opportunity?.opportunityNumber ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.assignedTo.name}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{f.notes ?? "—"}</td>
                    <td className="px-4 py-3"><FollowUpActions id={f.id} status={f.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
