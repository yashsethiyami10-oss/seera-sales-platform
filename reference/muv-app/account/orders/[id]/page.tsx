import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/primitives";
import { OrderTimeline } from "@/components/order-success/order-timeline";
import { ReturnRequestClient } from "@/components/account/return-request-client";

// Phase 1D — approved policy: 48 hours from delivery to report an issue.
// Same value actions/returns.ts's submitReturnRequest enforces server-side;
// this only decides whether to show the form at all.
const REPORT_WINDOW_HOURS = 48;

export const metadata = buildMetadata({ title: "Order Details", path: "/account/orders", noIndex: true });

const paymentStatusLabel: Record<string, string> = { PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially Refunded" };
const paymentMethodLabel: Record<string, string> = { UPI: "UPI", CARD: "Credit / Debit Card", NETBANKING: "Net Banking", COD: "Cash on Delivery" };

/**
 * New route — Phase 11A's own report flagged "no per-order detail page
 * exists yet... that's Customer Account territory, the next phase." This is
 * that phase. Reuses the real `OrderTimeline` component (Phase 11A) rather
 * than re-implementing status display; every other value is a direct read
 * of the order's own stored fields, same discipline as /checkout/success.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const customer = await prisma.customer.findUnique({ where: { userId: session.user.id } });
  if (!customer) notFound();

  const order = await prisma.order.findUnique({
    where: { id },
    include: { address: true, coupon: true, items: true, shipment: true, returnRequests: true },
  });

  // Same identical response whether the order doesn't exist or belongs to
  // someone else — never confirm which, for the same reason documented in
  // app/(storefront)/checkout/success/page.tsx.
  if (!order || order.customerId !== customer.id) notFound();

  const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
  const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60);
  const reportEligible = order.status === "DELIVERED" && hoursSinceDelivery <= REPORT_WINDOW_HOURS;

  return (
    <div>
      <Link href="/account/orders" className="muv-text-meta text-xs flex items-center gap-1 mb-6 hover:text-white">
        <ChevronLeft size={13} /> Back to Orders
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Order #{order.orderNumber}</h1>
          <p className="muv-text-meta text-sm mt-1">{order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        <Badge tone={order.status === "CANCELLED" ? "muted" : "positive"}>{order.status}</Badge>
      </div>

      <div className="mb-10">
        <OrderTimeline status={order.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Items</h3>
          <div className="space-y-2 mb-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between muv-text-body text-sm">
                <span>{item.nameAtPurchase} ({item.sizeAtPurchase}) × {item.quantity}</span>
                <span>₹{item.priceAtPurchase * item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="h-px my-2" style={{ background: "var(--hairline)" }} />
          <div className="flex justify-between muv-text-body text-sm py-1"><span>Subtotal</span><span>₹{order.subtotal}</span></div>
          {order.discount > 0 && <div className="flex justify-between text-sm py-1" style={{ color: "var(--lavender)" }}><span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><span>−₹{order.discount}</span></div>}
          <div className="flex justify-between muv-text-body text-sm py-1"><span>Shipping ({order.shippingMethod === "EXPRESS" ? "Express" : "Standard"})</span><span>{order.shippingFee === 0 ? "FREE" : `₹${order.shippingFee}`}</span></div>
          <div className="my-3 h-px" style={{ background: "var(--hairline)" }} />
          <div className="flex justify-between font-display muv-text-solid text-base"><span>Total</span><span>₹{order.total}</span></div>
        </div>

        <div className="space-y-6">
          <div className="muv-card">
            <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Delivery Address</h3>
            <p className="muv-text-body text-sm">{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} – {order.address.pincode}</p>
            <p className="muv-text-meta text-xs mt-1">{order.address.phone}</p>
            {order.deliveryInstructions && <p className="muv-text-meta text-xs mt-3">Note: {order.deliveryInstructions}</p>}
          </div>
          <div className="muv-card">
            <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Payment</h3>
            <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Method</span><span className="muv-text-body">{paymentMethodLabel[order.paymentMethod]}</span></div>
            <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Status</span><span className="muv-text-body">{paymentStatusLabel[order.paymentStatus]}</span></div>
          </div>

          {/* Founder Final Consolidated Polish, Part 4 — real per-order
              entitlement flags (snapshotted at order-creation time), same
              ones already shown on checkout success and to admin staff. */}
          {(order.careCardIncluded || order.surpriseSampleIncluded) && (
            <div className="muv-card">
              <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>This Order Includes</h3>
              {order.careCardIncluded && <p className="muv-text-meta text-xs py-0.5">🎁 A Muv Care Card</p>}
              {order.surpriseSampleIncluded && <p className="muv-text-meta text-xs py-0.5">🎁 A complimentary surprise sample</p>}
            </div>
          )}

          {order.status === "DELIVERED" && (
            <ReturnRequestClient
              orderId={order.id}
              items={order.items.map((i) => ({ id: i.id, name: i.nameAtPurchase, size: i.sizeAtPurchase }))}
              eligible={reportEligible}
              defaultPhone={order.address.phone}
              existingRequests={order.returnRequests.map((r) => ({ orderItemId: r.orderItemId, ticketNumber: r.ticketNumber, status: r.status }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
