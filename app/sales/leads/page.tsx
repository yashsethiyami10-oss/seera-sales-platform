import Link from "next/link";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listLeads } from "@/lib/sales-channel/repository";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAnyPermission(PERMISSIONS.LEADS_VIEW_ALL, PERMISSIONS.LEADS_VIEW_ASSIGNED);
  const { q = "", page = "1" } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const result = await listLeads({ q, page: current });
  const href = (p: number) => `/sales/leads?q=${encodeURIComponent(q)}&page=${p}`;

  return <section className="space-y-5 text-white">
    <header><h1 className="text-3xl font-semibold">Leads</h1><p className="mt-1 text-sm text-zinc-400">{result.total} inquiries not yet linked to a confirmed customer</p></header>
    <form><input name="q" defaultValue={q} placeholder="Reference, subject, customer, email…" className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></form>
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">Reference</th><th>Subject</th><th>Source</th><th>Status</th><th>Owner</th><th>Created</th></tr></thead>
        <tbody>{result.items.map((lead) => (
          <tr key={lead.id} className="border-t border-white/10">
            <td className="p-4"><Link className="text-amber-400" href={`/sales/inquiries/${lead.id}`}>{lead.inquiryNumber}</Link></td>
            <td>{lead.subject}</td>
            <td>{lead.leadSource.name}</td>
            <td>{lead.status.displayName}</td>
            <td>{lead.assignedOwner?.name ?? "Unassigned"}</td>
            <td>{lead.createdAt.toLocaleDateString()}</td>
          </tr>
        ))}</tbody>
      </table>
      {!result.items.length && <p className="p-10 text-center text-zinc-500">No leads match these filters.</p>}
    </div>
    <nav className="flex justify-between text-sm">
      {result.page > 1 ? <Link href={href(result.page - 1)}>Previous</Link> : <span />}
      <span>Page {result.page} of {result.pages}</span>
      {result.page < result.pages ? <Link href={href(result.page + 1)}>Next</Link> : <span />}
    </nav>
  </section>;
}
