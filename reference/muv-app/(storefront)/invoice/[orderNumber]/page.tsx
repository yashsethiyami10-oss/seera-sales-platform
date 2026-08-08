import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvoiceData } from "@/lib/tax/invoice";
import { buildMetadata } from "@/lib/seo";
import { PrintButton } from "@/components/order-success/print-button";

export const metadata = buildMetadata({ title: "Invoice", path: "/invoice", noIndex: true });

/**
 * Founder Final Consolidated Polish, Part 2 — "Download Invoice", built as
 * a real, working print-optimized view rather than a PDF-generation
 * pipeline this deployment has no library for (lib/tax/invoice.ts's own
 * comment already flagged that gap). The browser's native print-to-PDF is
 * a genuine, standard "download as PDF" path — `window.print()` via
 * PrintButton, with print-only CSS hiding chrome/nav so the saved PDF is
 * just the invoice. Same ownership check as checkout/success (order number
 * + guest email together, or session ownership) — never orderNumber alone.
 */
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ email?: string }> }) {
  const { orderNumber } = await params;
  const { email: guestEmail } = await searchParams;
  const session = await auth();

  if (!session?.user && !guestEmail) notFound();

  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { customer: true } });

  const isOwnedByGuest = !session?.user && !!guestEmail && !order?.customer.userId && order?.customer.email.toLowerCase() === guestEmail.toLowerCase();
  const isOwnedBySession = session?.user
    ? (await prisma.customer.findUnique({ where: { userId: session.user.id } }))?.id === order?.customerId
    : false;

  if (!order || (!isOwnedByGuest && !isOwnedBySession)) notFound();

  const invoice = await getInvoiceData(order.id);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 print:px-0 print:py-0">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Invoice {invoice.invoiceNumber}</h1>
        <PrintButton />
      </div>

      <div className="muv-card print:border-0 print:shadow-none" style={{ background: "#fff", color: "#0b0b0f" }}>
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-lg font-semibold">Muv</p>
            <p className="text-xs" style={{ color: "#555" }}>{invoice.seller.state}</p>
            <p className="text-xs" style={{ color: "#555" }}>GSTIN: {invoice.seller.gstin}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{invoice.invoiceNumber}</p>
            <p className="text-xs" style={{ color: "#555" }}>{new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: "#777" }}>Billed To</p>
          <p className="text-sm font-medium">{invoice.buyer.name}</p>
          <p className="text-xs" style={{ color: "#555" }}>{invoice.buyer.address}</p>
        </div>

        <table className="w-full text-xs mb-8" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd" }}>
              <th className="text-left py-2">Item</th>
              <th className="text-left py-2">HSN</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Unit Price</th>
              <th className="text-right py-2">GST</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td className="py-2">{item.description} ({item.size})</td>
                <td className="py-2">{item.hsnCode}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">₹{item.unitPrice}</td>
                <td className="py-2 text-right">{item.gstRate}%</td>
                <td className="py-2 text-right">₹{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-56 text-xs space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{invoice.totals.subtotal}</span></div>
            {invoice.totals.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−₹{invoice.totals.discount}</span></div>}
            <div className="flex justify-between"><span>Shipping</span><span>{invoice.totals.shippingFee === 0 ? "Free" : `₹${invoice.totals.shippingFee}`}</span></div>
            <div className="flex justify-between"><span>CGST</span><span>₹{invoice.totals.cgst}</span></div>
            <div className="flex justify-between"><span>SGST</span><span>₹{invoice.totals.sgst}</span></div>
            <div className="flex justify-between"><span>IGST</span><span>₹{invoice.totals.igst}</span></div>
            <div className="flex justify-between text-sm font-semibold pt-1" style={{ borderTop: "1px solid #ddd" }}><span>Grand Total</span><span>₹{invoice.totals.grandTotal}</span></div>
          </div>
        </div>

        <p className="text-[10px] mt-8" style={{ color: "#999" }}>Payment: {invoice.paymentMethod} · {invoice.paymentStatus}</p>
      </div>
    </div>
  );
}
