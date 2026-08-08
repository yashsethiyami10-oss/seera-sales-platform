import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { getInvoiceData } from "@/lib/tax/invoice";
import { Badge } from "@/components/ui/primitives";
import { OrderTimeline } from "@/components/order-success/order-timeline";
import { AdminOrderActions } from "@/components/admin/admin-order-actions";
import { CustomerNotesClient } from "@/components/admin/customer-notes-client";
import { OrderPrintExportActions } from "@/components/admin/order-print-export";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";

const paymentStatusLabel: Record<string, string> = { PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially Refunded" };
const paymentMethodLabel: Record<string, string> = { UPI: "UPI", CARD: "Credit / Debit Card", NETBANKING: "Net Banking", COD: "Cash on Delivery" };
const shipmentStatusLabel: Record<string, string> = { PENDING: "Pending Pickup", PICKED_UP: "Picked Up", IN_TRANSIT: "In Transit", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", FAILED: "Failed", RTO: "Returned to Origin" };

/**
 * Milestone 4 — Order Management OS. OS-shell counterpart to
 * app/admin/orders/[id]/page.tsx — same data (prisma.order.findUnique, same
 * include shape), same getInvoiceData()/OrderTimeline/AdminOrderActions/
 * OrderPrintExportActions/CustomerNotesClient components, same
 * updateOrderStatus/refundOrder actions underneath (via AdminOrderActions,
 * unmodified). Only the outer chrome changes (Workspace/PageHeader/
 * SectionHeader instead of raw admin markup) — no D2C business logic is
 * duplicated or rewritten. app/admin/orders/[id]/page.tsx itself is
 * untouched and remains fully functional independently of this page.
 *
 * Sales OS Separation, Block 1 — RBAC audit fix: this page queried
 * `prisma.order` directly with no permission check at all (unlike every
 * sibling `/os/*` detail page, which enforces its check inside the
 * Server Action it calls). `/os/*` is not covered by middleware.ts's
 * matcher and its layout only checks "is there a session" — so this was
 * reachable, unfiltered, by any authenticated user of any role,
 * including a plain storefront customer. Gated with the same
 * `ORDER_MGMT_VIEW` permission the parent list page (`app/os/orders/
 * page.tsx`, via `actions/order-mgmt.ts`) already requires to link here
 * — same permission, no new one invented, no behavior change for any
 * legitimately authorized user.
 */
export default async function DirectOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.ORDER_MGMT_VIEW);
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
    <Workspace>
      <PageHeader
        title={`Order #${order.orderNumber}`}
        description={order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        actions={
          <>
            <Badge tone={order.status === "CANCELLED" ? "muted" : "positive"}>{order.status}</Badge>
            <OrderPrintExportActions orderNumber={order.orderNumber} csvRows={csvRows} />
          </>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        <section className="muv-os-card rounded-2xl p-4 print:hidden" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Update Status" />
          <div className="mt-3">
            <AdminOrderActions orderId={order.id} status={order.status} paymentStatus={order.paymentStatus} total={order.total} />
          </div>
        </section>

        <OrderTimeline status={order.status} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Customer" />
            <div className="mt-3 text-sm">
              <Link href={`/os/customers/${order.customerId}`} className="muv-os-interactive" style={{ color: "var(--lavender)" }}>{order.customer.name}</Link>
              <p className="mt-1" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{order.customer.email}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</p>
            </div>
          </section>
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Shipping Address" />
            <div className="mt-3 text-sm" style={{ color: "rgba(var(--text-rgb),0.75)" }}>
              <p>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} – {order.address.pincode}</p>
              <p className="mt-1" style={{ color: "rgba(var(--text-rgb),0.5)" }}>{order.address.phone}</p>
              {order.deliveryInstructions && <p className="mt-2 text-xs" style={{ color: "rgba(var(--text-rgb),0.5)" }}>Note: {order.deliveryInstructions}</p>}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Payment" />
            <div className="mt-3 text-sm space-y-1">
              <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Method</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{paymentMethodLabel[order.paymentMethod]}</span></div>
              <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Status</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{paymentStatusLabel[order.paymentStatus]}</span></div>
              {order.razorpayPaymentId && <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Razorpay Payment ID</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{order.razorpayPaymentId}</span></div>}
            </div>
          </section>
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Shipment Tracking" />
            <div className="mt-3 text-sm space-y-1">
              {order.shipment ? (
                <>
                  <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Courier</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{order.shipment.courierName ?? order.shipment.provider}</span></div>
                  <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>AWB / Tracking No.</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{order.shipment.awbNumber ?? "—"}</span></div>
                  <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Status</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{shipmentStatusLabel[order.shipment.status] ?? order.shipment.status}</span></div>
                  {order.shipment.estimatedDelivery && <div className="flex justify-between"><span style={{ color: "rgba(var(--text-rgb),0.5)" }}>Est. Delivery</span><span style={{ color: "rgba(var(--text-rgb),0.8)" }}>{order.shipment.estimatedDelivery.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>}
                </>
              ) : (
                <p style={{ color: "rgba(var(--text-rgb),0.5)" }}>Not yet fulfilled — no shipment created.</p>
              )}
            </div>
          </section>
        </div>

        <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
          <SectionHeader title="Items & GST Invoice Summary" />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["Item", "HSN", "Qty", "Unit Price", "Taxable Value", "CGST", "SGST", "IGST", "Line Total"].map((h) => (
                    <th key={h} className="text-left py-2 px-2 text-xs uppercase" style={{ color: "rgba(var(--text-rgb),0.45)", borderBottom: "1px solid var(--card-border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.8)", borderBottom: "1px solid var(--card-border)" }}>{l.description} ({l.size})</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.5)", borderBottom: "1px solid var(--card-border)" }}>{l.hsnCode}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.8)", borderBottom: "1px solid var(--card-border)" }}>{l.quantity}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.8)", borderBottom: "1px solid var(--card-border)" }}>₹{l.unitPrice}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.8)", borderBottom: "1px solid var(--card-border)" }}>₹{l.taxableValue}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.5)", borderBottom: "1px solid var(--card-border)" }}>₹{l.cgst}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.5)", borderBottom: "1px solid var(--card-border)" }}>₹{l.sgst}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.5)", borderBottom: "1px solid var(--card-border)" }}>₹{l.igst}</td>
                    <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.85)", borderBottom: "1px solid var(--card-border)" }}>₹{l.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-1" style={{ maxWidth: 280, marginLeft: "auto" }}>
            <div className="flex justify-between text-sm py-1" style={{ color: "rgba(var(--text-rgb),0.75)" }}><span>Subtotal</span><span>₹{invoice.totals.subtotal}</span></div>
            {invoice.totals.discount > 0 && <div className="flex justify-between text-sm py-1" style={{ color: "var(--lavender)" }}><span>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><span>−₹{invoice.totals.discount}</span></div>}
            <div className="flex justify-between text-sm py-1" style={{ color: "rgba(var(--text-rgb),0.75)" }}><span>Shipping ({order.shippingMethod === "EXPRESS" ? "Express" : "Standard"})</span><span>{invoice.totals.shippingFee === 0 ? "FREE" : `₹${invoice.totals.shippingFee}`}</span></div>
            <div className="my-2 h-px" style={{ background: "var(--card-border)" }} />
            <div className="flex justify-between text-base font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}><span>Total</span><span>₹{invoice.totals.grandTotal}</span></div>
          </div>
          <p className="mt-4 text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Invoice {invoice.invoiceNumber} · Place of supply: {invoice.placeOfSupply} · Seller GSTIN: {invoice.seller.gstin}</p>
        </section>

        <section className="print:hidden">
          <h2 className="text-base font-medium mb-4" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Internal Notes <span className="font-normal text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>(tracked per-customer, not per-order)</span></h2>
          <CustomerNotesClient customerId={order.customerId} notes={shapedNotes} />
        </section>
      </div>
    </Workspace>
  );
}
