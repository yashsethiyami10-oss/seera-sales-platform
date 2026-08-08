import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { getCsatTrend, getNpsScore, listFeedback } from "@/actions/support";

const cardStyle = { border: "1px solid var(--card-border)" } as const;

export default async function SupportFeedbackPage() {
  const [csatResult, npsResult, feedbackResult] = await Promise.all([
    getCsatTrend({}),
    getNpsScore(),
    listFeedback({ pageSize: 50 }),
  ]);

  return (
    <Workspace>
      <PageHeader title="Feedback, CSAT & NPS" description="Measures the journey, not one score" />
      <div className="px-6 pb-10 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>CSAT Average</p><p className="text-xl font-semibold mt-1">{csatResult.success && csatResult.data.average !== null ? `${csatResult.data.average}/5` : "—"}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>CSAT Responses</p><p className="text-xl font-semibold mt-1">{csatResult.success ? csatResult.data.count : 0}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>NPS</p><p className="text-xl font-semibold mt-1">{npsResult.success && npsResult.data.nps !== null ? npsResult.data.nps : "—"}</p></div>
          <div className="muv-os-card rounded-2xl p-4" style={cardStyle}><p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>NPS Responses</p><p className="text-xl font-semibold mt-1">{npsResult.success ? npsResult.data.count : 0}</p></div>
        </div>
        <div className="overflow-x-auto rounded-2xl" style={cardStyle}>
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Customer", "Rating", "Comment", "Submitted"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {!feedbackResult.success || feedbackResult.data.items.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No feedback yet.</td></tr> :
                feedbackResult.data.items.map((f) => (
                  <tr key={f.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.customerId.slice(0, 10)}…</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.rating}/5</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{f.comment ?? ""}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{new Date(f.submittedAt).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
