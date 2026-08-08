import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/primitives";
import { InventoryAdjustClient } from "@/components/admin/inventory-adjust-client";

const reasonLabel: Record<string, string> = {
  RESTOCK: "Restock",
  ORDER_FULFILLMENT: "Order Fulfilled",
  ORDER_CANCELLED: "Order Cancelled",
  MANUAL_ADJUSTMENT: "Manual Adjustment",
  RETURN: "Return",
};

/**
 * Filtering/search runs in-memory over the full inventory list rather than
 * via $queryRaw or pagination — the catalog this platform serves (a
 * boutique D2C brand) has a SKU count in the tens, not thousands, so a
 * single query plus JS filtering is the honest match for the actual scale,
 * not a premature optimization. getLowStock()'s existing $queryRaw is
 * reused for nothing here since the full list already carries quantity and
 * lowStockThreshold to compare client-side.
 */
export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;

  const [allInventory, recentHistory] = await Promise.all([
    prisma.inventory.findMany({
      include: { variant: { include: { product: { select: { name: true, slug: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.stockHistory.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { inventory: { include: { variant: { include: { product: { select: { name: true } } } } } }, changedBy: { select: { name: true } } },
    }),
  ]);

  const totalUnits = allInventory.reduce((sum, i) => sum + i.quantity, 0);
  const lowStockCount = allInventory.filter((i) => i.quantity > 0 && i.quantity <= i.lowStockThreshold).length;
  const outOfStockCount = allInventory.filter((i) => i.quantity === 0).length;

  let filtered = allInventory;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((i) => i.variant.product.name.toLowerCase().includes(needle) || i.variant.sku.toLowerCase().includes(needle));
  }
  if (status === "low") filtered = filtered.filter((i) => i.quantity > 0 && i.quantity <= i.lowStockThreshold);
  if (status === "out") filtered = filtered.filter((i) => i.quantity === 0);

  return (
    <div>
      <h1 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Inventory</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>{allInventory.length}</p><p className="muv-text-meta text-xs mt-1">Tracked SKUs</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>{totalUnits.toLocaleString("en-IN")}</p><p className="muv-text-meta text-xs mt-1">Units in Stock</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500, color: lowStockCount > 0 ? "#e0b84c" : undefined }}>{lowStockCount}</p><p className="muv-text-meta text-xs mt-1">Low Stock</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500, color: outOfStockCount > 0 ? "#e0685c" : undefined }}>{outOfStockCount}</p><p className="muv-text-meta text-xs mt-1">Out of Stock</p></div>
      </div>

      <form className="flex items-center gap-3 mb-5 flex-wrap" method="get">
        <input name="q" defaultValue={q ?? ""} placeholder="Search by product or SKU" className="muv-input" style={{ maxWidth: 320 }} />
        <select name="status" defaultValue={status ?? ""} className="muv-input" style={{ width: "auto" }}>
          <option value="">All statuses</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <button type="submit" className="muv-btn-ghost">Filter</button>
      </form>

      <div className="overflow-x-auto mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Product", "SKU", "Size", "Warehouse", "Quantity", "Low Stock At", "Status", ""].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const isOut = i.quantity === 0;
              const isLow = !isOut && i.quantity <= i.lowStockThreshold;
              return (
                <tr key={i.id}>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <Link href={`/admin/products?q=${encodeURIComponent(i.variant.product.name)}`} className="muv-text-solid hover:text-white">{i.variant.product.name}</Link>
                  </td>
                  <td className="py-3 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>{i.variant.sku}</td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{i.variant.size}</td>
                  <td className="py-3 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{i.warehouseLocation ?? "—"}</td>
                  <td className="py-3 px-3 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>{i.quantity}</td>
                  <td className="py-3 px-3 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>{i.lowStockThreshold}</td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <Badge tone={isOut ? "muted" : isLow ? "neutral" : "positive"}>{isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}</Badge>
                  </td>
                  <td className="py-3 px-3" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <InventoryAdjustClient variantId={i.variantId} label={`${i.variant.product.name} (${i.variant.size})`} quantity={i.quantity} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="py-8 text-center muv-text-meta text-sm">No inventory records match.</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Recent Stock Movements</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>{["Date", "Product", "Change", "Reason", "By", "Note"].map((h) => <th key={h} className="text-left py-2.5 px-3 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {recentHistory.map((h) => (
                <tr key={h.id}>
                  <td className="py-2.5 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{h.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2.5 px-3 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{h.inventory.variant.product.name} ({h.inventory.variant.size})</td>
                  <td className="py-2.5 px-3" style={{ borderBottom: "1px solid var(--card-border)", color: h.change > 0 ? "var(--lavender)" : "#e0685c" }}>{h.change > 0 ? `+${h.change}` : h.change}</td>
                  <td className="py-2.5 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{reasonLabel[h.reason] ?? h.reason}</td>
                  <td className="py-2.5 px-3 muv-text-meta text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{h.changedBy?.name ?? "System"}</td>
                  <td className="py-2.5 px-3 muv-text-faint text-xs" style={{ borderBottom: "1px solid var(--card-border)" }}>{h.note ?? "—"}</td>
                </tr>
              ))}
              {recentHistory.length === 0 && <tr><td colSpan={6} className="py-8 text-center muv-text-meta text-sm">No stock movements recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
