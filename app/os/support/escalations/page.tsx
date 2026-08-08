import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listEscalations, getEscalationReport } from "@/actions/support";
import { EscalationsManager } from "@/components/os-support/EscalationsManager";

export default async function EscalationsPage() {
  const [escalationsResult, reportResult] = await Promise.all([
    listEscalations({ unresolvedOnly: true, pageSize: 100 }),
    getEscalationReport(),
  ]);
  return (
    <Workspace>
      <PageHeader title="Escalations" description="Agent -> Senior Agent -> Support Manager -> Department Head -> Founder" />
      <div className="px-6 pb-10">
        {escalationsResult.success ? (
          <EscalationsManager
            escalations={escalationsResult.data.items.map((e) => ({ id: e.id, ticketId: e.ticketId, level: e.level, reason: e.reason, triggerType: e.triggerType, escalatedAt: e.escalatedAt }))}
            byLevel={reportResult.success ? reportResult.data.byLevel : []}
          />
        ) : (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{escalationsResult.error.message}</p>
        )}
      </div>
    </Workspace>
  );
}
