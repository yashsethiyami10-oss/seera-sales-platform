import Link from "next/link";
import { Plus } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listVisits } from "@/actions/inst-visits";

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const result = await listVisits({ page, pageSize: 30 });

  if (!result.success) {
    return <Workspace><PageHeader title="Visits" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total, pages } = result.data;

  return (
    <Workspace>
      <PageHeader
        title="Visits" description={`${total} visit${total === 1 ? "" : "s"}`}
        actions={<Link href="/os/sales/visits/new" className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}><Plus size={14} /> Check In</Link>}
      />
      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Date", "Customer", "Officer", "Survey", "Status"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No visits yet.</td></tr>
              ) : (
                items.map((v) => (
                  <tr key={v.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3"><Link href={`/os/sales/visits/${v.id}`} className="muv-os-interactive px-1 -mx-1" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{new Date(v.visitDate).toLocaleDateString("en-IN")}</Link></td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.officer.name}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{v.survey ? "Captured" : "—"}</td>
                    <td className="px-4 py-3" style={{ color: v.checkOutAt ? "rgba(var(--text-rgb),0.6)" : "#f59e0b" }}>{v.checkOutAt ? (v.outcome ?? "Completed") : "In progress"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={`/os/sales/visits?page=${page - 1}`} className="muv-os-interactive px-2 py-1">Previous</Link>}
              {page < pages && <Link href={`/os/sales/visits?page=${page + 1}`} className="muv-os-interactive px-2 py-1">Next</Link>}
            </div>
          </nav>
        )}
      </div>
    </Workspace>
  );
}
