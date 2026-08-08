import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getOpenClosedTicketCounts, getAgentProductivity, getComplaintCategories, getEscalationReport, getSupportTrends, getSlaPerformance, getKnowledgeUsage } from "@/actions/support";

const cardStyle = { border: "1px solid var(--card-border)" } as const;

export default async function SupportReportsPage() {
  const [open, agents, complaints, escalations, trends, sla, knowledge] = await Promise.all([
    getOpenClosedTicketCounts(), getAgentProductivity({}), getComplaintCategories(), getEscalationReport(), getSupportTrends({}), getSlaPerformance({}), getKnowledgeUsage(),
  ]);

  return (
    <Workspace>
      <PageHeader title="Support Reports" description="Open/Closed, SLA performance, agent productivity, complaints, escalations, trends, knowledge usage" />
      <div className="px-6 pb-10 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Open Tickets</p><p className="text-xl font-semibold mt-1">{open.success ? open.data.open : "—"}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Closed Tickets</p><p className="text-xl font-semibold mt-1">{open.success ? open.data.closed : "—"}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>SLA Breach Rate</p><p className="text-xl font-semibold mt-1">{sla.success ? `${sla.data.breachRate}%` : "—"}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Unresolved Escalations</p><p className="text-xl font-semibold mt-1">{escalations.success ? escalations.data.unresolved : "—"}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}>
            <p className="text-sm font-medium mb-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Agent Productivity</p>
            {agents.success && agents.data.length > 0 ? agents.data.map((a) => (
              <p key={a.agentId} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{a.agentId.slice(0, 10)}… — {a.resolved} resolved, avg {a.avgResolutionMinutes}min, {a.reopened} reopened</p>
            )) : <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No resolved tickets yet.</p>}
          </div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}>
            <p className="text-sm font-medium mb-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Complaint Categories</p>
            {complaints.success && complaints.data.length > 0 ? complaints.data.map((c) => (
              <p key={c.category} className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.category}: {c.count}</p>
            )) : <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>No complaints yet.</p>}
          </div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}>
            <p className="text-sm font-medium mb-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Support Trends (30 days)</p>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{trends.success ? `${trends.data.totalInWindow} tickets` : "—"}</p>
          </div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}>
            <p className="text-sm font-medium mb-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Knowledge Usage</p>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{knowledge.success ? `${knowledge.data.articleViews.length} articles viewed, ${knowledge.data.templateUsage.length} templates used` : "—"}</p>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
