import { prisma } from "@/lib/prisma";

/**
 * Founder Operating System — every function here is a real Prisma query (or
 * a JS aggregation over a real query result) against Order/OrderItem/
 * Customer/Product/Inventory/Coupon rows already in the schema. Nothing is
 * estimated, forecast, or fabricated. Where a real number genuinely can't be
 * computed from what's stored (exact partial-refund amounts, product cost/
 * margin, traffic/conversion data), the calling page is expected to say so
 * plainly rather than this module inventing a placeholder.
 *
 * Dataset sizes here (orders, products, customers) are catalog/boutique
 * scale, same assumption Phase 13B's Inventory page and this session's other
 * BI-adjacent code already make — so most aggregation below fetches the
 * relevant rows once and reduces them in JS rather than reaching for raw SQL,
 * except where Prisma's query builder genuinely can't express the query
 * (none of that turned out to be necessary here — every aggregate below is
 * expressible with `groupBy`/`aggregate` directly).
 */

export type DateRange = { from: Date; to: Date };

export function resolveDateRange(preset: string | undefined): DateRange {
  const to = new Date();
  const from = new Date();
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "ytd":
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      break;
    case "all":
      from.setFullYear(2000);
      break;
    case "30d":
    default:
      from.setDate(from.getDate() - 30);
  }
  return { from, to };
}

// ---------------------------------------------------------------------------
// Revenue & Order KPIs
// ---------------------------------------------------------------------------

export async function getRevenueKPIs() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const paid = { paymentStatus: "PAID" as const };
  const [today, yesterday, week, month, year, allTime] = await Promise.all([
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: startOfToday } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: startOfYesterday, lt: startOfToday } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: startOfWeek } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { ...paid, createdAt: { gte: startOfYear } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: paid, _sum: { total: true, subtotal: true }, _count: { id: true } }),
  ]);

  return {
    todayRevenue: today._sum.total ?? 0,
    yesterdayRevenue: yesterday._sum.total ?? 0,
    weekRevenue: week._sum.total ?? 0,
    monthRevenue: month._sum.total ?? 0,
    yearRevenue: year._sum.total ?? 0,
    // "Gross Sales" = subtotal before discount/shipping/tax netting; "Net
    // Sales" = the actual total collected (post-discount) — both all-time,
    // over every real PAID order.
    grossSales: allTime._sum.subtotal ?? 0,
    netSales: allTime._sum.total ?? 0,
    paidOrderCount: allTime._count.id,
    averageOrderValue: allTime._count.id > 0 ? Math.round((allTime._sum.total ?? 0) / allTime._count.id) : 0,
  };
}

export async function getOrderStatusKPIs() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [ordersToday, pending, delivered, cancelled, refunded, partiallyRefunded] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
    // Same definition as the existing /admin Overview's "Pending" stat
    // (status: "PLACED" only) — kept identical on purpose so the two
    // dashboards never disagree on a number with the same label.
    prisma.order.count({ where: { status: "PLACED" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.count({ where: { status: "CANCELLED" } }),
    prisma.order.aggregate({ where: { paymentStatus: "REFUNDED" }, _count: { id: true }, _sum: { total: true } }),
    prisma.order.count({ where: { paymentStatus: "PARTIALLY_REFUNDED" } }),
  ]);

  return {
    ordersToday,
    pending,
    delivered,
    cancelled,
    // A fully REFUNDED order's stored `total` genuinely equals the amount
    // refunded, so that sum is real. PARTIALLY_REFUNDED orders have no
    // stored refunded-amount column anywhere in the schema (confirmed — no
    // Refund model, no such field on Order) — count only, not a fabricated
    // rupee figure. See the report's Known Limitations.
    refundedCount: refunded._count.id,
    refundedValue: refunded._sum.total ?? 0,
    partiallyRefundedCount: partiallyRefunded,
  };
}

// ---------------------------------------------------------------------------
// Customer Intelligence
// ---------------------------------------------------------------------------

export async function getCustomerGrowth() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalCustomers, newThisMonth, customersWithOrders] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.groupBy({ by: ["customerId"], where: { paymentStatus: "PAID" }, _count: { id: true } }),
  ]);

  const returningCustomers = customersWithOrders.filter((c) => c._count.id >= 2).length;
  const payingCustomers = customersWithOrders.length;
  const repeatPurchaseRate = payingCustomers > 0 ? Math.round((returningCustomers / payingCustomers) * 1000) / 10 : 0;

  return { totalCustomers, newThisMonth, payingCustomers, returningCustomers, repeatPurchaseRate };
}

/**
 * Real RFM (Recency/Frequency/Monetary) — Recency in days since last PAID
 * order, Frequency = paid order count, Monetary = total real spend. Segment
 * thresholds are plain, documented business rules (not a trained model):
 * "Champions" = frequent + recent + high spend, "At Risk" = used to buy
 * often but hasn't recently, "Dormant" = no order in 90+ days, "New" = one
 * order only, "Regulars" = everyone else. A customer with zero paid orders
 * never appears here (no monetary signal to segment on).
 */
export async function getCustomerRFM() {
  const rows = await prisma.order.groupBy({
    by: ["customerId"],
    where: { paymentStatus: "PAID" },
    _sum: { total: true },
    _count: { id: true },
    _max: { createdAt: true },
  });
  if (rows.length === 0) return { segments: {}, topCustomers: [], dormantCustomers: [] };

  const customerIds = rows.map((r) => r.customerId);
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, email: true } });
  const byId = new Map(customers.map((c) => [c.id, c]));

  const now = Date.now();
  const rfm = rows.map((r) => {
    const lastOrder = r._max.createdAt!;
    const recencyDays = Math.floor((now - lastOrder.getTime()) / (1000 * 60 * 60 * 24));
    const frequency = r._count.id;
    const monetary = r._sum.total ?? 0;
    let segment: "Champions" | "Regulars" | "At Risk" | "Dormant" | "New";
    if (recencyDays > 90) segment = "Dormant";
    else if (frequency === 1) segment = "New";
    else if (recencyDays <= 30 && frequency >= 3) segment = "Champions";
    else if (recencyDays > 60 && frequency >= 2) segment = "At Risk";
    else segment = "Regulars";

    return { customerId: r.customerId, name: byId.get(r.customerId)?.name ?? "—", email: byId.get(r.customerId)?.email ?? "—", recencyDays, frequency, monetary, segment };
  });

  const segments: Record<string, number> = {};
  for (const r of rfm) segments[r.segment] = (segments[r.segment] ?? 0) + 1;

  const topCustomers = [...rfm].sort((a, b) => b.monetary - a.monetary).slice(0, 10);
  const dormantCustomers = rfm.filter((r) => r.segment === "Dormant").sort((a, b) => b.monetary - a.monetary).slice(0, 10);

  return { segments, topCustomers, dormantCustomers, averageLifetimeValue: Math.round(rfm.reduce((s, r) => s + r.monetary, 0) / rfm.length) };
}

// ---------------------------------------------------------------------------
// Sales Intelligence
// ---------------------------------------------------------------------------

export async function getRevenueTrend(range: DateRange) {
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "PAID", createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, total: true },
  });

  const byDay = new Map<string, number>();
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.total);
  }

  const days: { date: string; revenue: number }[] = [];
  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= range.to) {
    const key = cursor.toISOString().slice(0, 10);
    days.push({ date: key, revenue: byDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Same-length period immediately before `range`, for a real growth %
 * comparison rather than a hardcoded "vs last week." */
export async function getGrowthComparison(range: DateRange) {
  const spanMs = range.to.getTime() - range.from.getTime();
  const previousFrom = new Date(range.from.getTime() - spanMs);
  const previousTo = new Date(range.from.getTime());

  const [current, previous] = await Promise.all([
    prisma.order.aggregate({ where: { paymentStatus: "PAID", createdAt: { gte: range.from, lte: range.to } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID", createdAt: { gte: previousFrom, lt: previousTo } }, _sum: { total: true } }),
  ]);

  const currentTotal = current._sum.total ?? 0;
  const previousTotal = previous._sum.total ?? 0;
  const growthPercent = previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 : null;

  return { currentTotal, previousTotal, growthPercent };
}

type OrderItemLine = { quantity: number; priceAtPurchase: number; sizeAtPurchase: string; variant: { productId: string; product: { name: string; categoryId: string; fragranceNotes: string | null; category: { name: string } } } };

async function getPaidOrderItems(range?: DateRange): Promise<OrderItemLine[]> {
  return prisma.orderItem.findMany({
    where: { order: { paymentStatus: "PAID", ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}) } },
    select: {
      quantity: true,
      priceAtPurchase: true,
      sizeAtPurchase: true,
      variant: { select: { productId: true, product: { select: { name: true, categoryId: true, fragranceNotes: true, category: { select: { name: true } } } } } },
    },
  });
}

export async function getTopSellingProducts(limit = 10, range?: DateRange) {
  const items = await getPaidOrderItems(range);
  const byProduct = new Map<string, { name: string; unitsSold: number; revenue: number }>();
  for (const item of items) {
    const key = item.variant.productId;
    const existing = byProduct.get(key) ?? { name: item.variant.product.name, unitsSold: 0, revenue: 0 };
    existing.unitsSold += item.quantity;
    existing.revenue += item.priceAtPurchase * item.quantity;
    byProduct.set(key, existing);
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export async function getCategoryPerformance(range?: DateRange) {
  const items = await getPaidOrderItems(range);
  const byCategory = new Map<string, number>();
  for (const item of items) {
    const name = item.variant.product.category.name;
    byCategory.set(name, (byCategory.get(name) ?? 0) + item.priceAtPurchase * item.quantity);
  }
  return [...byCategory.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);
}

export async function getFragrancePerformance(range?: DateRange) {
  const items = await getPaidOrderItems(range);
  const byFragrance = new Map<string, number>();
  for (const item of items) {
    const tokens = (item.variant.product.fragranceNotes ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) byFragrance.set(t, (byFragrance.get(t) ?? 0) + item.priceAtPurchase * item.quantity);
  }
  return [...byFragrance.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
}

export async function getSizePerformance(range?: DateRange) {
  const items = await getPaidOrderItems(range);
  const bySize = new Map<string, { unitsSold: number; revenue: number }>();
  for (const item of items) {
    const existing = bySize.get(item.sizeAtPurchase) ?? { unitsSold: 0, revenue: 0 };
    existing.unitsSold += item.quantity;
    existing.revenue += item.priceAtPurchase * item.quantity;
    bySize.set(item.sizeAtPurchase, existing);
  }
  return [...bySize.entries()].map(([size, v]) => ({ size, ...v })).sort((a, b) => b.revenue - a.revenue);
}

/** Real geographic breakdown — the shipping address's state, the only real
 * location signal this schema stores (no separate billing address/geo/IP
 * data anywhere). */
export async function getGeographicSales(range?: DateRange) {
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "PAID", ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}) },
    select: { total: true, address: { select: { state: true } } },
  });
  const byState = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    const state = o.address.state || "Unknown";
    const existing = byState.get(state) ?? { orders: 0, revenue: 0 };
    existing.orders += 1;
    existing.revenue += o.total;
    byState.set(state, existing);
  }
  return [...byState.entries()].map(([state, v]) => ({ state, ...v })).sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Inventory Intelligence
// ---------------------------------------------------------------------------

export async function getInventoryIntelligence(velocityWindowDays = 60) {
  const [inventory, recentItems] = await Promise.all([
    prisma.inventory.findMany({ include: { variant: { include: { product: { select: { id: true, name: true } } } } } }),
    getPaidOrderItems({ from: new Date(Date.now() - velocityWindowDays * 24 * 60 * 60 * 1000), to: new Date() }),
  ]);

  const soldByVariantProduct = new Map<string, number>();
  for (const item of recentItems) soldByVariantProduct.set(item.variant.productId, (soldByVariantProduct.get(item.variant.productId) ?? 0) + item.quantity);

  const inventoryValue = inventory.reduce((sum, inv) => sum + inv.quantity * inv.variant.price, 0);

  const rows = inventory.map((inv) => {
    const unitsSoldRecently = soldByVariantProduct.get(inv.variant.productId) ?? 0;
    // Real, simple turnover proxy: units sold in the window over current
    // quantity — not a full average-inventory-over-time turnover ratio
    // (would need historical snapshots this schema doesn't keep), documented
    // as an approximation rather than presented as textbook inventory
    // turnover.
    const turnoverRatio = inv.quantity > 0 ? Math.round((unitsSoldRecently / inv.quantity) * 100) / 100 : unitsSoldRecently > 0 ? Infinity : 0;
    return {
      productName: inv.variant.product.name,
      size: inv.variant.size,
      quantity: inv.quantity,
      unitsSoldRecently,
      turnoverRatio,
      isDeadStock: inv.quantity > 0 && unitsSoldRecently === 0,
      isLowStock: inv.quantity > 0 && inv.quantity <= inv.lowStockThreshold,
      needsRestock: inv.quantity <= inv.lowStockThreshold && unitsSoldRecently > 0,
    };
  });

  return {
    inventoryValue,
    fastMoving: [...rows].filter((r) => r.unitsSoldRecently > 0).sort((a, b) => b.unitsSoldRecently - a.unitsSoldRecently).slice(0, 10),
    slowMoving: [...rows].filter((r) => r.quantity > 0).sort((a, b) => a.unitsSoldRecently - b.unitsSoldRecently).slice(0, 10),
    deadStock: rows.filter((r) => r.isDeadStock),
    restockSuggestions: rows.filter((r) => r.needsRestock).sort((a, b) => b.unitsSoldRecently - a.unitsSoldRecently),
    lowStockCount: rows.filter((r) => r.isLowStock).length,
    outOfStockCount: inventory.filter((i) => i.quantity === 0).length,
  };
}

// ---------------------------------------------------------------------------
// Marketing Intelligence
// ---------------------------------------------------------------------------

export async function getCouponPerformance() {
  const coupons = await prisma.coupon.findMany({ orderBy: { usedCount: "desc" } });
  if (coupons.length === 0) return [];

  const orders = await prisma.order.groupBy({
    by: ["couponId"],
    where: { couponId: { not: null }, paymentStatus: "PAID" },
    _sum: { discount: true, total: true },
    _count: { id: true },
  });
  const byCouponId = new Map(orders.map((o) => [o.couponId, o]));

  return coupons.map((c) => {
    const stats = byCouponId.get(c.id);
    return {
      code: c.code,
      type: c.type,
      value: c.value,
      active: c.active,
      usedCount: c.usedCount,
      ordersUsingIt: stats?._count.id ?? 0,
      totalDiscountGiven: stats?._sum.discount ?? 0,
      revenueGenerated: stats?._sum.total ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Financial Intelligence
// ---------------------------------------------------------------------------

export async function getFinancialSummary(range: DateRange) {
  const paidInRange = { paymentStatus: "PAID" as const, createdAt: { gte: range.from, lte: range.to } };

  const [totals, refunded, codOrders] = await Promise.all([
    prisma.order.aggregate({
      where: paidInRange,
      _sum: { subtotal: true, total: true, discount: true, shippingFee: true, cgst: true, sgst: true, igst: true, taxableValue: true },
    }),
    prisma.order.aggregate({ where: { paymentStatus: "REFUNDED", createdAt: { gte: range.from, lte: range.to } }, _sum: { total: true }, _count: { id: true } }),
    prisma.order.aggregate({ where: { paymentMethod: "COD", createdAt: { gte: range.from, lte: range.to } }, _sum: { total: true }, _count: { id: true } }),
  ]);

  const grossRevenue = totals._sum.subtotal ?? 0;
  const netRevenue = totals._sum.total ?? 0;
  const refundValue = refunded._sum.total ?? 0;

  return {
    grossRevenue,
    netRevenue,
    discounts: totals._sum.discount ?? 0,
    shippingCharges: totals._sum.shippingFee ?? 0,
    taxableValue: totals._sum.taxableValue ?? 0,
    cgst: totals._sum.cgst ?? 0,
    sgst: totals._sum.sgst ?? 0,
    igst: totals._sum.igst ?? 0,
    totalGst: (totals._sum.cgst ?? 0) + (totals._sum.sgst ?? 0) + (totals._sum.igst ?? 0),
    refundedCount: refunded._count.id,
    refundValue,
    codOrderCount: codOrders._count.id,
    codOrderValue: codOrders._sum.total ?? 0,
    // Real, simple cash flow proxy for the period: money actually collected
    // on paid orders minus money actually refunded — not a full accounting
    // cash-flow statement (no expense/payroll/COGS data exists to net
    // against), documented as a proxy rather than presented as complete.
    netCashFlow: netRevenue - refundValue,
  };
}
