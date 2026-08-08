import { prisma } from "@/lib/prisma";
import { calculateOrderGst } from "@/lib/tax/gst";
import { AppError, NotFoundError } from "@/lib/errors";

/**
 * Read-only cart pricing preview. There is no server-side Cart table by
 * design (see CLAUDE.md: cart state lives client-side; only sent to the
 * backend at checkout) — so "Cart Read/Add/Remove" cannot mean "look up a
 * stored cart," only "given the line items the caller already has
 * (client-side), resolve live price/stock/tax/shipping for them." This
 * mirrors `actions/orders.ts`'s `createOrder` pricing math exactly
 * (same EXPRESS_SHIPPING_FEE/threshold/GST-after-discount logic) but
 * never writes anything — no coupon `usedCount` increment, no Order row.
 * `createOrder` remains the sole place a cart actually becomes a real
 * order; this is a preview only.
 */

export type CartPricingItem = { variantId: string; quantity: number };

export type CartPricingInput = {
  items: CartPricingItem[];
  buyerState: string;
  shippingMethod?: "STANDARD" | "EXPRESS";
  paymentMethod?: "UPI" | "CARD" | "NETBANKING" | "COD";
  couponCode?: string;
};

const EXPRESS_SHIPPING_FEE = 99;
const EXPRESS_SHIPPING_FEE_ABOVE_THRESHOLD = 50;

export async function priceCart(input: CartPricingInput) {
  const variantIds = input.items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { inventory: true, product: { select: { name: true, hsnCode: true, gstRate: true } } },
  });

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) throw new NotFoundError("Product variant");
    const quantity = item.quantity;
    const inStock = (variant.inventory?.quantity ?? 0) >= quantity;
    const lineTotal = variant.price * quantity;
    subtotal += lineTotal;
    return {
      variantId: variant.id,
      name: variant.product.name,
      size: variant.size,
      quantity,
      unitPrice: variant.price,
      unitMrp: variant.mrp,
      lineTotal,
      inStock,
      hsnCode: variant.product.hsnCode,
      gstRate: variant.product.gstRate,
    };
  });

  const outOfStock = lines.filter((l) => !l.inStock);

  let discount = 0;
  let couponApplied: { code: string; type: string; value: number } | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon || !coupon.active) throw new AppError("Coupon is invalid or expired", 400, "INVALID_COUPON");
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError("Coupon has expired", 400, "INVALID_COUPON");
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new AppError("Coupon usage limit reached", 400, "INVALID_COUPON");
    if (subtotal < coupon.minOrderValue) throw new AppError(`Minimum order value for this coupon is ₹${coupon.minOrderValue}`, 400, "INVALID_COUPON");
    discount = coupon.type === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    couponApplied = { code: coupon.code, type: coupon.type, value: coupon.value };
    // Deliberately never increments `usedCount` — this is a preview, not a
    // real redemption. Only `createOrder` (the actual write path) does that.
  }

  const storeSettings = await prisma.storeSettings.findUnique({ where: { id: "singleton" } });
  const freeShippingThreshold = storeSettings?.freeShippingThreshold ?? 499;
  const baseShippingFee = storeSettings?.shippingFee ?? 49;
  const codFee = storeSettings?.codFee ?? 0;

  const shippingMethod = input.shippingMethod ?? "STANDARD";
  const meetsFreeShippingThreshold = subtotal - discount >= freeShippingThreshold;
  const baseFeeForMethod =
    shippingMethod === "EXPRESS"
      ? meetsFreeShippingThreshold
        ? EXPRESS_SHIPPING_FEE_ABOVE_THRESHOLD
        : EXPRESS_SHIPPING_FEE
      : meetsFreeShippingThreshold
        ? 0
        : baseShippingFee;
  const shippingFee = baseFeeForMethod + (input.paymentMethod === "COD" ? codFee : 0);

  const discountRatio = subtotal > 0 ? discount / subtotal : 0;
  const gstInput = lines.map((l) => ({
    hsnCode: l.hsnCode,
    gstRate: l.gstRate,
    lineTotal: Math.round(l.lineTotal * (1 - discountRatio)),
  }));
  const { totals: gst } = calculateOrderGst(gstInput, input.buyerState);

  const total = subtotal - discount + shippingFee;

  return {
    lines,
    outOfStock: outOfStock.map((l) => ({ variantId: l.variantId, name: l.name, size: l.size })),
    subtotal,
    discount,
    couponApplied,
    shippingFee,
    shippingMethod,
    gst,
    total,
  };
}
