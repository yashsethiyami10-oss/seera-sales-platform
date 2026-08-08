import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function SalesCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW_ALL).catch(async () => requirePermission(PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED));
  const { id } = await params;
  const customer = await prisma.customer.findFirst({ where: { id, ...(principal.isFounder || principal.permissions.has(PERMISSIONS.CUSTOMERS_VIEW_ALL) ? {} : { assignedOwnerId: principal.id }) }, include: {
    customerType: true, primaryChannel: true, assignedOwner: true, assignedTerritory: true,
    orders: { orderBy: { createdAt: "desc" }, take: 10 },
    quotations: { orderBy: { updatedAt: "desc" }, take: 10, include: { versions: { where: { isActive: true }, include: { status: true } } } },
    salesInquiries: { include: { salesChannel: true, status: true }, orderBy: { createdAt: "desc" } },
    salesTimeline: { orderBy: { createdAt: "desc" }, take: 100 },
    classificationHistory: { include: { fromType: true, toType: true }, orderBy: { createdAt: "desc" } },
  } });
  if (!customer) notFound();
  const lifetimeValue = customer.orders.filter(o=>o.paymentStatus==="PAID").reduce((sum,o)=>sum+o.total,0);
  return <section className="space-y-6 text-white"><header><h1 className="text-3xl font-semibold">{customer.businessName??customer.name}</h1><p className="text-zinc-400">{customer.customerType?.name??"Unclassified"} · {customer.lifecycleStage} · {customer.crmStatus}</p></header>
    <div className="grid gap-4 md:grid-cols-4">{[["Owner",customer.assignedOwner?.name??"Unassigned"],["Territory",customer.assignedTerritory?.name??"None"],["Channel",customer.primaryChannel?.name??"None"],["Lifetime Value",`₹${lifetimeValue}`]].map(([k,v])=><article key={k} className="rounded-xl border border-white/10 p-4"><p className="text-xs text-zinc-500">{k}</p><p className="mt-1">{v}</p></article>)}</div>
    <article className="rounded-2xl border border-white/10 p-5"><h2>Quotation History</h2>{customer.quotations.map(q=><p key={q.id} className="mt-3">{q.quotationNumber} · {q.versions[0]?.status.name??"Historical"} · {q.versions[0]?.grandTotal.toString()??"—"}</p>)}{!customer.quotations.length&&<p className="mt-3 text-zinc-500">No quotations.</p>}</article>
    <article className="rounded-2xl border border-white/10 p-5"><h2>Unified Timeline</h2><ol className="mt-4 space-y-3">{customer.salesTimeline.map(e=><li key={e.id} className="border-l border-amber-400/30 pl-4"><p className="text-sm">{e.description}</p><time className="text-xs text-zinc-500">{e.createdAt.toLocaleString()}</time></li>)}</ol></article>
  </section>;
}
