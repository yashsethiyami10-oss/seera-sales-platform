import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
export default async function SalesCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const principal = await requirePermission(PERMISSIONS.CUSTOMERS_VIEW_ALL).catch(async () => requirePermission(PERMISSIONS.CUSTOMERS_VIEW_ASSIGNED));
  const { q = "", page = "1" } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const scope = principal.isFounder || principal.permissions.has(PERMISSIONS.CUSTOMERS_VIEW_ALL) ? {} : { assignedOwnerId: principal.id };
  const where = { AND: [scope, q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { businessName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { gstNumber: { contains: q, mode: "insensitive" as const } }] } : {}] };
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, include: { customerType: true, assignedOwner: true, assignedTerritory: true, _count: { select: { orders: true, salesInquiries: true } } }, orderBy: { updatedAt: "desc" }, skip: (current - 1) * 20, take: 20 }),
    prisma.customer.count({ where }),
  ]);
  return <section className="space-y-5 text-white"><h1 className="text-3xl font-semibold">Customer CRM</h1><form><input name="q" defaultValue={q} placeholder="Name, business, email, phone, GST…" className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></form><div className="grid gap-3">{customers.map(c=><Link key={c.id} href={`/sales/customers/${c.id}`} className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.03]"><div className="flex justify-between"><div><h2>{c.businessName??c.name}</h2><p className="text-sm text-zinc-500">{c.email} · {c.phone??"No phone"}</p></div><span className="text-sm text-amber-400">{c.customerType?.name??"Unclassified"}</span></div><p className="mt-3 text-xs text-zinc-500">{c._count.salesInquiries} inquiries · {c._count.orders} orders · {c.assignedTerritory?.name??"No territory"}</p></Link>)}</div>{!customers.length&&<p className="text-zinc-500">No customers found.</p>}<p className="text-sm text-zinc-500">{total} customers · page {current}</p></section>;
}
