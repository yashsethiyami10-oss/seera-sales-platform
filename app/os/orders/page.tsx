import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listAllOrders, getUnifiedOrderSummaryCounts } from "@/actions/order-mgmt";
import { OrderSummaryCards } from "@/components/os-orders/OrderSummaryCards";

/**
 * Milestone 4 — Order Management OS. Unified list: D2C `Order` and
 * institutional `BusinessOrder` rows together, tagged by channel. Detail
 * routes differ per channel (`/os/orders/direct/[id]` vs
 * `/os/orders/business/[id]`) since the two are, and remain, fully separate
 * models — this page only unifies the read/browse layer.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;

  const [ordersResult, summaryResult] = await Promise.all([
    listAllOrders({
      page,
      pageSize: 20,
      channel: params.channel === "DIRECT" || params.channel === "INSTITUTIONAL" ? params.channel : undefined,
      status: params.status || undefined,
      q: params.q || undefined,
    }),
    getUnifiedOrderSummaryCounts(),
  ]);

  if (!ordersResult.success) {
    return (
      <Workspace>
        <PageHeader title="Orders" />
        <p className="px-6 text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>
          {ordersResult.error.message}
        </p>
      </Workspace>
    );
  }

  const { items, total, pages } = ordersResult.data;

  return (
    <Workspace>
      <PageHeader title="Orders" description={`${total} order${total === 1 ? "" : "s"}`} />

      <div className="px-6 space-y-4">
        {summaryResult.success && <OrderSummaryCards counts={summaryResult.data} currentParams={params} />}

        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search order # or customer"
            className="muv-input"
            style={{ maxWidth: 260 }}
          />
          <select name="channel" defaultValue={params.channel ?? ""} className="muv-input" style={{ width: "auto" }}>
            <option value="">All channels</option>
            <option value="DIRECT">Direct (D2C)</option>
            <option value="INSTITUTIONAL">Business</option>
          </select>
          <select name="status" defaultValue={params.status ?? ""} className="muv-input" style={{ width: "auto" }}>
            <option value="">All statuses</option>
            <optgroup label="Direct">
              {["PLACED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURN_REQUESTED", "RETURNED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
            <optgroup label="Business">
              {["CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
          </select>
          <button type="submit" className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>
            Filter
          </button>
        </form>

        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Order #", "Channel", "Customer", "Total", "Status", "Owner", "Created", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
                    No orders match these filters.
                  </td>
                </tr>
              ) : (
                items.map((o) => (
                  <tr key={`${o.channel}-${o.id}`} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)" }}>#{o.orderNumber}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: o.channel === "DIRECT" ? "rgba(var(--text-rgb),0.08)" : "rgba(var(--lavender-rgb),0.12)",
                          color: o.channel === "DIRECT" ? "rgba(var(--text-rgb),0.7)" : "var(--lavender)",
                        }}
                      >
                        {o.channel === "DIRECT" ? "Direct" : "Business"}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{o.customerName}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{o.total.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{o.status}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{o.ownerName ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.55)" }}>
                      {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={o.channel === "DIRECT" ? `/os/orders/direct/${o.id}` : `/os/orders/business/${o.id}`}
                        className="muv-os-interactive flex w-fit items-center gap-1 px-2 py-1 text-xs"
                        style={{ color: "var(--lavender)" }}
                      >
                        View <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm" style={{ color: "rgba(var(--text-rgb),0.5)" }}>
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/os/orders?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`} className="muv-os-interactive px-2 py-1">
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link href={`/os/orders?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`} className="muv-os-interactive px-2 py-1">
                  Next
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </Workspace>
  );
}
