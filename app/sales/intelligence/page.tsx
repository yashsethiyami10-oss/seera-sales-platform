import Link from "next/link";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listCustomerIntelligence } from "@/lib/growth/repository";

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [principal, q] = await Promise.all([
    requireAnyPermission(PERMISSIONS.INTELLIGENCE_VIEW_ALL, PERMISSIONS.INTELLIGENCE_VIEW_ASSIGNED, PERMISSIONS.INTELLIGENCE_VIEW_SUPPORT),
    searchParams,
  ]);
  const scope = principal.isFounder || principal.permissions.has(PERMISSIONS.INTELLIGENCE_VIEW_ALL) ? {}
    : { ownerUserId: principal.id, territoryId: principal.territoryId ?? undefined, institutionalOnly: principal.salesRole.name === "Institutional Sales Officer" };
  const data = await listCustomerIntelligence({ search: q.search, status: q.status, page: Number(q.page ?? 1), sort: (q.sort as never) ?? "updatedAt" }, scope);
  return <section className="space-y-6 text-white">
    <header><p className="text-xs uppercase tracking-[.2em] text-amber-400">Customer Growth & Intelligence</p><h1 className="mt-2 text-3xl font-semibold">Customer Intelligence</h1><p className="mt-1 text-sm text-zinc-400">Deterministic customer value, activity, purchase, payment, status and segmentation metrics.</p></header>
    <form className="flex flex-wrap gap-3"><input name="search" defaultValue={q.search} placeholder="Customer, business, email, phone or GST" className="min-w-72 rounded-xl border border-white/10 bg-white/5 px-4 py-2"/><select name="status" defaultValue={q.status ?? ""} className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2"><option value="">All statuses</option>{["NEW","ACTIVE","REPEAT","INACTIVE","DORMANT","AT_RISK","REACTIVATED"].map(x=><option key={x}>{x}</option>)}</select><button className="rounded-xl bg-amber-500 px-4 py-2 text-black">Search</button>{principal.permissions.has(PERMISSIONS.INTELLIGENCE_EXPORT)||principal.isFounder?<Link className="rounded-xl border border-white/15 px-4 py-2" href="/api/sales/intelligence/export">Export CSV</Link>:null}</form>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-sm"><thead className="bg-white/5 text-left text-zinc-400"><tr>{["Customer","Status","Revenue","Orders","AOV","Outstanding","Collection","Calculated"].map(x=><th key={x} className="p-4">{x}</th>)}</tr></thead><tbody>{data.rows.map(({customer,profile})=><tr key={profile.id} className="border-t border-white/10"><td className="p-4"><Link href={`/sales/customers/${customer.id}`} className="text-amber-400">{customer.businessName??customer.name}</Link><div className="text-xs text-zinc-500">{customer.assignedOwner?.name??"Unassigned"} · {customer.assignedTerritory?.name??"No territory"}</div></td><td className="p-4">{profile.statusCode}</td><td className="p-4">₹{Number(profile.netRevenue).toLocaleString()}</td><td className="p-4">{profile.totalOrders}</td><td className="p-4">₹{Number(profile.averageOrderValue).toLocaleString()}</td><td className="p-4">₹{Number(profile.outstandingAmount).toLocaleString()}</td><td className="p-4">{(Number(profile.collectionRate)*100).toFixed(1)}%</td><td className="p-4 text-zinc-400">{profile.lastCalculatedAt.toLocaleDateString()}</td></tr>)}</tbody></table>{!data.rows.length?<p className="p-8 text-center text-zinc-500">No calculated customer intelligence profiles match these filters.</p>:null}</div>
    <nav className="flex justify-between text-sm text-zinc-400"><span>Page {data.page} of {Math.max(1,data.pageCount)} · {data.total} records</span><div className="flex gap-3">{data.page>1?<Link href={`?page=${data.page-1}`}>Previous</Link>:null}{data.page<data.pageCount?<Link href={`?page=${data.page+1}`}>Next</Link>:null}</div></nav>
  </section>;
}
