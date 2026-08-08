import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listOpportunities } from "@/actions/inst-opportunities";

const STAGES = ["QUALIFICATION", "CUSTOMER_VISIT", "REQUIREMENT_ANALYSIS", "SAMPLE_ISSUED", "FOLLOW_UP", "TRIAL", "QUOTATION", "NEGOTIATION", "WON", "LOST"] as const;
const STAGE_LABEL: Record<string, string> = {
  QUALIFICATION: "Qualification", CUSTOMER_VISIT: "Customer Visit", REQUIREMENT_ANALYSIS: "Requirement Analysis",
  SAMPLE_ISSUED: "Sample Issued", FOLLOW_UP: "Follow-up", TRIAL: "Trial", QUOTATION: "Quotation",
  NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost",
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const result = await listOpportunities({ q: params.q || undefined, page: 1, pageSize: 100 });

  if (!result.success) {
    return <Workspace><PageHeader title="Opportunities" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }

  const byStage = new Map<string, typeof result.data.items>();
  for (const stage of STAGES) byStage.set(stage, []);
  for (const opp of result.data.items) byStage.get(opp.stage)?.push(opp);

  return (
    <Workspace>
      <PageHeader title="Opportunities" description={`${result.data.total} opportunities across the pipeline`} />
      <form className="px-6 mb-4" method="get">
        <input name="q" defaultValue={params.q} placeholder="Search opportunity number or customer…" className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full max-w-md" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }} />
      </form>
      <div className="px-6 pb-10 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: `${STAGES.length * 260}px` }}>
          {STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const total = items.reduce((sum, o) => sum + o.estimatedRevenue, 0);
            return (
              <div key={stage} className="flex-1 min-w-[240px]">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{STAGE_LABEL[stage]}</h3>
                  <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((o) => (
                    <Link key={o.id} href={`/os/sales/opportunities/${o.id}`} className="muv-os-card block rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
                      <p className="text-sm font-medium truncate" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{o.customer.businessName ?? o.customer.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(var(--text-rgb),0.5)" }}>{o.opportunityNumber}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--lavender)" }}>₹{o.estimatedRevenue.toLocaleString("en-IN")}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{o.owner.name}</p>
                    </Link>
                  ))}
                </div>
                {items.length > 0 && <p className="mt-2 px-1 text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>₹{total.toLocaleString("en-IN")} total</p>}
              </div>
            );
          })}
        </div>
      </div>
    </Workspace>
  );
}
