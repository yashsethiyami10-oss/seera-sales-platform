import Link from "next/link";
import { Truck, Zap, PackageX, Gift } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

/**
 * Same real values already shown at /shipping and at checkout
 * (components/checkout/checkout-client.tsx's SHIPPING_OPTIONS) — one source
 * of truth stated in three places, never a separately-maintained number.
 */
const SHIPPING_OPTIONS = [
  { id: "standard", label: "Standard Delivery", eta: "4–6 business days", price: "Free", icon: Truck },
  { id: "express", label: "Express Delivery", eta: "1–2 business days", price: "₹99", icon: Zap },
];

export function ProductDeliveryInfo() {
  return (
    <section className="mt-20 max-w-2xl">
      <Reveal>
        <p className="muv-eyebrow mb-3">Delivery</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Delivery &amp; Returns</h2>
      </Reveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {SHIPPING_OPTIONS.map((opt) => (
          <Reveal key={opt.id} delay={0.1}>
            <div className="muv-card flex items-start gap-3">
              <opt.icon size={18} strokeWidth={1.3} style={{ color: "var(--lavender)" }} className="mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <p className="muv-text-solid text-sm font-medium">{opt.label}</p>
                <p className="muv-text-meta text-xs mt-1">{opt.eta} · {opt.price}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      {/* Final Customer Experience Sprint, Phase 10+11 — same real ₹499
          offer shown in Cart/Checkout, restated here since a single-product
          page has no live cart subtotal to measure progress against. */}
      <Reveal delay={0.13}>
        <div className="muv-card flex items-start gap-3 mb-4">
          <Gift size={18} strokeWidth={1.3} style={{ color: "var(--lavender)" }} className="mt-0.5 flex-shrink-0" aria-hidden />
          <div>
            <p className="muv-text-solid text-sm font-medium">Orders above ₹499</p>
            <p className="muv-text-meta text-xs mt-1">Free delivery and a complimentary surprise sample. Every order includes a Muv Care Card.</p>
          </div>
        </div>
      </Reveal>
      <Reveal delay={0.16}>
        <div className="muv-card flex items-start gap-3">
          <PackageX size={18} strokeWidth={1.3} style={{ color: "var(--lavender)" }} className="mt-0.5 flex-shrink-0" aria-hidden />
          <div>
            <p className="muv-text-solid text-sm font-medium">Returns</p>
            <p className="muv-text-meta text-xs mt-1">
              Arrived damaged, wrong, or defective?{" "}
              <Link href="/returns" className="muv-footer-link muv-text-solid">See our returns process</Link>.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
