import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listInspections } from "@/actions/manufacturing";

export default async function QualityPage() {
  const result = await listInspections({ pageSize: 50 });

  return (
    <Workspace>
      <PageHeader title="Quality Control" description="Inspections and decisions are recorded from each batch's own page" />
      <div className="px-6 pb-10">
        {!result.success ? (
          <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Inspection #", "Type", "Batch", "Status", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {result.data.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No inspections yet.</td></tr>
                ) : result.data.items.map((i) => (
                  <tr key={i.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{i.inspectionNumber}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{i.inspectionType}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{i.batch?.batchNumber ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{i.status}</td>
                    <td className="px-4 py-3">
                      {i.batchId && <Link href={`/os/manufacturing/batches/${i.batchId}`} className="muv-os-interactive text-xs" style={{ color: "var(--lavender)" }}>Open Batch →</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Workspace>
  );
}
