import Link from "next/link";
import { Plus } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listSamples } from "@/actions/inst-samples";
import { TrialUpdateControl } from "@/components/os-sales/samples/TrialUpdateControl";

export default async function SamplesPage() {
  const result = await listSamples({ page: 1, pageSize: 50 });
  if (!result.success) {
    return <Workspace><PageHeader title="Samples" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total } = result.data;

  return (
    <Workspace>
      <PageHeader title="Samples" description={`${total} sample${total === 1 ? "" : "s"}`} actions={<Link href="/os/sales/samples/new" className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}><Plus size={14} /> Issue Sample</Link>} />
      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Sample #", "Product", "Customer", "Qty", "Issued", "Trial"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No samples issued yet.</td></tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{s.sampleNumber}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{s.product.name}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{s.customer.name}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{s.quantity} {s.unit}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{new Date(s.issuedDate).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3"><TrialUpdateControl sampleId={s.id} trialStatus={s.trialStatus} trialResult={s.trialResult} /></td>
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
