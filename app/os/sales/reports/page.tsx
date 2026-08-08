import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import {
  getPipelineReport, getConversionReport, getOpportunityReport, getTerritoryReport,
  getOfficerPerformanceReport, getSampleConversionReport, getLostReasonsReport, getRevenueTrendsReport,
} from "@/actions/inst-reports";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default async function ReportsPage() {
  const [pipeline, conversion, opportunity, territory, officers, samples, lostReasons, revenue] = await Promise.all([
    getPipelineReport(), getConversionReport(), getOpportunityReport(), getTerritoryReport(),
    getOfficerPerformanceReport(), getSampleConversionReport(), getLostReasonsReport(), getRevenueTrendsReport(6),
  ]);

  const Card = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
      <SectionHeader title={title} description={description} />
      <div className="mt-3">{children}</div>
    </section>
  );

  return (
    <Workspace>
      <PageHeader title="Reports" description="Module 14 — Pipeline, Conversion, Opportunity, Territory, Officer Performance, Sample Conversion, Lost Reasons, Revenue Trends" />
      <div className="px-6 pb-10 grid lg:grid-cols-2 gap-6">
        <Card title="Pipeline by Stage">
          {pipeline.success ? (
            <div className="space-y-1.5 text-sm">{pipeline.data.map((s) => <div key={s.stage} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{s.stage.replace(/_/g, " ")}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{s.count} · {inr(s.value)}</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{pipeline.error.message}</p>}
        </Card>

        <Card title="Conversion">
          {conversion.success ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p style={{ color: "rgba(var(--text-rgb),0.75)" }}>Lead win rate: {conversion.data.leadWinRate}%</p>
              <p style={{ color: "rgba(var(--text-rgb),0.75)" }}>Opportunity win rate: {conversion.data.opportunityWinRate}%</p>
              <p style={{ color: "rgba(var(--text-rgb),0.75)" }}>Total leads: {conversion.data.leadsTotal}</p>
              <p style={{ color: "rgba(var(--text-rgb),0.75)" }}>Total opportunities: {conversion.data.oppsTotal}</p>
            </div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{conversion.error.message}</p>}
        </Card>

        <Card title="Opportunity Report" description={opportunity.success ? `Average deal size: ${inr(opportunity.data.avgDealSize)}` : undefined}>
          {opportunity.success ? (
            <div className="space-y-1.5 text-sm">{opportunity.data.byStage.map((s) => <div key={s.stage} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{s.stage.replace(/_/g, " ")}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{s.count} · avg {s.avgProbability}%</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{opportunity.error.message}</p>}
        </Card>

        <Card title="Territory Performance">
          {territory.success ? (
            <div className="space-y-1.5 text-sm">{territory.data.map((t) => <div key={t.territoryId ?? "unassigned"} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{t.name}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{t.count} · {inr(t.value)}</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{territory.error.message}</p>}
        </Card>

        <Card title="Officer Performance">
          {officers.success ? (
            <div className="space-y-1.5 text-sm">{officers.data.map((o) => <div key={o.userId} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{o.name}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{o.won}W / {o.lost}L / {o.open} open · {inr(o.revenue)}</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{officers.error.message}</p>}
        </Card>

        <Card title="Sample Conversion" description={samples.success ? `${samples.data.conversionRate}% of completed trials went positive` : undefined}>
          {samples.success ? (
            <div className="space-y-1.5 text-sm">{samples.data.byResult.map((r) => <div key={r.result} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{r.result}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{r.count}</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{samples.error.message}</p>}
        </Card>

        <Card title="Lost Reasons">
          {lostReasons.success ? (
            lostReasons.data.length === 0 ? <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No lost opportunities yet.</p> :
            <div className="space-y-1.5 text-sm">{lostReasons.data.map((r) => <div key={r.reason} className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.75)" }}>{r.reason}</span><span style={{ color: "rgba(var(--text-rgb),0.6)" }}>{r.count} · {inr(r.value)}</span></div>)}</div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{lostReasons.error.message}</p>}
        </Card>

        <Card title="Revenue Trend (6 months)">
          {revenue.success ? (
            <div className="flex items-end gap-2 h-32">
              {revenue.data.map((m) => {
                const max = Math.max(...revenue.data.map((d) => d.revenue), 1);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(4, (m.revenue / max) * 100)}%`, background: "var(--lavender)" }} />
                    <span className="text-[10px]" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm" style={{ color: "#ef4444" }}>{revenue.error.message}</p>}
        </Card>
      </div>
    </Workspace>
  );
}
