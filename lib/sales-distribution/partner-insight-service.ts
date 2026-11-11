import type { PrismaClient, SalesOrderStatus } from "@prisma/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { requirePartyMembership } from "@/lib/sales-distribution/scope";

// "How is my business doing?" for a Distributor or Super Stockist, in one read: this month vs last
// month sales, today, top customers and customers who have gone quiet. Strictly own-party scope
// (requirePartyMembership) — a partner only ever sees the customers it sells to itself.
//
// Sales = orders this partner SOLD:
//   Distributor     → RETAILER_ORDER with sellerPartnerId = distributor (retailer customers)
//   Super Stockist  → DISTRIBUTOR_REPLENISHMENT with sellerPartnerId = S.S. (distributor customers)
// Draft / rejected / cancelled orders never count.

const NOT_SALES: SalesOrderStatus[] = ["DRAFT", "REJECTED", "CANCELLED"];

export type PartnerSnapshot = Awaited<ReturnType<typeof partnerSalesSnapshot>>;

export async function partnerSalesSnapshot(
  prisma: PrismaClient,
  actorId: string,
  partnerId: string,
  partnerType: "DISTRIBUTOR" | "SUPER_STOCKIST",
  now = new Date(),
) {
  await authorize(prisma, { actorId, permission: partnerType === "DISTRIBUTOR" ? "distributor_orders:view" : "super_stockist_orders:view" });
  await requirePartyMembership(prisma, actorId, partnerId, partnerType);
  const type = partnerType === "DISTRIBUTOR" ? "RETAILER_ORDER" : "DISTRIBUTOR_REPLENISHMENT";
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Same day-of-month last month, so "vs last month" compares like with like mid-month.
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), 23, 59, 59);
  const since90 = new Date(now.getTime() - 90 * 86_400_000);
  const quietCutoff = new Date(now.getTime() - 30 * 86_400_000);

  const orders = await prisma.seeraSalesOrder.findMany({
    where: { sellerPartnerId: partnerId, type, status: { notIn: NOT_SALES }, createdAt: { gte: since90 < startLastMonth ? since90 : startLastMonth } },
    select: {
      total: true,
      createdAt: true,
      retailerId: true,
      buyerPartnerId: true,
      retailer: { select: { businessName: true } },
      buyerPartner: { select: { legalName: true, tradeName: true } },
    },
  });

  const customerKey = (o: (typeof orders)[number]) => (partnerType === "DISTRIBUTOR" ? o.retailerId : o.buyerPartnerId) ?? "unknown";
  const customerName = (o: (typeof orders)[number]) =>
    partnerType === "DISTRIBUTOR" ? (o.retailer?.businessName ?? "Retailer") : (o.buyerPartner?.tradeName ?? o.buyerPartner?.legalName ?? "Distributor");

  let today = 0, todayCount = 0, month = 0, monthCount = 0, lastMonthToDate = 0, lastMonthFull = 0;
  const monthByCustomer = new Map<string, { name: string; value: number; orders: number }>();
  const lastOrderByCustomer = new Map<string, { name: string; at: Date }>();
  for (const o of orders) {
    const value = Number(o.total);
    if (o.createdAt >= startToday) { today += value; todayCount += 1; }
    if (o.createdAt >= startMonth) {
      month += value;
      monthCount += 1;
      const k = customerKey(o);
      const row = monthByCustomer.get(k) ?? { name: customerName(o), value: 0, orders: 0 };
      row.value += value;
      row.orders += 1;
      monthByCustomer.set(k, row);
    } else if (o.createdAt >= startLastMonth) {
      lastMonthFull += value;
      if (o.createdAt <= lastMonthSameDay) lastMonthToDate += value;
    }
    if (o.createdAt >= since90) {
      const k = customerKey(o);
      const prev = lastOrderByCustomer.get(k);
      if (!prev || prev.at < o.createdAt) lastOrderByCustomer.set(k, { name: customerName(o), at: o.createdAt });
    }
  }
  const quiet = [...lastOrderByCustomer.values()].filter((c) => c.at < quietCutoff).sort((a, b) => a.at.getTime() - b.at.getTime());
  const growthPct = lastMonthToDate > 0 ? Math.round(((month - lastMonthToDate) / lastMonthToDate) * 1000) / 10 : null;
  return {
    partnerType,
    today: { value: Math.round(today), orders: todayCount },
    month: { value: Math.round(month), orders: monthCount, activeCustomers: monthByCustomer.size },
    lastMonth: { toDate: Math.round(lastMonthToDate), full: Math.round(lastMonthFull) },
    growthPct,
    topCustomers: [...monthByCustomer.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((c) => ({ ...c, value: Math.round(c.value) })),
    customers90d: lastOrderByCustomer.size,
    quietCustomers: quiet.slice(0, 5).map((c) => ({ name: c.name, lastOrderAt: c.at.toISOString(), days: Math.floor((now.getTime() - c.at.getTime()) / 86_400_000) })),
    quietCount: quiet.length,
  };
}
