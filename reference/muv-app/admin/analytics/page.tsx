import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/primitives";
import { AnalyticsExportClient } from "@/components/admin/analytics-export-client";
import {
  resolveDateRange,
  getRevenueKPIs,
  getOrderStatusKPIs,
  getCustomerGrowth,
  getCustomerRFM,
  getRevenueTrend,
  getGrowthComparison,
  getTopSellingProducts,
  getCategoryPerformance,
  getFragrancePerformance,
  getSizePerformance,
  getGeographicSales,
  getInventoryIntelligence,
  getCouponPerformance,
  getFinancialSummary,
} from "@/lib/analytics";

const RANGE_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "90d", label: "90 Days" },
  { id: "ytd", label: "Year to Date" },
  { id: "all", label: "All Time" },
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="muv-card">
      <p className="font-display muv-text-solid" style={{ fontSize: 20, fontWeight: 500 }}>{value}</p>
      <p className="muv-text-meta text-xs mt-1">{label}</p>
      {sub && <p className="muv-text-faint text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="muv-text-meta">{label}</span><span className="muv-text-solid">₹{value.toLocaleString("en-IN")}</span></div>
      <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(var(--text-rgb),0.08)" }}>
        <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: "var(--lavender)" }} />
      </div>
    </div>
  );
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Founder Operating System (Phase 15) — a deeper, date-range-aware BI layer
 * alongside the existing /admin Overview (Phase 13A), not a replacement for
 * it. Every number below comes from lib/analytics.ts, which is exclusively
 * real Prisma aggregation — no forecasting, no external analytics service,
 * no fabricated KPI. Where a real number can't be computed from what this
 * schema stores (exact partial-refund amounts, product margin, traffic/
 * conversion data), it's said so directly rather than estimated.
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range = resolveDateRange(rangeParam);
  const activeRange = rangeParam ?? "30d";

  const [
    revenueKPIs, orderKPIs, customerGrowth, rfm,
    trend, growth, topProducts, categoryPerf, fragrancePerf, sizePerf, geoSales,
    inventoryIntel, coupons, financials,
    exportOrders,
  ] = await Promise.all([
    getRevenueKPIs(),
    getOrderStatusKPIs(),
    getCustomerGrowth(),
    getCustomerRFM(),
    getRevenueTrend(range),
    getGrowthComparison(range),
    getTopSellingProducts(10, range),
    getCategoryPerformance(range),
    getFragrancePerformance(range),
    getSizePerformance(range),
    getGeographicSales(range),
    getInventoryIntelligence(),
    getCouponPerformance(),
    getFinancialSummary(range),
    prisma.order.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
  ]);

  const trendMax = Math.max(...trend.map((d) => d.revenue), 1);
  const csvRows: string[][] = [
    ["Order #", "Date", "Customer", "Status", "Payment Method", "Payment Status", "Subtotal", "Discount", "Shipping", "Tax", "Total"],
    ...exportOrders.map((o) => [
      o.orderNumber,
      o.createdAt.toISOString().slice(0, 10),
      o.customer.name,
      o.status,
      o.paymentMethod,
      o.paymentStatus,
      String(o.subtotal),
      String(o.discount),
      String(o.shippingFee),
      String(o.cgst + o.sgst + o.igst),
      String(o.total),
    ]),
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Analytics</h1>
        <AnalyticsExportClient filename={`orders-${activeRange}.csv`} rows={csvRows} />
      </div>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {RANGE_OPTIONS.map((r) => (
          <Link key={r.id} href={`/admin/analytics?range=${r.id}`} className="muv-tag-pill" style={{ opacity: activeRange === r.id ? 1 : 0.5 }}>
            {r.label}
          </Link>
        ))}
        {/* Production Rollout v1.0, Stage 9 — a separate sub-page, not merged into this range-scoped BI layer's own KPIs. */}
        <Link href="/admin/analytics/ai-gateway" className="muv-tag-pill" style={{ marginLeft: 8 }}>
          MUV AI Gateway →
        </Link>
      </div>

      {/* ---- Founder Dashboard ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Founder Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Today's Revenue" value={inr(revenueKPIs.todayRevenue)} />
        <StatCard label="Yesterday" value={inr(revenueKPIs.yesterdayRevenue)} />
        <StatCard label="This Week" value={inr(revenueKPIs.weekRevenue)} />
        <StatCard label="This Month" value={inr(revenueKPIs.monthRevenue)} />
        <StatCard label="This Year" value={inr(revenueKPIs.yearRevenue)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Gross Sales (All Time)" value={inr(revenueKPIs.grossSales)} />
        <StatCard label="Net Sales (All Time)" value={inr(revenueKPIs.netSales)} />
        <StatCard label="Avg Order Value" value={inr(revenueKPIs.averageOrderValue)} />
        <StatCard label="Repeat Purchase Rate" value={`${customerGrowth.repeatPurchaseRate}%`} />
        <StatCard label="Avg Customer LTV" value={inr(rfm.averageLifetimeValue ?? 0)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Orders Today" value={orderKPIs.ordersToday} />
        <StatCard label="Pending" value={orderKPIs.pending} />
        <StatCard label="Delivered" value={orderKPIs.delivered} />
        <StatCard label="Cancelled" value={orderKPIs.cancelled} />
        <StatCard label="Refunded" value={orderKPIs.refundedCount} sub={orderKPIs.partiallyRefundedCount > 0 ? `+${orderKPIs.partiallyRefundedCount} partial` : undefined} />
      </div>

      <div className="muv-card mb-8">
        <h3 className="font-display muv-text-solid text-sm mb-2" style={{ fontWeight: 500 }}>Daily Business Summary</h3>
        <p className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>
          Today: {inr(revenueKPIs.todayRevenue)} across {orderKPIs.ordersToday} order{orderKPIs.ordersToday === 1 ? "" : "s"}.
          {" "}{orderKPIs.pending} order{orderKPIs.pending === 1 ? "" : "s"} awaiting fulfillment, {inventoryIntel.lowStockCount} SKU{inventoryIntel.lowStockCount === 1 ? "" : "s"} running low, {inventoryIntel.outOfStockCount} out of stock.
          {" "}{customerGrowth.newThisMonth} new customer{customerGrowth.newThisMonth === 1 ? "" : "s"} this month.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap mb-10">
        <Link href="/admin/orders" className="muv-btn-ghost">View Orders</Link>
        <Link href="/admin/inventory" className="muv-btn-ghost">Manage Inventory</Link>
        <Link href="/admin/marketing" className="muv-btn-ghost">Manage Coupons</Link>
        <Link href="/admin/customers" className="muv-btn-ghost">View Customers</Link>
      </div>

      {/* ---- Sales Intelligence ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Sales Intelligence</h2>
      <div className="muv-card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display muv-text-solid text-sm" style={{ fontWeight: 500 }}>Revenue Trend</h3>
          {growth.growthPercent != null && (
            <span className="text-xs" style={{ color: growth.growthPercent >= 0 ? "var(--lavender)" : "#e0685c" }}>
              {growth.growthPercent >= 0 ? "+" : ""}{growth.growthPercent}% vs previous period
            </span>
          )}
        </div>
        <div className="space-y-2 overflow-x-auto">
          {trend.map((d) => <Bar key={d.date} label={new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} value={d.revenue} max={trendMax} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Top Selling Products</h3>
          <div className="space-y-2">
            {topProducts.map((p, i) => <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{p.name}</span><span style={{ color: "var(--lavender)" }}>{inr(p.revenue)} · {p.unitsSold} sold</span></div>)}
            {topProducts.length === 0 && <p className="muv-text-meta text-sm">No sales in this period.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Category Performance</h3>
          <div className="space-y-2">
            {categoryPerf.map((c, i) => <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{c.name}</span><span className="muv-text-solid">{inr(c.revenue)}</span></div>)}
            {categoryPerf.length === 0 && <p className="muv-text-meta text-sm">No sales in this period.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Fragrance Performance</h3>
          <div className="space-y-2">
            {fragrancePerf.map((f, i) => <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{f.name}</span><span className="muv-text-solid">{inr(f.revenue)}</span></div>)}
            {fragrancePerf.length === 0 && <p className="muv-text-meta text-sm">No data.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Size Performance</h3>
          <div className="space-y-2">
            {sizePerf.map((s, i) => <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{s.size}</span><span className="muv-text-solid">{inr(s.revenue)} · {s.unitsSold} sold</span></div>)}
            {sizePerf.length === 0 && <p className="muv-text-meta text-sm">No data.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Geographic Sales</h3>
          <div className="space-y-2">
            {geoSales.slice(0, 6).map((g, i) => <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{g.state}</span><span className="muv-text-solid">{inr(g.revenue)}</span></div>)}
            {geoSales.length === 0 && <p className="muv-text-meta text-sm">No data.</p>}
          </div>
        </div>
      </div>

      {/* ---- Customer Intelligence ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Customer Intelligence</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Customers" value={customerGrowth.totalCustomers} />
        <StatCard label="New This Month" value={customerGrowth.newThisMonth} />
        <StatCard label="Paying Customers" value={customerGrowth.payingCustomers} />
        <StatCard label="Returning Customers" value={customerGrowth.returningCustomers} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>RFM Segments</h3>
          <div className="space-y-2">
            {Object.entries(rfm.segments).map(([seg, count]) => <div key={seg} className="flex justify-between text-sm"><span className="muv-text-body">{seg}</span><span className="muv-text-solid">{count}</span></div>)}
            {Object.keys(rfm.segments).length === 0 && <p className="muv-text-meta text-sm">No paying customers yet.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Top Customers</h3>
          <div className="space-y-2">
            {rfm.topCustomers.slice(0, 6).map((c) => (
              <Link key={c.customerId} href={`/admin/customers/${c.customerId}`} className="flex justify-between text-sm hover:opacity-80">
                <span className="muv-text-body">{c.name}</span><span style={{ color: "var(--lavender)" }}>{inr(c.monetary)}</span>
              </Link>
            ))}
            {rfm.topCustomers.length === 0 && <p className="muv-text-meta text-sm">No paying customers yet.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Dormant Customers <span className="muv-text-faint font-normal">(90+ days)</span></h3>
          <div className="space-y-2">
            {rfm.dormantCustomers.slice(0, 6).map((c) => (
              <Link key={c.customerId} href={`/admin/customers/${c.customerId}`} className="flex justify-between text-sm hover:opacity-80">
                <span className="muv-text-body">{c.name}</span><span className="muv-text-meta">{c.recencyDays}d ago</span>
              </Link>
            ))}
            {rfm.dormantCustomers.length === 0 && <p className="muv-text-meta text-sm">None — good sign.</p>}
          </div>
        </div>
      </div>

      {/* ---- Inventory Intelligence ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Inventory Intelligence</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Inventory Value" value={inr(inventoryIntel.inventoryValue)} sub="at current selling price" />
        <StatCard label="Low Stock SKUs" value={inventoryIntel.lowStockCount} />
        <StatCard label="Out of Stock SKUs" value={inventoryIntel.outOfStockCount} />
        <StatCard label="Dead Stock SKUs" value={inventoryIntel.deadStock.length} sub="no sales in 60 days" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Restock Suggestions</h3>
          <div className="space-y-2">
            {inventoryIntel.restockSuggestions.slice(0, 8).map((r, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{r.productName} ({r.size})</span><span style={{ color: "var(--lavender)" }}>{r.quantity} left · {r.unitsSoldRecently} sold/60d</span></div>
            ))}
            {inventoryIntel.restockSuggestions.length === 0 && <p className="muv-text-meta text-sm">Nothing urgent.</p>}
          </div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Fast Moving</h3>
          <div className="space-y-2">
            {inventoryIntel.fastMoving.slice(0, 8).map((r, i) => (
              <div key={i} className="flex justify-between text-sm"><span className="muv-text-body">{r.productName} ({r.size})</span><span className="muv-text-solid">{r.unitsSoldRecently} sold/60d</span></div>
            ))}
            {inventoryIntel.fastMoving.length === 0 && <p className="muv-text-meta text-sm">No sales in the last 60 days.</p>}
          </div>
        </div>
      </div>

      {/* ---- Marketing Intelligence ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Marketing Intelligence</h2>
      <div className="overflow-x-auto mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Code", "Type", "Status", "Times Used", "Orders (Paid)", "Discount Given", "Revenue Generated"].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.code}>
                <td className="py-2.5 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.code}</td>
                <td className="py-2.5 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.type === "PERCENT" ? `${c.value}%` : `₹${c.value}`}</td>
                <td className="py-2.5 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}><Badge tone={c.active ? "positive" : "muted"}>{c.active ? "Active" : "Inactive"}</Badge></td>
                <td className="py-2.5 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.usedCount}</td>
                <td className="py-2.5 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{c.ordersUsingIt}</td>
                <td className="py-2.5 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{inr(c.totalDiscountGiven)}</td>
                <td className="py-2.5 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{inr(c.revenueGenerated)}</td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan={7} className="py-8 text-center muv-text-meta text-sm">No coupons yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ---- Financial Intelligence ---- */}
      <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Financial Intelligence <span className="muv-text-faint font-normal text-xs">(selected period)</span></h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Gross Revenue" value={inr(financials.grossRevenue)} />
        <StatCard label="Net Revenue" value={inr(financials.netRevenue)} />
        <StatCard label="Discounts Given" value={inr(financials.discounts)} />
        <StatCard label="Shipping Collected" value={inr(financials.shippingCharges)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="CGST" value={inr(financials.cgst)} />
        <StatCard label="SGST" value={inr(financials.sgst)} />
        <StatCard label="IGST" value={inr(financials.igst)} />
        <StatCard label="Total GST" value={inr(financials.totalGst)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Refunded (Full)" value={inr(financials.refundValue)} sub={`${financials.refundedCount} order(s)`} />
        <StatCard label="COD Orders" value={financials.codOrderCount} sub={inr(financials.codOrderValue)} />
        <StatCard label="Net Cash Flow" value={inr(financials.netCashFlow)} sub="paid − refunded" />
        <StatCard label="Taxable Value" value={inr(financials.taxableValue)} />
      </div>
    </div>
  );
}
