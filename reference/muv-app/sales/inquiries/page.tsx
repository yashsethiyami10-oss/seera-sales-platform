import Link from "next/link";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { listInquiries } from "@/lib/sales-channel/repository";

export default async function InquiryListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const principal = await requireAnyPermission(PERMISSIONS.INQUIRIES_VIEW_ALL, PERMISSIONS.INQUIRIES_VIEW_ASSIGNED);
  void principal;
  const p = await searchParams;
  const result = await listInquiries({ q: p.q, page: Number(p.page) || 1, channel: p.channel, source: p.source, status: p.status, priority: p.priority, queue: p.queue, territory: p.territory, owner: p.owner, sort: p.sort });
  const query = new URLSearchParams(Object.entries(p).filter((entry): entry is [string, string] => !!entry[1]));
  const href = (page: number) => { query.set("page", String(page)); return `/sales/inquiries?${query}`; };
  return <section className="space-y-5 text-white"><header><h1 className="text-3xl font-semibold">Inquiry Management</h1><p className="mt-1 text-sm text-zinc-400">{result.total} authorized inquiries</p></header>
    <form className="grid gap-3 md:grid-cols-4"><input name="q" defaultValue={p.q} placeholder="Reference, customer, phone, email, GST…" className="md:col-span-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3" /><select name="priority" defaultValue={p.priority ?? ""} className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3"><option value="">All priorities</option>{["LOW","NORMAL","HIGH","URGENT"].map(v=><option key={v}>{v}</option>)}</select><button className="rounded-xl bg-amber-400 px-4 py-3 text-black">Search</button></form>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-zinc-400"><tr><th className="p-4">Reference</th><th>Customer</th><th>Channel</th><th>Status</th><th>Priority</th><th>Owner</th><th>Created</th></tr></thead><tbody>{result.items.map(i=><tr key={i.id} className="border-t border-white/10"><td className="p-4"><Link className="text-amber-400" href={`/sales/inquiries/${i.id}`}>{i.inquiryNumber}</Link></td><td>{i.customer?.businessName ?? i.customer?.name ?? "Manual review"}</td><td>{i.salesChannel.name}</td><td>{i.status.displayName}</td><td>{i.priority}</td><td>{i.assignedOwner?.name ?? i.assignmentQueue?.name ?? "Pending"}</td><td>{i.createdAt.toLocaleDateString()}</td></tr>)}</tbody></table>{!result.items.length&&<p className="p-10 text-center text-zinc-500">No inquiries match these filters.</p>}</div>
    <nav className="flex justify-between text-sm">{result.page>1?<Link href={href(result.page-1)}>Previous</Link>:<span/>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages?<Link href={href(result.page+1)}>Next</Link>:<span/>}</nav>
  </section>;
}
