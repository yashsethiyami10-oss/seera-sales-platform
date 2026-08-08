import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type CategoryEstimate = {
  category: string; label: string; unit: string; estimatedMonthlyQty: number | null;
  monthlyOpportunityValueInr: number | null; annualOpportunityValueInr: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH"; currentProduct: string | null; isCrossSellOpportunity: boolean; reasoning: string;
};
type Insight = { type: string; category?: string; summary: string; reasoning: string; confidence: "LOW" | "MEDIUM" | "HIGH" };
type Suggestion = { category: string; label: string; qty: number; unit: string };

const CONFIDENCE_COLOR: Record<string, string> = { LOW: "#f59e0b", MEDIUM: "var(--lavender)", HIGH: "#22c55e" };

/** Module 6 — MUV AI Consumption Intelligence results. Every number here traces to a stated `reasoning` — nothing is presented as unexplained certainty. */
export function ConsumptionEstimateView({
  estimate,
}: {
  estimate: {
    rulesVersion: string; potentialMonthlyOpportunity: number; potentialAnnualOpportunity: number;
    confidence: "LOW" | "MEDIUM" | "HIGH"; estimates: CategoryEstimate[]; insights: Insight[];
    suggestedTrialQuantity: Suggestion[]; suggestedFirstOrder: Suggestion[]; generatedAt: string | Date;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="MUV AI Consumption Intelligence" description={`Rules v${estimate.rulesVersion} · generated ${new Date(estimate.generatedAt).toLocaleString("en-IN")}`} />
        <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "rgba(var(--lavender-rgb),0.12)", color: CONFIDENCE_COLOR[estimate.confidence] }}>{estimate.confidence} confidence</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="muv-os-card rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Monthly Opportunity</p>
          <p className="text-lg font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{inr(estimate.potentialMonthlyOpportunity)}</p>
        </div>
        <div className="muv-os-card rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
          <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Annual Opportunity</p>
          <p className="text-lg font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{inr(estimate.potentialAnnualOpportunity)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["Category", "Estimated / Month", "Current Product", "Monthly ₹", "Confidence", "Why"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estimate.estimates.map((e) => (
              <tr key={e.category} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{e.label}{e.isCrossSellOpportunity && e.estimatedMonthlyQty && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs" style={{ background: "rgba(34,197,94,0.14)", color: "#22c55e" }}>cross-sell</span>}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.75)" }}>{e.estimatedMonthlyQty !== null ? `${e.estimatedMonthlyQty} ${e.unit}` : "—"}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{e.currentProduct ?? "None on file"}</td>
                <td className="px-3 py-2" style={{ color: "rgba(var(--text-rgb),0.75)" }}>{e.monthlyOpportunityValueInr !== null ? inr(e.monthlyOpportunityValueInr) : "—"}</td>
                <td className="px-3 py-2"><span style={{ color: CONFIDENCE_COLOR[e.confidence] }}>{e.confidence}</span></td>
                <td className="px-3 py-2 text-xs max-w-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{e.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estimate.insights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Insights</p>
          {estimate.insights.map((i, idx) => (
            <div key={idx} className="muv-os-card rounded-xl p-3" style={{ border: "1px solid var(--card-border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>{i.summary}</span>
                <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "rgba(var(--text-rgb),0.06)", color: "rgba(var(--text-rgb),0.5)" }}>{i.type.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>{i.reasoning}</p>
            </div>
          ))}
        </div>
      )}

      {estimate.suggestedTrialQuantity.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Suggested Trial Quantity</p>
            <ul className="space-y-1 text-sm">{estimate.suggestedTrialQuantity.map((s) => <li key={s.category} style={{ color: "rgba(var(--text-rgb),0.75)" }}>{s.label}: {s.qty} {s.unit}</li>)}</ul>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Suggested First Order</p>
            <ul className="space-y-1 text-sm">{estimate.suggestedFirstOrder.map((s) => <li key={s.category} style={{ color: "rgba(var(--text-rgb),0.75)" }}>{s.label}: {s.qty} {s.unit}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
