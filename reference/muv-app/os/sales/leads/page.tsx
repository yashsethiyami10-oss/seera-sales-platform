import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listLeads } from "@/actions/inst-leads";

const STATUS_COLOR: Record<string, string> = {
  NEW: "rgba(var(--lavender-rgb),0.12)", CONTACTED: "rgba(var(--lavender-rgb),0.12)",
  QUALIFIED: "rgba(59,130,246,0.14)", VISIT_SCHEDULED: "rgba(59,130,246,0.14)",
  SAMPLE_REQUIRED: "rgba(245,158,11,0.14)", SAMPLE_GIVEN: "rgba(245,158,11,0.14)",
  TRIAL_RUNNING: "rgba(245,158,11,0.14)", QUOTATION_SENT: "rgba(168,85,247,0.14)",
  NEGOTIATION: "rgba(168,85,247,0.14)", WON: "rgba(34,197,94,0.14)", LOST: "rgba(239,68,68,0.14)",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const result = await listLeads({
    q: params.q || undefined, status: params.status as never, priority: params.priority as never, page, pageSize: 20,
  });

  if (!result.success) {
    return <Workspace><PageHeader title="Leads" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total, pages } = result.data;

  return (
    <Workspace>
      <PageHeader
        title="Leads" description={`${total} lead${total === 1 ? "" : "s"}`}
        actions={
          <Link href="/os/sales/leads/new" className="muv-os-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
            <Plus size={14} /> New Lead
          </Link>
        }
      />
      <form className="px-6 mb-4 flex gap-2" method="get">
        <input name="q" defaultValue={params.q} placeholder="Search organization, contact, phone…" className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent flex-1" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }} />
        <select name="status" defaultValue={params.status} className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <button type="submit" className="muv-os-btn-ghost rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.8)" }}>Filter</button>
      </form>

      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Organization", "Contact", "Priority", "Est. Value", "Status", "Assigned To", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No leads match these filters.</td></tr>
              ) : (
                items.map((l) => (
                  <tr key={l.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3"><Link href={`/os/sales/leads/${l.id}`} className="muv-os-interactive px-1 -mx-1" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{l.organizationName}</Link></td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.contactPerson} · {l.phone}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.priority}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{l.estimatedValue.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3"><span className="rounded-full px-2 py-0.5 text-xs" style={{ background: STATUS_COLOR[l.status], color: "rgba(var(--text-rgb),0.85)" }}>{l.status.replace(/_/g, " ")}</span></td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{l.assignedTo?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-3"><Link href={`/os/sales/leads/${l.id}`} className="muv-os-interactive flex w-fit items-center gap-1 px-2 py-1 text-xs" style={{ color: "var(--lavender)" }}>View <ArrowRight size={12} /></Link></td>
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
              {page > 1 && <Link href={`/os/sales/leads?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`} className="muv-os-interactive px-2 py-1">Previous</Link>}
              {page < pages && <Link href={`/os/sales/leads?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`} className="muv-os-interactive px-2 py-1">Next</Link>}
            </div>
          </nav>
        )}
      </div>
    </Workspace>
  );
}
