import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";

export default async function LoyaltyPage() {
  const principal = await requireAnyPermission(PERMISSIONS.LOYALTY_VIEW_ALL, PERMISSIONS.LOYALTY_VIEW_ASSIGNED, PERMISSIONS.LOYALTY_VIEW_SUPPORT);
  const all = principal.isFounder || principal.permissions.has(PERMISSIONS.LOYALTY_VIEW_ALL);
  const customerIds = all ? undefined : (await prisma.customer.findMany({ where: { assignedOwnerId: principal.id }, select: { id: true } })).map(c => c.id);
  const [profiles, ledger, referrals] = await Promise.all([
    prisma.loyaltyProfile.findMany({ where: customerIds ? { customerId: { in: customerIds } } : {}, orderBy: { updatedAt: "desc" }, take: 25 }),
    prisma.rewardLedgerEntry.findMany({ where: customerIds ? { customerId: { in: customerIds } } : {}, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.customerReferral.findMany({ where: customerIds ? { referrerCustomerId: { in: customerIds } } : {}, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  return <section className="space-y-6 text-white"><header><p className="text-xs uppercase tracking-[.2em] text-amber-400">Loyalty Foundation</p><h1 className="mt-2 text-3xl font-semibold">Loyalty</h1><p className="mt-1 text-sm text-zinc-400">Internal architecture only. Customer-facing earning and redemption remain disabled.</p></header>
    <div className="grid gap-4 md:grid-cols-3"><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Profiles</p><p className="mt-2 text-3xl">{profiles.length}</p></article><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Ledger entries</p><p className="mt-2 text-3xl">{ledger.length}</p></article><article className="rounded-2xl border border-white/10 p-5"><p className="text-zinc-400">Referrals</p><p className="mt-2 text-3xl">{referrals.length}</p></article></div>
    <div className="rounded-2xl border border-white/10 p-5"><h2 className="font-medium">Immutable reward ledger</h2><div className="mt-4 space-y-2">{ledger.map(row=><div key={row.id} className="flex justify-between rounded-xl bg-white/5 p-3 text-sm"><span>{row.ledgerNumber} · {row.reason}</span><span>{row.points>0?"+":""}{row.points} ({row.newBalance})</span></div>)}{!ledger.length?<p className="text-sm text-zinc-500">No reward movements.</p>:null}</div></div>
  </section>;
}
