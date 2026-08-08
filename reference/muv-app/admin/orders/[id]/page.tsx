import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getInvoiceData } from "@/lib/tax/invoice";
import { Badge } from "@/components/ui/primitives";
import { OrderTimeline } from "@/components/order-success/order-timeline";
import { AdminOrderActions } from "@/components/admin/admin-order-actions";
import { CustomerNotesClient } from "@/components/admin/customer-notes-client";
import { OrderPrintExportActions } from "@/components/admin/order-print-export";

const paymentStatusLabel: Record<string, string> = { PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially Refunded" };
const paymentMethodLabel: Record<string, string> = { UPI: "UPI", CARD: "Credit / Debit Card", NETBANKING: "Net Banking", COD: "Cash on Delivery" };
const shipmentStatusLabel: Record<string, string> = { PENDING: "Pending Pickup", PICKED_UP: "Picked Up", IN_TRANSIT: "In Transit", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", FAILED: "Failed", RTO: "Returned to Origin" };

/**
 * Admin counterpart to app/account/orders/[id]/page.tsx (Phase 12A) —
 * reuses the same real OrderTimeline component, but adds staff-only
 * capability (status transitions, refunds, GST invoice breakdown, shipment
 * tracking, internal notes) that the customer-facing page correctly omits.
 * No order calculation is reimplemented: totals come straight from the
 * stored Order row, GST line-item math comes from the existing
 * getInvoiceData() (lib/tax/invoice.ts), status transitions and refunds go
 * through the existing updateOrderStatus/refundOrder actions.
 */
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      address: true,
      coupon: true,
      items: true,
      customer: { include: { notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } } } },
      shipment: true,
    },
  });
  if (!order) notFound();

  const invoice = await getInvoiceData(order.id);
  const shapedNotes = order.customer.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), authorName: n.author?.name ?? null }));

  const csvRows: string[][] = [
    ["Description", "Size", "HSN", "Qty", "Unit Price", "Taxable Value", "CGST", "SGST", "IGST", "Line Total"],
    ...invoice.lineItems.map((l) => [l.description, l.size, l.hsnCode, String(l.quantity), String(l.unitPrice), String(l.taxableValue), String(l.cgst), String(l.sgst), String(l.igst), String(l.total)]),
    ["", "", "", "", "", "", "", "", "Grand Total", String(invoice.totals.grandTotal)],
  ];

  return (
    <div>
      <Link href="/admin/orders" className="muv-text-meta text-xs flex items-center gap-1 mb-6 hover:text-white print:hidden">
        <ChevronLeft size={13} /> Back to Orders
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Order #{order.orderNumber}</h1>
          <p className="muv-text-meta text-sm mt-1">{order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={order.status === "CANCELLED" ? "muted" : "positive"}>{order.status}</Badge>
          <OrderPrintExportActions orderNumber={order.orderNumber} csvRows={csvRows} />
        </div>
      </div>

      <div className="muv-card mb-8 print:hidden">
        <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Update Status</h3>
        <AdminOrderActions orderId={order.id} status={order.status} paymentStatus={order.paymentStatus} total={order.total} />
      </div>

      <div className="mb-10">
        <OrderTimeline status={order.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Customer</h3>
          <Link href={`/admin/customers/${order.customerId}`} className="muv-text-body text-sm hover:text-white">{order.customer.name}</Link>
          <p className="muv-text-meta text-xs mt-1">{order.customer.email}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</p>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Shipping Address</h3>
          <p className="muv-text-body text-sm">{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} – {order.address.pincode}</p>
          <p className="muv-text-meta text-xs mt-1">{order.address.phone}</p>
          {order.deliveryInstructions && <p className="muv-text-meta text-xs mt-3">Note: {order.deliveryInstructions}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Payment</h3>
          <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Method</span><span className="muv-text-body">{paymentMethodLabel[order.paymentMethod]}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Status</span><span className="muv-text-body">{paymentStatusLabel[order.paymentStatus]}</span></div>
          {order.razorpayPaymentId && <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Razorpay Payment ID</span><span className="muv-text-body">{order.razorpayPaymentId}</span></div>}
          {/* Final Customer Experience Sprint, Phase 10+11 — fulfillment staff
              need to know what to physically include when packing this order. */}
          <div className="h-px my-2" style={{ background: "var(--hairline)" }} />
          <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Muv Care Card</span><span className="muv-text-body">{order.careCardIncluded ? "Include" : "—"}</span></div>
          <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Surprise Sample</span><span className="muv-text-body">{order.surpriseSampleIncluded ? "Include" : "—"}</span></div>
        </div>
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-sm mb-3" style={{ fontWeight: 500 }}>Shipment Tracking</h3>
          {order.shipment ? (
            <>
              <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Courier</span><span className="muv-text-body">{order.shipment.courierName ?? order.shipment.provider}</span></div>
              <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">AWB / Tracking No.</span><span className="muv-text-body">{order.shipment.awbNumber ?? "—"}</span></div>
              <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Status</span><span className="muv-text-body">{shipmentStatusLabel[order.shipment.status] ?? order.shipment.status}</span></div>
              {order.shipment.estimatedDelivery && <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Est. Delivery</span><span className="muv-text-body">{order.shipment.estimatedDelivery.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>}
            </>
          ) : (
            <p className="muv-text-meta text-sm">Not yet fulfilled — no shipment created.</p>
          )}
        </div>
      </div>

      <div className="muv-card mb-6">
        <h3 className="font-display muv-text-solid text-sm mb-4" style={{ fontWeight: 500 }}>Items & GST Invoice Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>{["Item", "HSN", "Qty", "Unit Price", "Taxable Value", "CGST", "SGST", "IGST", "Line Total"].map((h) => <th key={h} className="text-left py-2 px-2 muv-text-meta text-xs uppercase" style={{ borderBottom: "1px solid var(--card-border)" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 px-2 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{l.description} ({l.size})</td>
                  <td className="py-2 px-2 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>{l.hsnCode}</td>
                  <td className="py-2 px-2 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>{l.quantity}</td>
                  <td className="py-2 px-2 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.unitPrice}</td>
                  <td className="py-2 px-2 muv-text-body" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.taxableValue}</td>
                  <td className="py-2 px-2 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.cgst}</td>
                  <td className="py-2 px-2 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.sgst}</td>
                  <td className="py-2 px-2 muv-text-meta" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.igst}</td>
                  <td className="py-2 px-2 muv-text-solid" style={{ borderBottom: "1px solid var(--card-border)" }}>₹{l.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1" style={{ maxWidth: 280, marginLeft: "auto" }}>
          <div className="flex justify-between muv-text-body text-sm py-1"><span>Subtotal</span><span>₹{invoice.totals.subtotal}</span></div>
          {invoice.totals.discount > 0 && <div className="flex justify-between text-sm py-1" style={{ color: "var(--lavender)" }}><span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><span>−₹{invoice.totals.discount}</span></div>}
          <div className="flex justify-between muv-text-body text-sm py-1"><span>Shipping ({order.shippingMethod === "EXPRESS" ? "Express" : "Standard"})</span><span>{invoice.totals.shippingFee === 0 ? "FREE" : `₹${invoice.totals.shippingFee}`}</span></div>
          <div className="my-2 h-px" style={{ background: "var(--hairline)" }} />
          <div className="flex justify-between font-display muv-text-solid text-base"><span>Total</span><span>₹{invoice.totals.grandTotal}</span></div>
        </div>
        <p className="muv-text-faint text-xs mt-4">Invoice {invoice.invoiceNumber} · Place of supply: {invoice.placeOfSupply} · Seller GSTIN: {invoice.seller.gstin}</p>
      </div>

      <div className="print:hidden">
        <h2 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Internal Notes <span className="muv-text-faint font-normal text-xs">(tracked per-customer, not per-order)</span></h2>
        <CustomerNotesClient customerId={order.customerId} notes={shapedNotes} />
      </div>
    </div>
  );
}
