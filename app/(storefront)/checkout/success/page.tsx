import Link from "next/link";
import { Check, MapPin, Truck, CreditCard, FileText } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMetadata } from "@/lib/seo";
import { getInvoiceData } from "@/lib/tax/invoice";
import { Reveal } from "@/components/ui/reveal";
import { TrustIndicators, CART_TRUST_ITEMS } from "@/components/storefront/trust-indicators";
import { FeaturedProducts, type FeaturedProduct } from "@/components/storefront/featured-products";
import { OrderTimeline } from "@/components/order-success/order-timeline";
import { NextSteps } from "@/components/order-success/next-steps";
import { ShareExperience } from "@/components/order-success/share-experience";
import { MuvCommunity } from "@/components/order-success/muv-community";
import { MuvCareCard } from "@/components/order-success/muv-care-card";
import { OrderInvalid } from "@/components/order-success/order-invalid";
import { extractUSP } from "@/lib/utils/extract-usp";

export const metadata = buildMetadata({ title: "Order Confirmed", path: "/checkout/success", noIndex: true });

// Phase 1D correction pass — previously keyed off the fee amount itself
// (0 or 99) to guess Standard vs Express, which broke the moment Express
// became threshold-based (₹50 above the free-shipping threshold matched
// neither key and silently fell back to "Standard Delivery"). `shippingMethod`
// is now the real, persisted column createOrder writes — read directly,
// no inference.
const SHIPPING_ETA_DAYS: Record<"STANDARD" | "EXPRESS", [number, number]> = {
  STANDARD: [4, 6],
  EXPRESS: [1, 2],
};
const SHIPPING_LABEL: Record<"STANDARD" | "EXPRESS", string> = {
  STANDARD: "Standard Delivery",
  EXPRESS: "Express Delivery",
};

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string; email?: string }> }) {
  const { order: orderNumber, email: guestEmail } = await searchParams;
  const session = await auth();

  // Every branch below that can't produce a real, owned order renders the
  // same OrderInvalid state — so this page can never be used to probe
  // whether an order number exists (PHASE_4C §12's security principle).
  //
  // Phase 18 — guest checkout has no session to prove ownership with, so a
  // guest order is looked up by orderNumber + the email used at checkout
  // together (both must match, and the underlying Customer must genuinely
  // have no linked account) — never by orderNumber alone, which is only a
  // random 6-digit value and not a real secret on its own. A logged-in
  // customer's ownership check is completely unchanged.
  if (!orderNumber || (!session?.user && !guestEmail)) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <OrderInvalid />
      </div>
    );
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      address: true,
      coupon: true,
      customer: true,
      items: { include: { variant: { include: { product: { include: { category: true } } } } } },
    },
  });

  const isOwnedByGuest = !session?.user && !!guestEmail && !order?.customer.userId && order?.customer.email.toLowerCase() === guestEmail.toLowerCase();
  const isOwnedBySession = session?.user
    ? (await prisma.customer.findUnique({ where: { userId: session.user.id } }))?.id === order?.customerId
    : false;

  if (!order || (!isOwnedByGuest && !isOwnedBySession)) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <OrderInvalid />
      </div>
    );
  }

  const customer = order.customer;

  const etaDays = SHIPPING_ETA_DAYS[order.shippingMethod];
  const shippingLabel = SHIPPING_LABEL[order.shippingMethod];
  const estimateStart = new Date(order.createdAt);
  estimateStart.setDate(estimateStart.getDate() + etaDays[0]);
  const estimateEnd = new Date(order.createdAt);
  estimateEnd.setDate(estimateEnd.getDate() + etaDays[1]);
  const dateFmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const invoice = await getInvoiceData(order.id);

  const categoryIds = [...new Set(order.items.map((i) => i.variant.product.categoryId))];
  const orderedProductIds = order.items.map((i) => i.variant.productId);
  const recommendedRaw = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: orderedProductIds },
      ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 4,
    include: { category: true, variants: { orderBy: { price: "asc" }, include: { inventory: true } }, reviews: { where: { status: "APPROVED" } }, content: { select: { keyBenefits: true } } },
  });
  const recommendedProducts: FeaturedProduct[] = recommendedRaw.map((p, i) => {
    const v = [...p.variants].sort((a, b) => a.price - b.price)[0];
    const variant = v ? { id: v.id, size: v.size, price: v.price, mrp: v.mrp, quantity: v.inventory?.quantity ?? 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 10 } : null;
    const rating = p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : null;
    return { id: p.id, name: p.name, slug: p.slug, category: { name: p.category.name }, images: p.images, usp: extractUSP(p.content?.keyBenefits ?? null), badge: i === 0 ? "New" : null, rating, reviewCount: p.reviews.length, variant };
  });

  const firstItem = order.items[0];
  const paymentStatusLabel: Record<string, string> = { PENDING: "Pending", PAID: "Paid", FAILED: "Failed", REFUNDED: "Refunded", PARTIALLY_REFUNDED: "Partially Refunded" };
  const paymentMethodLabel: Record<string, string> = { UPI: "UPI", CARD: "Credit / Debit Card", NETBANKING: "Net Banking", COD: "Cash on Delivery" };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* ---- 1. Success Hero ---- */}
      <div className="text-center mb-12">
        <Reveal>
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "var(--lavender)" }}>
            <Check size={28} color="#0b0b0f" strokeWidth={3} />
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mt-6 mb-2" style={{ fontWeight: 400, fontSize: "clamp(1.6rem,3.4vw,2.2rem)" }}>
            Thank you, {customer.name.split(" ")[0]}.
          </h1>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="muv-text-body text-sm" style={{ maxWidth: "48ch", margin: "0 auto", lineHeight: 1.7 }}>
            Your Muv order is being carefully prepared. We'll keep you updated every step of the way.
          </p>
        </Reveal>
        {/* Founder Hero Copy Freeze — "Keep Muving™" as its own line, styled
            as a brand signature: lavender, semi-bold, premium tracking, no
            glow — the final emotional sign-off, not another body sentence. */}
        <Reveal delay={0.19}>
          <p className="mt-5 mb-8" style={{ color: "var(--lavender)", fontWeight: 600, fontSize: "15px", letterSpacing: "0.08em" }}>
            Keep Muving™
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 muv-card" style={{ display: "inline-flex", padding: "16px 28px" }}>
            <div><p className="muv-text-faint text-[10px] uppercase">Order Number</p><p className="muv-text-solid text-sm mt-0.5">#{order.orderNumber}</p></div>
            <div><p className="muv-text-faint text-[10px] uppercase">Order Date</p><p className="muv-text-solid text-sm mt-0.5">{dateFmt(order.createdAt)}</p></div>
            <div><p className="muv-text-faint text-[10px] uppercase">Payment</p><p className="muv-text-solid text-sm mt-0.5">{paymentStatusLabel[order.paymentStatus]}</p></div>
            <div><p className="muv-text-faint text-[10px] uppercase">Est. Delivery</p><p className="muv-text-solid text-sm mt-0.5">{dateFmt(estimateStart)} – {dateFmt(estimateEnd)}</p></div>
          </div>
        </Reveal>
      </div>

      {/* ---- 2. Order Timeline ---- */}
      <section className="mb-12">
        <OrderTimeline status={order.status} />
      </section>

      {/* ---- 2b. Muv Care Card (Final Customer Experience Sprint, Phase 11) ---- */}
      {order.careCardIncluded && (
        <MuvCareCard
          orderUrl={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://muv-platform.vercel.app"}/checkout/success?order=${order.orderNumber}${guestEmail ? `&email=${encodeURIComponent(guestEmail)}` : ""}`}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ---- 3. Order Summary ---- */}
        <div className="muv-card">
          <h3 className="font-display muv-text-solid text-base mb-4" style={{ fontWeight: 500 }}>Order Summary</h3>
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
          {order.discount > 0 && <div className="flex justify-between text-sm py-1" style={{ color: "var(--lavender)" }}><span>Coupon Discount{order.coupon ? ` (${order.coupon.code})` : ""}</span><span>−₹{order.discount}</span></div>}
          <div className="flex justify-between muv-text-body text-sm py-1"><span>Shipping</span><span>{order.shippingFee === 0 ? "FREE" : `₹${order.shippingFee}`}</span></div>
          <div className="flex justify-between muv-text-meta text-sm py-1"><span>Tax (GST, included)</span><span>₹{order.cgst + order.sgst + order.igst}</span></div>
          <div className="my-3 h-px" style={{ background: "var(--hairline)" }} />
          <div className="flex justify-between font-display muv-text-solid text-lg"><span>Grand Total</span><span>₹{order.total}</span></div>
          {order.surpriseSampleIncluded && (
            <p className="muv-text-meta text-xs mt-3">🎁 This order includes a complimentary surprise sample.</p>
          )}
        </div>

        <div className="space-y-8">
          {/* ---- 4. Delivery Information ---- */}
          <div className="muv-card">
            <h3 className="font-display muv-text-solid text-base mb-4 flex items-center gap-2" style={{ fontWeight: 500 }}>
              <MapPin size={16} style={{ color: "var(--lavender)" }} aria-hidden /> Delivery Information
            </h3>
            <p className="muv-text-solid text-sm">{customer.name}</p>
            <p className="muv-text-body text-sm">{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.city}, {order.address.state} – {order.address.pincode}</p>
            <p className="muv-text-meta text-xs mt-1">India · {order.address.phone}</p>
            <div className="h-px my-3" style={{ background: "var(--hairline)" }} />
            <div className="flex items-center gap-2 text-sm">
              <Truck size={14} style={{ color: "var(--lavender)" }} aria-hidden />
              <span className="muv-text-body">{shippingLabel} · Est. {dateFmt(estimateStart)}–{dateFmt(estimateEnd)}</span>
            </div>
            {order.deliveryInstructions && <p className="muv-text-meta text-xs mt-3">Note: {order.deliveryInstructions}</p>}
          </div>

          {/* ---- 5. Payment Information ---- */}
          <div id="invoice" className="muv-card scroll-mt-24">
            <h3 className="font-display muv-text-solid text-base mb-4 flex items-center gap-2" style={{ fontWeight: 500 }}>
              <CreditCard size={16} style={{ color: "var(--lavender)" }} aria-hidden /> Payment Information
            </h3>
            <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Method</span><span className="muv-text-body">{paymentMethodLabel[order.paymentMethod]}</span></div>
            <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Status</span><span className="muv-text-body">{paymentStatusLabel[order.paymentStatus]}</span></div>
            {order.razorpayPaymentId && <div className="flex justify-between text-sm py-1"><span className="muv-text-meta">Reference</span><span className="muv-text-body">{order.razorpayPaymentId}</span></div>}
            <div className="h-px my-3" style={{ background: "var(--hairline)" }} />
            <div className="flex items-center gap-2 text-sm mb-2">
              <FileText size={14} style={{ color: "var(--lavender)" }} aria-hidden />
              <span className="muv-text-solid">Invoice {invoice.invoiceNumber}</span>
            </div>
            <p className="muv-text-meta text-xs mb-3">Taxable value ₹{invoice.totals.taxableValue} · GST ₹{invoice.totals.cgst + invoice.totals.sgst + invoice.totals.igst}</p>
            <Link
              href={`/invoice/${order.orderNumber}${guestEmail ? `?email=${encodeURIComponent(guestEmail)}` : ""}`}
              target="_blank"
              className="muv-footer-link muv-text-solid text-xs inline-flex items-center gap-1.5"
            >
              <FileText size={13} aria-hidden /> Download Invoice
            </Link>
          </div>
        </div>
      </div>

      {/* ---- 6. Next Steps ---- */}
      <NextSteps invoiceHref={`/invoice/${order.orderNumber}${guestEmail ? `?email=${encodeURIComponent(guestEmail)}` : ""}`} />

      {/* ---- 7. Trust Section ---- */}
      <TrustIndicators items={CART_TRUST_ITEMS} />

      {/* ---- 8. Recommended Products ---- */}
      {recommendedProducts.length > 0 && (
        <section className="mt-16">
          <p className="muv-eyebrow mb-3">You Might Also Like</p>
          <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.5rem" }}>Complete the range</h2>
          <FeaturedProducts products={recommendedProducts} wishlistedIds={[]} />
        </section>
      )}

      {/* ---- 9. Share Your Experience ---- */}
      <ShareExperience
        firstProductSlug={firstItem?.variant.product.slug ?? null}
        firstProductName={firstItem?.nameAtPurchase ?? null}
        orderNumber={order.orderNumber}
      />

      {/* ---- 10. MUV Community ---- */}
      <MuvCommunity />

      <div className="text-center mt-16">
        <Link href="/shop" className="muv-footer-link muv-text-meta hover:text-white text-xs uppercase tracking-widest">Continue Shopping</Link>
      </div>
    </div>
  );
}
