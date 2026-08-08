import { Layers, FileCheck, MessageSquareQuote, Truck, Wallet, Tag } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { TrustCard, type TrustCardProps } from "@/components/storefront/trust-card";

/**
 * Every claim below traces to something real and already shipped, per
 * PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md §7's Trust Philosophy ("every claim
 * traces to something real") — not aspirational marketing copy. If a claim
 * here stops being true (e.g. COD is removed as a payment option), it must
 * be edited or removed, not left standing.
 */
const TRUST_CARDS: TrustCardProps[] = [
  { icon: Layers, heading: "Five Categories, One Standard", description: "Home, Fabric, Body, Personal, and Car Care — held to the same standard of craft across every category, not just the ones that photograph well." },
  { icon: FileCheck, heading: "Real Compliance Detail", description: "HSN and GST detail shown on every product, not hidden until checkout — useful for consumer and institutional buyers alike." },
  { icon: MessageSquareQuote, heading: "Genuine Reviews Only", description: "Reviews are shown as they are, including neutral ones. Nothing is filtered to only-positive, and nothing is fabricated." },
  { icon: Truck, heading: "Real Delivery Timelines", description: "Standard delivery in 4–6 business days, or Express in 1–2 — shown before you pay, not revealed as a surprise afterward." },
  { icon: Wallet, heading: "Pay Your Way", description: "UPI, cards, net banking, or Cash on Delivery — choose what you're comfortable with, no account required to check out." },
  { icon: Tag, heading: "Transparent Pricing", description: "MRP and price shown side by side on every product. A discount is only ever shown when it's real." },
];

export function WhyChooseMuv() {
  return (
    <section className="muv-section-fade-top py-28 md:py-36 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center mb-16 md:mb-20">
          <Reveal>
            <p className="muv-featured-eyebrow mb-5">Why Choose Muv</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="font-display text-white mx-auto"
              style={{ fontWeight: 400, fontSize: "clamp(1.9rem,4vw,3rem)", lineHeight: 1.2, maxWidth: "18ch" }}
            >
              Six reasons, none of them adjectives.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="muv-text-body mx-auto mt-6" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.7, maxWidth: "540px" }}>
              Every claim below is something you can actually check — on the product page, at checkout, or in your order history.
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7">
          {TRUST_CARDS.map((card, i) => (
            <Reveal key={card.heading} delay={i * 0.06}>
              <TrustCard {...card} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
