import Link from "next/link";
import { MetricCard } from "@/components/os-sales/MetricCard";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { OrderSummaryWidget } from "@/components/os-orders/OrderSummaryWidget";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ManagerDashboardView({
  data,
}: {
  data: {
    opportunityPipeline: { totalPipelineValue: number; openOpportunities: number; won: number; lost: number; conversionRate: number } | null;
    quotations: { total: number; byStatus: Record<string, number>; pendingApprovalValue: number };
    todaysVisits: { id: string; officer: { name: string | null }; customer: { name: string } | null; lead: { organizationName: string } | null; outcome: string | null; checkOutAt: Date | null }[];
    missedVisits: number;
    pendingFollowUps: number;
    targets: { id: string; userName: string | null; periodType: string; targetRevenue: number; achievedRevenue: number }[];
    teamActivities: { id: string; officer: string | null; customer: string; visitDate: Date; outcome: string | null }[];
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Open Pipeline" value={inr(data.opportunityPipeline?.totalPipelineValue ?? 0)} sub={`${data.opportunityPipeline?.openOpportunities ?? 0} opportunities`} />
        <MetricCard label="Today's Visits" value={data.todaysVisits.length} />
        <MetricCard label="Missed Visits" value={data.missedVisits} sub="not checked out before today" />
        <MetricCard label="Pending Follow-ups" value={data.pendingFollowUps} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Quotations Pending Approval" value={data.quotations.byStatus.PENDING_APPROVAL ?? 0} sub={inr(data.quotations.pendingApprovalValue)} />
        <MetricCard label="Conversion Rate" value={`${data.opportunityPipeline?.conversionRate ?? 0}%`} />
        <Link href="/os/sales/quotations?status=PENDING_APPROVAL" className="muv-os-card rounded-2xl p-4 flex flex-col justify-center" style={{ border: "1px solid var(--card-border)" }}>
          <span className="text-sm" style={{ color: "var(--lavender)" }}>Review pending quotations →</span>
        </Link>
        <Link href="/os/sales/expenses" className="muv-os-card rounded-2xl p-4 flex flex-col justify-center" style={{ border: "1px solid var(--card-border)" }}>
          <span className="text-sm" style={{ color: "var(--lavender)" }}>Review pending expenses →</span>
        </Link>
      </div>

      <OrderSummaryWidget />

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Today's Visits" />
        <div className="mt-3 space-y-2">
          {data.todaysVisits.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No visits scheduled today.</p>}
          {data.todaysVisits.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>{v.customer?.name ?? v.lead?.organizationName ?? "—"} — {v.officer.name}</span>
              <span style={{ color: v.checkOutAt ? "rgba(var(--text-rgb),0.6)" : "#f59e0b" }}>{v.checkOutAt ? (v.outcome ?? "Completed") : "In progress"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Targets" description="This period, by team member." />
        <div className="mt-3 space-y-2">
          {data.targets.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No targets set for the current period.</p>}
          {data.targets.map((t) => {
            const pct = t.targetRevenue > 0 ? Math.min(100, Math.round((t.achievedRevenue / t.targetRevenue) * 100)) : 0;
            return (
              <div key={t.id} className="text-sm py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>{t.userName}</span>
                  <span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{inr(t.achievedRevenue)} / {inr(t.targetRevenue)} ({pct}%)</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(var(--text-rgb),0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--lavender)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Team Activity" description="Most recently updated visits." />
        <div className="mt-3 space-y-2">
          {data.teamActivities.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{a.officer} · {a.customer}</span>
              <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{new Date(a.visitDate).toLocaleDateString("en-IN")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
