import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

/**
 * Stage 3 repair. `support.manage` is the Customer Support role's own
 * defining permission (see prisma/seed.ts's role definitions), granted
 * alongside `customers.view_assigned` — this is the real work queue that
 * SalesDashboard's `supportOnly` mode (app/dashboard/support) only ever
 * summarizes as a static "No assigned work yet." placeholder. Scoped by
 * assigned owner, same as `/sales/customers`, since Support's own
 * permission set has no org-wide customer visibility.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const principal = await requirePermission(PERMISSIONS.SUPPORT_MANAGE);
  const { q = "", page = "1" } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const scope = principal.isFounder ? {} : { assignedOwnerId: principal.id };
  const where = { AND: [scope, q ? { OR: [
    { name: { contains: q, mode: "insensitive" as const } },
    { businessName: { contains: q, mode: "insensitive" as const } },
    { email: { contains: q, mode: "insensitive" as const } },
    { phone: { contains: q } },
  ] } : {}] };
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, include: { customerType: true, _count: { select: { orders: true, salesInquiries: true } } }, orderBy: { updatedAt: "desc" }, skip: (current - 1) * 20, take: 20 }),
    prisma.customer.count({ where }),
  ]);
  const href = (p: number) => `/sales/support?q=${encodeURIComponent(q)}&page=${p}`;

  return <section className="space-y-5 text-white">
    <header><h1 className="text-3xl font-semibold">Support Work Queue</h1><p className="mt-1 text-sm text-zinc-400">{total} assigned customer cases</p></header>
    <form><input name="q" defaultValue={q} placeholder="Name, business, email, phone…" className="w-full max-w-xl rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></form>
    <div className="grid gap-3">{customers.map((c) => (
      <Link key={c.id} href={`/sales/customers/${c.id}`} className="rounded-2xl border border-white/10 p-5 hover:bg-white/[.03]">
        <div className="flex justify-between">
          <div><h2>{c.businessName ?? c.name}</h2><p className="text-sm text-zinc-500">{c.email} · {c.phone ?? "No phone"}</p></div>
          <span className="text-sm text-amber-400">{c.customerType?.name ?? "Unclassified"}</span>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{c._count.salesInquiries} inquiries · {c._count.orders} orders</p>
      </Link>
    ))}</div>
    {!customers.length && <p className="text-zinc-500">No assigned cases.</p>}
    <nav className="flex justify-between text-sm">
      {current > 1 ? <Link href={href(current - 1)}>Previous</Link> : <span />}
      <span>Page {current} of {Math.max(1, Math.ceil(total / 20))}</span>
      {current * 20 < total ? <Link href={href(current + 1)}>Next</Link> : <span />}
    </nav>
  </section>;
}
