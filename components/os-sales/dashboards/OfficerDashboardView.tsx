import Link from "next/link";
import { MetricCard } from "@/components/os-sales/MetricCard";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { QuickCustomerSearch } from "@/components/os-sales/QuickCustomerSearch";
import { OrderSummaryWidget } from "@/components/os-orders/OrderSummaryWidget";

export function OfficerDashboardView({
  data,
}: {
  data: {
    plan: { notes: string | null; endOfDaySummary: string | null } | null;
    route: { plannedDistanceKm: number | null } | null;
    todaysVisits: { id: string; customer: { name: string } | null; lead: { organizationName: string } | null; checkOutAt: Date | null }[];
    followUps: { id: string; type: string; dueDate: Date; isOverdue: boolean; customer: { name: string } | null; lead: { organizationName: string } | null }[];
    tasks: { id: string; title: string; status: string; dueDate: Date | null }[];
    assignedLeads: { id: string; organizationName: string; status: string; estimatedValue: number }[];
    samples: { id: string; product: { name: string }; customer: { name: string }; trialStatus: string }[];
    opportunitiesInProgress: number;
    expectedPipelineValue: number;
    quotationsAwaitingAction: number;
  };
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Today's Visits" value={data.todaysVisits.length} sub={`${data.todaysVisits.filter((v) => v.checkOutAt).length} completed`} />
        <MetricCard label="Follow-ups Due" value={data.followUps.length} sub={`${data.followUps.filter((f) => f.isOverdue).length} overdue`} />
        <MetricCard label="Open Tasks" value={data.tasks.length} />
        <MetricCard label="Route Distance" value={data.route?.plannedDistanceKm ? `${data.route.plannedDistanceKm} km` : "Not planned"} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Opportunities In Progress" value={data.opportunitiesInProgress} />
        <MetricCard label="Quotations Awaiting Action" value={data.quotationsAwaitingAction} />
        <MetricCard label="Expected Pipeline Value" value={`₹${data.expectedPipelineValue.toLocaleString("en-IN")}`} />
      </div>

      <OrderSummaryWidget />

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Quick Customer Search" />
        <div className="mt-3"><QuickCustomerSearch /></div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Today's Plan" actions={<Link href="/os/sales/planner" className="text-xs" style={{ color: "var(--lavender)" }}>Open Planner →</Link>} />
          <p className="mt-2 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{data.plan?.notes || "No notes for today yet."}</p>
        </section>
        <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Today's Visits" actions={<Link href="/os/sales/visits" className="text-xs" style={{ color: "var(--lavender)" }}>All Visits →</Link>} />
          <div className="mt-2 space-y-1.5">
            {data.todaysVisits.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No visits planned today.</p>}
            {data.todaysVisits.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{v.customer?.name ?? v.lead?.organizationName}</span>
                <span style={{ color: v.checkOutAt ? "rgba(var(--text-rgb),0.5)" : "#f59e0b" }}>{v.checkOutAt ? "Done" : "Pending"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Follow-ups" actions={<Link href="/os/sales/followups" className="text-xs" style={{ color: "var(--lavender)" }}>All →</Link>} />
          <div className="mt-2 space-y-1.5">
            {data.followUps.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{f.customer?.name ?? f.lead?.organizationName} — {f.type}</span>
                <span style={{ color: f.isOverdue ? "#ef4444" : "rgba(var(--text-rgb),0.5)" }}>{new Date(f.dueDate).toLocaleDateString("en-IN")}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Assigned Leads" actions={<Link href="/os/sales/leads" className="text-xs" style={{ color: "var(--lavender)" }}>All →</Link>} />
          <div className="mt-2 space-y-1.5">
            {data.assignedLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{l.organizationName}</span>
                <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{l.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
        <SectionHeader title="Samples In Progress" actions={<Link href="/os/sales/samples" className="text-xs" style={{ color: "var(--lavender)" }}>All →</Link>} />
        <div className="mt-2 space-y-1.5">
          {data.samples.length === 0 && <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No open samples.</p>}
          {data.samples.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{s.product.name} — {s.customer.name}</span>
              <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{s.trialStatus}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
