import { notFound } from "next/navigation";
import { listJournals } from "@/lib/enterprise-finance/journal-service";
import { listReceivableInvoices } from "@/lib/enterprise-finance/ar-service";
import { listVendorBills } from "@/lib/enterprise-finance/ap-service";
import { listExpenseClaims } from "@/lib/enterprise-finance/expense-service";

export const dynamic = "force-dynamic";

type Row = { id: string; number: string; label: string; status: string; date: Date };

const configuration: Record<string, { title: string; load: (q: string, page: number) => Promise<{ items: Row[]; total: number; page: number; pageSize: number }> }> = {
  journals: {
    title: "Journals",
    load: async (q, page) => {
      const r = await listJournals({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((j) => ({ id: j.id, number: j.journalNumber, label: j.description ?? j.journalType, status: j.status, date: j.postingDate })) };
    },
  },
  receivables: {
    title: "Receivables",
    load: async (q, page) => {
      const r = await listReceivableInvoices({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((i) => ({ id: i.id, number: i.invoiceNumber, label: `${i.currency} ${i.totalAmount}`, status: i.status, date: i.dueDate })) };
    },
  },
  payables: {
    title: "Payables",
    load: async (q, page) => {
      const r = await listVendorBills({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((b) => ({ id: b.id, number: b.billNumber, label: `${b.currency} ${b.totalAmount}`, status: b.status, date: b.dueDate })) };
    },
  },
  expenses: {
    title: "Expense Claims",
    load: async (q, page) => {
      const r = await listExpenseClaims({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((c) => ({ id: c.id, number: c.claimNumber, label: `${c.currency} ${c.totalClaimedAmount}`, status: c.status, date: c.createdAt })) };
    },
  },
};

/**
 * Enterprise UI Integration — Enterprise Finance UI. Same dynamic-route
 * pattern as /enterprise/[module] and /network/[entity]: one small
 * per-entity map, each entry calling an existing (or, for Expense Claims,
 * a newly added pure-read) Business Service function.
 */
export default async function FinanceEntityPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { entity } = await params, config = configuration[entity];
  if (!config) notFound();
  const query = await searchParams, q = query.q?.trim() ?? "", page = Math.max(1, Number(query.page ?? 1));
  const result = await config.load(q, page);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return <section className="space-y-5">
    <header><h1 className="text-3xl font-semibold">{config.title}</h1><p className="mt-1 text-sm text-zinc-400">Permission-aware, organization-scoped records.</p></header>
    <form className="flex gap-2"><input name="q" defaultValue={q} aria-label="Search" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2" placeholder={`Search ${config.title.toLowerCase()}`} /><button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">Search</button></form>
    <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-3">Number</th><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead><tbody>{result.items.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 font-mono text-xs">{row.number}</td><td className="p-3">{row.label}</td><td className="p-3">{row.status}</td><td className="p-3 text-zinc-400">{row.date.toLocaleString()}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-8 text-center text-zinc-500">No records found.</p>}</div>
    <div className="flex justify-between text-sm">
      {result.page > 1 ? <a href={`?q=${encodeURIComponent(q)}&page=${result.page - 1}`} className="text-amber-400">Previous</a> : <span />}
      <span className="text-zinc-500">Page {result.page} of {pages}</span>
      {result.page < pages ? <a href={`?q=${encodeURIComponent(q)}&page=${result.page + 1}`} className="text-amber-400">Next</a> : <span />}
    </div>
  </section>;
}
