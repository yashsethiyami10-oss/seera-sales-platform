import { prisma } from "@/lib/prisma";
import { calculateOrderGst, SELLER_STATE } from "@/lib/tax/gst";
import { NotFoundError } from "@/lib/errors";

/**
 * Produces the structured data a GST-compliant invoice needs — this is the
 * data layer, not a PDF renderer. Feed this object into the `pdf` skill's
 * template (or a service like react-pdf) to actually generate the PDF file;
 * keeping the two concerns separate means the tax math is testable without
 * ever touching a PDF library, and the same data can also drive an on-screen
 * invoice view.
 */
export async function getInvoiceData(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      address: true,
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!order) throw new NotFoundError("Order");

  const gstLines = order.items.map((item) => ({
    hsnCode: item.variant.product.hsnCode,
    gstRate: item.variant.product.gstRate,
    lineTotal: item.priceAtPurchase * item.quantity,
  }));

  const { lines, totals } = calculateOrderGst(gstLines, order.address.state);

  return {
    invoiceNumber: `INV-${order.orderNumber}`,
    invoiceDate: order.createdAt,
    seller: {
      name: "Muv",
      state: SELLER_STATE,
      // GSTIN is a real registration number — placeholder until MUV's actual
      // GSTIN is available; never fabricate one for a real invoice.
      gstin: process.env.MUV_GSTIN ?? "GSTIN_NOT_CONFIGURED",
    },
    buyer: {
      name: order.customer.name,
      address: `${order.address.line1}, ${order.address.line2 ?? ""}, ${order.address.city}, ${order.address.state} – ${order.address.pincode}`,
      state: order.address.state,
    },
    placeOfSupply: order.address.state,
    lineItems: order.items.map((item, i) => {
      // `lines[i]` is guaranteed to exist — `lines` was built by mapping
      // over this exact same `order.items` array a few lines up, so the two
      // are always the same length. Asserted rather than left as an unsafe
      // index for the same reason as the similar case in
      // app/actions/shipping.ts.
      const line = lines[i]!;
      return {
        description: item.nameAtPurchase,
        size: item.sizeAtPurchase,
        hsnCode: line.hsnCode,
        quantity: item.quantity,
        unitPrice: item.priceAtPurchase,
        gstRate: line.gstRate,
        taxableValue: line.taxableValue,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        total: line.total,
      };
    }),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      ...totals,
      grandTotal: order.total,
    },
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}
