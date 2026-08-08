import { Truck, Zap, MapPin } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Shipping",
  description: "Muv shipping options, delivery timelines, and coverage.",
  path: "/shipping",
});

/**
 * Delivery options and prices reused exactly from the real values already
 * shown to customers at checkout/cart (components/checkout/checkout-client.tsx,
 * components/cart/cart-client.tsx) — a single source of truth stated in
 * several places, not independently-maintained numbers that could drift
 * apart. This page has no live cart subtotal to compute an exact fee from
 * (it's a Server Component with no request context), so it states the
 * threshold policy itself rather than a single number — same approved
 * policy as Phase 1D's cart/checkout pricing.
 */
const SHIPPING_OPTIONS = [
  { id: "standard", label: "Standard Delivery", eta: "4–6 business days", price: "Free above ₹499 · ₹49 below" },
  { id: "express", label: "Express Delivery", eta: "1–2 business days", price: "₹50 above ₹499 · ₹99 below" },
];

export default function ShippingPage() {
  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <p className="muv-eyebrow mb-5">Shipping</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>
            Getting your order to you.
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-12">
            {SHIPPING_OPTIONS.map((opt) => (
              <div key={opt.id} className="muv-card">
                <span className="muv-icon-circle mb-4" style={{ width: 38, height: 38 }} aria-hidden>
                  {opt.id === "express" ? <Zap size={16} /> : <Truck size={16} />}
                </span>
                <p className="muv-text-solid font-display" style={{ fontWeight: 500, fontSize: "1.05rem" }}>{opt.label}</p>
                <p className="muv-text-meta text-sm mt-1.5">{opt.eta}</p>
                <p className="text-sm mt-2" style={{ color: "var(--lavender)" }}>{opt.price}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="flex items-start gap-3">
            <span className="muv-icon-circle flex-shrink-0" style={{ width: 38, height: 38 }} aria-hidden>
              <MapPin size={16} />
            </span>
            <div>
              <p className="muv-text-solid text-sm font-medium mb-1">Coverage</p>
              <p className="muv-text-meta text-sm" style={{ lineHeight: 1.7 }}>
                Delivery availability and exact timelines are confirmed by pincode at checkout, before you pay
                — you&rsquo;ll always know your delivery window before you commit.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.32}>
          <p className="muv-text-meta text-sm mt-10" style={{ lineHeight: 1.7 }}>
            Placed an order already? Track it from{" "}
            <a href="/account/orders" className="muv-footer-link muv-text-solid">
              your order history
            </a>
            , or{" "}
            <a href="/contact" className="muv-footer-link muv-text-solid">
              contact us
            </a>{" "}
            if anything looks off.
          </p>
        </Reveal>
      </div>
    </div>
  );
}
