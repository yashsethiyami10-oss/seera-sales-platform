import Link from "next/link";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listQuotations } from "@/actions/inst-quotations";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "rgba(var(--text-rgb),0.08)", PENDING_APPROVAL: "rgba(245,158,11,0.14)", APPROVED: "rgba(59,130,246,0.14)",
  SENT: "rgba(168,85,247,0.14)", ACCEPTED: "rgba(34,197,94,0.14)", REJECTED: "rgba(239,68,68,0.14)", EXPIRED: "rgba(239,68,68,0.1)", REVISED: "rgba(var(--text-rgb),0.08)",
};

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const result = await listQuotations({ status: params.status as never, page: 1, pageSize: 50 });
  if (!result.success) {
    return <Workspace><PageHeader title="Quotations" /><p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{result.error.message}</p></Workspace>;
  }
  const { items, total } = result.data;

  return (
    <Workspace>
      <PageHeader title="Quotations" description={`${total} quotation${total === 1 ? "" : "s"}`} />
      <div className="px-6 space-y-4">
        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Quotation #", "Customer", "Owner", "Version", "Status", "Grand Total"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No quotations yet.</td></tr>
              ) : (
                items.map((q) => {
                  const latest = q.versions[0];
                  return (
                    <tr key={q.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td className="px-4 py-3"><Link href={`/os/sales/quotations/${q.id}`} className="muv-os-interactive px-1 -mx-1" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{q.quotationNumber}</Link></td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{q.customer.name}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{q.owner.name}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>v{latest?.versionNumber ?? "—"}</td>
                      <td className="px-4 py-3">{latest && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: STATUS_COLOR[latest.status], color: "rgba(var(--text-rgb),0.85)" }}>{latest.status.replace(/_/g, " ")}</span>}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{latest ? `₹${latest.grandTotal.toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
