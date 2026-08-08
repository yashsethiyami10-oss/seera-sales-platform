import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/primitives";
import { CustomerNotesClient } from "@/components/admin/customer-notes-client";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { isDefault: "desc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
      wishlist: { include: { product: { select: { name: true, slug: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      _count: { select: { orders: true } },
    },
  });
  if (!customer) notFound();

  // Lifetime Value / Average Order Value — computed from real PAID orders
  // only (unpaid/failed/cancelled orders were never actually revenue).
  const paidOrders = await prisma.order.findMany({ where: { customerId: customer.id, paymentStatus: "PAID" }, select: { total: true } });
  const lifetimeValue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = paidOrders.length > 0 ? Math.round(lifetimeValue / paidOrders.length) : 0;
  const lastOrder = customer.orders[0];

  const shapedNotes = customer.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), authorName: n.author?.name ?? null }));

  return (
    <div>
      <Link href="/admin/customers" className="muv-text-meta text-xs flex items-center gap-1 mb-6 hover:text-white">
        <ChevronLeft size={13} /> Back to Customers
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>{customer.name}</h1>
          <p className="muv-text-meta text-sm mt-1">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
        </div>
        <Badge tone={customer.marketingOptIn ? "positive" : "muted"}>{customer.marketingOptIn ? "Newsletter Subscribed" : "Not Subscribed"}</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>₹{lifetimeValue.toLocaleString("en-IN")}</p><p className="muv-text-meta text-xs mt-1">Lifetime Value</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>₹{avgOrderValue.toLocaleString("en-IN")}</p><p className="muv-text-meta text-xs mt-1">Avg Order Value</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>{customer._count.orders}</p><p className="muv-text-meta text-xs mt-1">Total Orders</p></div>
        <div className="muv-card"><p className="font-display muv-text-solid" style={{ fontSize: 22, fontWeight: 500 }}>{customer.createdAt.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p><p className="muv-text-meta text-xs mt-1">Customer Since</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="muv-card">
          <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Order History {lastOrder && <span className="muv-text-faint font-normal">· Last: {lastOrder.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}</h2>
          <div className="space-y-2">
            {customer.orders.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center justify-between text-sm hover:opacity-80">
                <span className="muv-text-body">#{o.orderNumber}</span>
                <div className="flex items-center gap-2">
                  <span className="muv-text-meta">₹{o.total}</span>
                  <Badge tone={o.status === "CANCELLED" ? "muted" : "positive"}>{o.status}</Badge>
                </div>
              </Link>
            ))}
            {customer.orders.length === 0 && <p className="muv-text-meta text-sm">No orders yet.</p>}
          </div>
        </div>

        <div className="muv-card">
          <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Wishlist ({customer.wishlist.length})</h2>
          <div className="space-y-2">
            {customer.wishlist.map((w) => (
              <Link key={w.id} href={`/products/${w.product.slug}`} target="_blank" className="block text-sm muv-text-body hover:text-white">{w.product.name}</Link>
            ))}
            {customer.wishlist.length === 0 && <p className="muv-text-meta text-sm">Empty.</p>}
          </div>
        </div>
      </div>

      <div className="muv-card mb-8">
        <h2 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Saved Addresses</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {customer.addresses.map((a) => (
            <div key={a.id} style={{ padding: 12, border: "1px solid var(--card-border)", borderRadius: 12 }}>
              <span className="muv-tag-pill">{a.label}</span>
              {a.isDefault && <span className="muv-tag-pill ml-2">Default</span>}
              <p className="muv-text-body text-sm mt-2">{a.line1}, {a.city}, {a.state} – {a.pincode}</p>
            </div>
          ))}
          {customer.addresses.length === 0 && <p className="muv-text-meta text-sm">No saved addresses.</p>}
        </div>
      </div>

      <div>
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Internal Notes</h2>
        <CustomerNotesClient customerId={customer.id} notes={shapedNotes} />
      </div>
    </div>
  );
}
