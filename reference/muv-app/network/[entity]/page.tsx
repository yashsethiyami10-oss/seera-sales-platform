import { notFound } from "next/navigation";
import { searchPartners } from "@/lib/enterprise-network/partner-service";
import { listAgreements } from "@/lib/enterprise-network/governance-service";
import { listClaims } from "@/lib/enterprise-network/operations-service";
import { listSupportCases } from "@/lib/enterprise-network/enablement-service";

export const dynamic = "force-dynamic";

type Row = { id: string; number: string; label: string; status: string; date: Date };

const configuration: Record<string, { title: string; load: (q: string, page: number) => Promise<{ items: Row[]; total: number; page: number; pages: number }> }> = {
  partners: {
    title: "Partners",
    load: async (q, page) => {
      const r = await searchPartners({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((p) => ({ id: p.id, number: p.partnerNumber, label: p.legalName, status: p.lifecycleStatus, date: p.updatedAt })) };
    },
  },
  agreements: {
    title: "Agreements",
    load: async (q, page) => {
      const r = await listAgreements({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((a) => ({ id: a.id, number: a.agreementNumber, label: a.partner.legalName, status: a.status, date: a.updatedAt })) };
    },
  },
  claims: {
    title: "Claims",
    load: async (q, page) => {
      const r = await listClaims({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((c) => ({ id: c.id, number: c.claimNumber, label: c.partner.legalName, status: c.status, date: c.createdAt })) };
    },
  },
  support: {
    title: "Support Cases",
    load: async (q, page) => {
      const r = await listSupportCases({ search: q, page, pageSize: 20 });
      return { ...r, items: r.items.map((s) => ({ id: s.id, number: s.caseNumber, label: `${s.partner.legalName} — ${s.subject}`, status: s.status, date: s.createdAt })) };
    },
  },
};

/**
 * Enterprise UI Integration — Business Network UI. Structurally identical
 * to app/enterprise/[module]/page.tsx's established pattern: one dynamic
 * route, a small per-entity configuration map, each entry calling an
 * existing (or, for agreements/claims/support, newly added pure-read)
 * Business Service function — no domain logic duplicated here.
 */
export default async function NetworkEntityPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { entity } = await params, config = configuration[entity];
  if (!config) notFound();
  const query = await searchParams, q = query.q?.trim() ?? "", page = Math.max(1, Number(query.page ?? 1));
  const result = await config.load(q, page);

  return <section className="space-y-5">
    <header><h1 className="text-3xl font-semibold">{config.title}</h1><p className="mt-1 text-sm text-zinc-400">Permission-aware, organization-scoped records.</p></header>
    <form className="flex gap-2"><input name="q" defaultValue={q} aria-label="Search" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2" placeholder={`Search ${config.title.toLowerCase()}`} /><button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">Search</button></form>
    <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-3">Number</th><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead><tbody>{result.items.map((row) => <tr key={row.id} className="border-t border-white/10"><td className="p-3 font-mono text-xs">{row.number}</td><td className="p-3">{row.label}</td><td className="p-3">{row.status}</td><td className="p-3 text-zinc-400">{row.date.toLocaleString()}</td></tr>)}</tbody></table>{!result.items.length && <p className="p-8 text-center text-zinc-500">No records found.</p>}</div>
    <div className="flex justify-between text-sm">
      {result.page > 1 ? <a href={`?q=${encodeURIComponent(q)}&page=${result.page - 1}`} className="text-amber-400">Previous</a> : <span />}
      <span className="text-zinc-500">Page {result.page} of {result.pages}</span>
      {result.page < result.pages ? <a href={`?q=${encodeURIComponent(q)}&page=${result.page + 1}`} className="text-amber-400">Next</a> : <span />}
    </div>
  </section>;
}
