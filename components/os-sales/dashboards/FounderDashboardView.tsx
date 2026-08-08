import Link from "next/link";
import { MetricCard } from "@/components/os-sales/MetricCard";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { OrderSummaryWidget } from "@/components/os-orders/OrderSummaryWidget";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function FounderDashboardView({
  data,
}: {
  data: {
    totalPipeline: number; openOpportunities: number; conversionRate: number;
    revenueThisMonth: number; ordersWonThisMonth: number; leadsTotal: number;
    leadsByStatus: Record<string, number>; pendingFollowUps: number;
    samplePipeline: Record<string, number>;
    quotations: { total: number; byStatus: Record<string, number>; pendingApprovalValue: number };
    teamPerformance: { userId: string; name: string; won: number; revenue: number }[];
    territoryPerformance: { territoryId: string | null; name: string; count: number; value: number }[];
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Pipeline" value={inr(data.totalPipeline)} sub={`${data.openOpportunities} open opportunities`} />
        <MetricCard label="Revenue This Month" value={inr(data.revenueThisMonth)} sub={`${data.ordersWonThisMonth} orders won`} />
        <MetricCard label="Conversion Rate" value={`${data.conversionRate}%`} sub="opportunity win rate" />
        <MetricCard label="Pending Follow-ups" value={data.pendingFollowUps} sub="overdue, across every officer" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Leads" value={data.leadsTotal} />
        <MetricCard label="Samples In Trial" value={data.samplePipeline.IN_PROGRESS ?? 0} sub={`${data.samplePipeline.PENDING ?? 0} pending`} />
        <MetricCard label="Quotations" value={data.quotations.total} sub={`${data.quotations.byStatus.PENDING_APPROVAL ?? 0} pending approval`} />
        <MetricCard label="Approval Value Waiting" value={inr(data.quotations.pendingApprovalValue)} />
      </div>

      <OrderSummaryWidget />

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Team Performance" description="Opportunities won and revenue by Sales Officer, all time." />
        <div className="mt-3 space-y-2">
          {data.teamPerformance.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No won opportunities yet.</p>}
          {data.teamPerformance.map((row) => (
            <div key={row.userId} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>{row.name}</span>
              <span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{row.won} won · {inr(row.revenue)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Territory Performance" />
        <div className="mt-3 space-y-2">
          {data.territoryPerformance.map((row) => (
            <div key={row.territoryId ?? "unassigned"} className="flex items-center justify-between text-sm py-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
              <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>{row.name}</span>
              <span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{row.count} opportunities · {inr(row.value)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3 text-sm">
        <Link href="/os/sales/opportunities" className="muv-os-interactive px-2 py-1" style={{ color: "var(--lavender)" }}>View all opportunities →</Link>
        <Link href="/os/sales/reports" className="muv-os-interactive px-2 py-1" style={{ color: "var(--lavender)" }}>Full reports →</Link>
      </div>
    </div>
  );
}
