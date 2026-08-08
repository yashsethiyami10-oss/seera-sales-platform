import Link from "next/link";
import { requireAnyPermission, hasPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listOpportunities } from "@/lib/opportunity/repository";
import { prisma } from "@/lib/prisma";
import { OpportunityKanban } from "@/components/sales/opportunity-kanban";

export default async function OpportunityListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAnyPermission(PERMISSIONS.OPPORTUNITIES_VIEW_ALL, PERMISSIONS.OPPORTUNITIES_VIEW_ASSIGNED);
  const p = await searchParams;
  const [result, stages, canCreateOpportunity] = await Promise.all([listOpportunities({ q: p.q, page: Number(p.page) || 1, pageSize: p.view === "kanban" ? 100 : 20, stage: p.stage, status: p.status,
    priority: p.priority, territory: p.territory, customerType: p.customerType, channel: p.channel, sort: p.sort,
    minValue: p.minValue ? Number(p.minValue) : undefined, maxValue: p.maxValue ? Number(p.maxValue) : undefined }),
    prisma.opportunityStage.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" }, select: { code: true, name: true } }),
    hasPermission(PERMISSIONS.OPPORTUNITIES_CREATE)]);
  const query = new URLSearchParams(Object.entries(p).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const href = (page: number) => { query.set("page", String(page)); return `/sales/opportunities?${query}`; };
  return <section className="space-y-5 text-white">
    <header className="flex items-end justify-between"><div><h1 className="text-3xl font-semibold">Opportunity Pipeline</h1>
      <p className="mt-1 text-sm text-zinc-400">{result.total} authorized opportunities · configuration-driven stages</p></div>
      <div className="flex gap-2">{canCreateOpportunity && <Link href="/sales/opportunities/new" className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-medium text-black">New Opportunity</Link>}<Link href="/sales/opportunities?view=cards" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Cards</Link><Link href="/sales/opportunities?view=table" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Table</Link><Link href="/sales/opportunities?view=kanban" className="rounded-xl border border-white/10 px-3 py-2 text-sm">Kanban</Link><a href={`/api/sales/opportunities/export?${query}`} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Export CSV</a></div></header>
    <form className="grid gap-3 md:grid-cols-6">
      <input name="q" defaultValue={p.q} placeholder="Number, customer, phone, email, GST…" className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3" />
      <select name="status" defaultValue={p.status ?? ""} className="rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">All statuses</option>{["ACTIVE","ON_HOLD","CLOSED_WON","CLOSED_LOST"].map(v=><option key={v}>{v}</option>)}</select>
      <select name="priority" defaultValue={p.priority ?? ""} className="rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">All priorities</option>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v}>{v}</option>)}</select>
      <select name="sort" defaultValue={p.sort ?? ""} className="rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">Newest</option><option value="oldest">Oldest</option><option value="highest_value">Highest Value</option><option value="lowest_value">Lowest Value</option><option value="probability">Highest Probability</option><option value="expected_close">Expected Close</option><option value="updated">Recently Updated</option></select>
      <button className="rounded-xl bg-amber-400 px-4 py-3 text-black">Search</button>
    </form>
    {p.view==="kanban"?<OpportunityKanban stages={stages} cards={result.items.map(item=>({id:item.id,number:item.opportunityNumber,customer:item.customer.businessName??item.customer.name,stage:item.currentStage.code,value:`${item.currency} ${item.estimatedValue}`,probability:item.probability}))}/>:p.view==="table"?<div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead><tr>{["Opportunity","Customer","Owner","Stage","Value","Probability","Expected Close"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{result.items.map(item=><tr key={item.id} className="border-t border-white/10"><td className="p-3"><Link href={`/sales/opportunities/${item.id}`} className="text-amber-400">{item.opportunityNumber}</Link></td><td>{item.customer.businessName??item.customer.name}</td><td>{item.owner.name}</td><td>{item.currentStage.name}</td><td>{item.currency} {item.estimatedValue.toString()}</td><td>{item.probability}%</td><td>{item.expectedCloseDate?.toLocaleDateString()??"—"}</td></tr>)}</tbody></table></div>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.items.map(item=><Link key={item.id} href={`/sales/opportunities/${item.id}`} className="rounded-2xl border border-white/10 bg-white/[.03] p-5 hover:border-amber-400/50">
      <div className="flex justify-between"><span className="text-sm text-amber-400">{item.opportunityNumber}</span><span className="text-xs text-zinc-400">{item.priority.name}</span></div>
      <h2 className="mt-3 text-lg font-medium">{item.customer.businessName ?? item.customer.name}</h2>
      <div className="mt-4 flex justify-between text-sm text-zinc-400"><span>{item.currentStage.name}</span><span>{item.probability}%</span></div>
      <div className="mt-2 flex justify-between"><span>{item.owner.name ?? "Unassigned"}</span><strong>{item.currency} {item.estimatedValue.toString()}</strong></div>
      <p className="mt-3 text-xs text-zinc-500">Expected {item.expectedCloseDate?.toLocaleDateString() ?? "not set"} · Last activity {item.activities[0]?.createdAt.toLocaleDateString() ?? "none"}</p>
    </Link>)}</div>}
    {!result.items.length&&<p className="rounded-2xl border border-white/10 p-10 text-center text-zinc-500">No opportunities match these filters.</p>}
    <nav className="flex justify-between text-sm">{result.page>1?<Link href={href(result.page-1)}>Previous</Link>:<span/>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages?<Link href={href(result.page+1)}>Next</Link>:<span/>}</nav>
  </section>;
}
