import Link from "next/link";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { getBusinessOrderDetail, getBusinessOrderTimeline } from "@/actions/business-orders";
import { getInventoryCheck } from "@/actions/operations";
import { BusinessOrderStatusControl } from "@/components/os-orders/BusinessOrderStatusControl";
import { DispatchDeliveryInfoCard } from "@/components/os-orders/DispatchDeliveryInfoCard";
import { BusinessOrderTimeline } from "@/components/os-orders/BusinessOrderTimeline";
import { InventoryCheckPanel } from "@/components/os-orders/InventoryCheckPanel";
import { NoteThread } from "@/components/os-sales/NoteThread";
import { AttachmentList } from "@/components/os-sales/AttachmentList";

/**
 * Milestone 4 — Order Management OS, Business Order Detail. Follows
 * app/os/sales/opportunities/[id]/page.tsx's stacked-card template exactly
 * (not tabs) — PageHeader with the status control in its actions slot, a
 * 2-column grid of `muv-os-card` sections, Customer/Quotation/Opportunity
 * links in the sidebar column.
 */
export default async function BusinessOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orderResult, timelineResult, inventoryResult] = await Promise.all([getBusinessOrderDetail(id), getBusinessOrderTimeline(id), getInventoryCheck(id)]);
  if (!orderResult.success) notFound();
  const order = orderResult.data;
  const timeline = timelineResult.success ? timelineResult.data : [];
  const inventoryLines = inventoryResult.success ? inventoryResult.data.lines : [];

  return (
    <Workspace>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.customer.businessName ?? order.customer.name} · Owner: ${order.owner.name} · Territory: ${order.territory?.name ?? "—"}`}
        actions={<BusinessOrderStatusControl orderId={order.id} currentStatus={order.status} />}
      />

      <div className="px-6 pb-10 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Order Summary" />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p style={{ color: "rgba(var(--text-rgb),0.45)" }}>Subtotal</p><p style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{order.subtotal.toLocaleString("en-IN")}</p></div>
              <div><p style={{ color: "rgba(var(--text-rgb),0.45)" }}>Discount</p><p style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{order.discountTotal.toLocaleString("en-IN")}</p></div>
              <div><p style={{ color: "rgba(var(--text-rgb),0.45)" }}>Tax</p><p style={{ color: "rgba(var(--text-rgb),0.85)" }}>₹{order.taxTotal.toLocaleString("en-IN")}</p></div>
              <div><p style={{ color: "rgba(var(--text-rgb),0.45)" }}>Grand Total</p><p className="font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>₹{order.grandTotal.toLocaleString("en-IN")}</p></div>
            </div>
            {order.deliveryAddress && (
              <p className="mt-3 text-sm" style={{ color: "rgba(var(--text-rgb),0.7)" }}>Delivery Address: {order.deliveryAddress}</p>
            )}
            {order.cancelReason && (
              <p className="mt-3 text-sm" style={{ color: "#ef4444" }}>Cancelled: {order.cancelReason}</p>
            )}
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Line Items" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {["Product", "Size", "Qty", "Unit Price", "Discount %", "Tax %", "Line Total"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 text-xs uppercase" style={{ color: "rgba(var(--text-rgb),0.45)", borderBottom: "1px solid var(--card-border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.85)", borderBottom: "1px solid var(--card-border)" }}>{item.product.name}</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.6)", borderBottom: "1px solid var(--card-border)" }}>{item.variant?.size ?? "—"}</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.7)", borderBottom: "1px solid var(--card-border)" }}>{item.quantity}</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.7)", borderBottom: "1px solid var(--card-border)" }}>₹{item.unitPrice.toLocaleString("en-IN")}</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.7)", borderBottom: "1px solid var(--card-border)" }}>{item.discountPercent}%</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.7)", borderBottom: "1px solid var(--card-border)" }}>{item.taxRate}%</td>
                      <td className="py-2 px-2" style={{ color: "rgba(var(--text-rgb),0.85)", borderBottom: "1px solid var(--card-border)" }}>₹{item.lineTotal.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {(order.status === "CONFIRMED" || order.status === "PROCESSING") && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Inventory Check" />
              <div className="mt-3">
                <InventoryCheckPanel businessOrderId={order.id} status={order.status} lines={inventoryLines} warehouseName={order.warehouse?.name ?? null} />
              </div>
            </section>
          )}

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Dispatch & Delivery" />
            <div className="mt-3">
              <DispatchDeliveryInfoCard
                orderId={order.id}
                status={order.status}
                canAmend={order.canAmendDispatchDelivery}
                dispatchMethod={order.dispatchMethod}
                carrierName={order.carrierName}
                trackingReference={order.trackingReference}
                dispatchNotes={order.dispatchNotes}
                dispatchedAt={order.dispatchedAt}
                dispatchedByName={order.dispatchedBy?.name ?? null}
                deliveredAt={order.deliveredAt}
                deliveredByName={order.deliveredBy?.name ?? null}
                deliveryConfirmation={order.deliveryConfirmation}
                deliveryRemarks={order.deliveryRemarks}
              />
            </div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Notes / Issues / Remarks" />
            <div className="mt-3"><NoteThread entityType="ORDER" entityId={order.id} /></div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Attachments" />
            <div className="mt-3"><AttachmentList entityType="ORDER" entityId={order.id} /></div>
          </section>

          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Timeline" />
            <div className="mt-3"><BusinessOrderTimeline events={timeline} /></div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
            <SectionHeader title="Customer" />
            <div className="mt-3 text-sm space-y-1">
              <p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{order.customer.name}</p>
              {order.customer.businessName && <p style={{ color: "rgba(var(--text-rgb),0.6)" }}>{order.customer.businessName}</p>}
              <p style={{ color: "rgba(var(--text-rgb),0.6)" }}>{order.customer.phone}</p>
              <Link href={`/os/customers/${order.customer.id}`} className="muv-os-interactive inline-block mt-1 text-xs" style={{ color: "var(--lavender)" }}>View Customer Profile →</Link>
            </div>
          </section>

          {order.quotationVersion && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Originating Quotation" />
              <Link href={`/os/sales/quotations/${order.quotationVersion.quotation.id}`} className="mt-2 muv-os-interactive block text-sm" style={{ color: "var(--lavender)" }}>
                {order.quotationVersion.quotation.quotationNumber} (v{order.quotationVersion.versionNumber})
              </Link>
            </section>
          )}

          {order.opportunity && (
            <section className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
              <SectionHeader title="Originating Opportunity" />
              <Link href={`/os/sales/opportunities/${order.opportunity.id}`} className="mt-2 muv-os-interactive block text-sm" style={{ color: "var(--lavender)" }}>
                {order.opportunity.opportunityNumber}
              </Link>
            </section>
          )}
        </div>
      </div>
    </Workspace>
  );
}
