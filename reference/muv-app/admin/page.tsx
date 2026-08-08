import Link from "next/link";
import { LayoutGrid, Tag, ShoppingBag, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/primitives";

/**
 * Every figure below is a live query — no cached, estimated, or fabricated
 * number. Best Selling Products is computed from real OrderItem quantities
 * (not the admin-set `bestSellerRank`, which is often unset — see
 * PHASE_7A's report), so it reflects what customers actually bought, not
 * what an admin manually flagged.
 */
export default async function AdminOverview() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfThisWeek = new Date(startOfToday);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - 7);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  const [
    orderCount, customerCount, productCount,
    todayOrders, monthlyOrders,
    pendingCount, deliveredCount, cancelledCount,
    revenueResult, thisWeekRevenue, lastWeekRevenue,
    recentOrders, recentCustomers,
    lowStock, outOfStockCount,
    topItems, categories,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.count({ where: { status: "PLACED" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.count({ where: { status: "CANCELLED" } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID", createdAt: { gte: startOfThisWeek } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { paymentStatus: "PAID", createdAt: { gte: startOfLastWeek, lt: startOfThisWeek } }, _sum: { total: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { customer: true } }),
    prisma.customer.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.$queryRaw<Array<{ name: string; quantity: number }>>`
      SELECT p.name, i.quantity FROM inventory i
      JOIN product_variants pv ON pv.id = i."variantId"
      JOIN products p ON p.id = pv."productId"
      WHERE i.quantity > 0 AND i.quantity <= i."lowStockThreshold"
      ORDER BY i.quantity ASC LIMIT 5
    `,
    prisma.inventory.count({ where: { quantity: 0 } }),
    prisma.orderItem.groupBy({ by: ["variantId"], _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } }),
  ]);

  // Phase 16 — only `name`/`size` are ever read below; the previous
  // `include: { product: true }` pulled every Product scalar (full
  // descriptions, ingredients, SEO fields) per row just to render two strings.
  const variantDetails = await prisma.productVariant.findMany({
    where: { id: { in: topItems.map((t) => t.variantId) } },
    select: { id: true, size: true, product: { select: { name: true } } },
  });
  const bestSelling = topItems
    .map((t) => {
      const v = variantDetails.find((v) => v.id === t.variantId);
      return v ? { name: v.product.name, size: v.size, sold: t._sum.quantity ?? 0 } : null;
    })
    .filter((x): x is { name: string; size: string; sold: number } => x !== null);

  const thisWeek = thisWeekRevenue._sum.total ?? 0;
  const lastWeek = lastWeekRevenue._sum.total ?? 0;
  const trendMax = Math.max(thisWeek, lastWeek, 1);

  const stats = [
    { label: "Total Revenue", value: `₹${(revenueResult._sum.total ?? 0).toLocaleString("en-IN")}` },
    { label: "Today's Orders", value: todayOrders },
    { label: "This Month", value: monthlyOrders },
    { label: "Customers", value: customerCount },
    { label: "Products", value: productCount },
    { label: "Pending", value: pendingCount },
    { label: "Delivered", value: deliveredCount },
    { label: "Cancelled", value: cancelledCount },
    { label: "Low Stock", value: lowStock.length },
    { label: "Out of Stock", value: outOfStockCount },
  ];

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Overview</h1>

      {/* ---- Quick Actions ---- */}
      <div className="flex gap-3 flex-wrap mb-6">
        <Link href="/admin/products" className="muv-btn-ghost"><Package size={14} /> Products</Link>
        <Link href="/admin/cms/categories" className="muv-btn-ghost"><LayoutGrid size={14} /> Categories</Link>
        <Link href="/admin/marketing" className="muv-btn-ghost"><Tag size={14} /> Coupons</Link>
        <Link href="/admin/cms/homepage" className="muv-btn-ghost"><ShoppingBag size={14} /> Homepage CMS</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="muv-card">
            <p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>{s.value}</p>
            <p className="muv-text-meta text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ---- Revenue trend (real, this week vs last week) ---- */}
      <div className="muv-card mb-6">
        <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Revenue Trend — Paid Orders</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="muv-text-meta">Last 7 days</span><span className="muv-text-solid">₹{thisWeek.toLocaleString("en-IN")}</span></div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: "rgba(var(--text-rgb),0.08)" }}>
              <div style={{ width: `${(thisWeek / trendMax) * 100}%`, height: "100%", background: "var(--lavender)" }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="muv-text-meta">Previous 7 days</span><span className="muv-text-solid">₹{lastWeek.toLocaleString("en-IN")}</span></div>
            <div className="rounded-full overflow-hidden" style={{ height: 8, background: "rgba(var(--text-rgb),0.08)" }}>
              <div style={{ width: `${(lastWeek / trendMax) * 100}%`, height: "100%", background: "rgba(var(--text-rgb),0.3)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex justify-between items-center">
                <div><p className="muv-text-solid text-sm">#{o.orderNumber}</p><p className="muv-text-meta text-xs">{o.customer.name}</p></div>
                <Badge tone="positive">{o.status}</Badge>
              </div>
            ))}
            {recentOrders.length === 0 && <p className="muv-text-meta text-sm">No orders yet.</p>}
          </div>
        </div>

        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Recent Customers</h3>
          <div className="space-y-3">
            {recentCustomers.map((c) => (
              <div key={c.id} className="flex justify-between items-center">
                <p className="muv-text-solid text-sm">{c.name}</p>
                <p className="muv-text-meta text-xs">{c.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
            ))}
            {recentCustomers.length === 0 && <p className="muv-text-meta text-sm">No customers yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Best Selling Products</h3>
          <div className="space-y-3">
            {bestSelling.map((b, i) => (
              <div key={i} className="flex justify-between">
                <span className="muv-text-body text-sm">{b.name} ({b.size})</span>
                <span className="text-sm" style={{ color: "var(--lavender)" }}>{b.sold} sold</span>
              </div>
            ))}
            {bestSelling.length === 0 && <p className="muv-text-meta text-sm">No sales yet.</p>}
          </div>
        </div>

        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Top Categories</h3>
          <div className="space-y-3">
            {[...categories].sort((a, b) => b._count.products - a._count.products).slice(0, 5).map((c) => (
              <div key={c.id} className="flex justify-between">
                <span className="muv-text-body text-sm">{c.name}</span>
                <span className="muv-text-meta text-sm">{c._count.products} product{c._count.products === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="muv-card">
        <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Low Stock Alerts</h3>
        <div className="space-y-3">
          {lowStock.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span className="muv-text-body text-sm">{p.name}</span>
              <span className="text-sm" style={{ color: "var(--lavender)" }}>{p.quantity} left</span>
            </div>
          ))}
          {lowStock.length === 0 && <p className="muv-text-meta text-sm">Nothing low on stock.</p>}
        </div>
      </div>
    </div>
  );
}
