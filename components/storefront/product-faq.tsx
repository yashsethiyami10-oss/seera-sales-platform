import { Reveal } from "@/components/ui/reveal";

/**
 * Same <details>/<summary> accordion pattern already built for app/(storefront)/faq
 * — reused, not redesigned. Generic content is real, general purchase-relevant
 * information (payment, delivery, returns) already established on /faq,
 * /shipping, and /returns — not fabricated per-product claims about
 * ingredients or safety this component has no data to back.
 *
 * Product-specific entries (Production Customer Content Layer, `content.faq`)
 * are rendered first when present — each one Founder-approved/sourced per
 * product, not authored here.
 */
const PDP_FAQS = [
  { q: "How long does delivery take?", a: "Standard delivery is 4–6 business days — free above ₹499, ₹49 below it. Express delivery is 1–2 business days — ₹50 above ₹499, ₹99 below it. Availability is confirmed by pincode at checkout." },
  { q: "What payment methods are accepted?", a: "UPI, cards, net banking, or Cash on Delivery — no account required to check out." },
  { q: "What if this arrives damaged, leaked, or wrong?", a: "Report it within 48 hours of delivery from your order history, with a photo or video — we'll verify and sort out a replacement or refund. See our Returns page for full details." },
  { q: "Is this available for bulk or business orders?", a: "Yes — fill out the enquiry form on our Contact page for volume pricing." },
];

type ProductFaqEntry = { question: string; answer: string };

export function ProductFAQ({ productFaqs }: { productFaqs?: ProductFaqEntry[] | null }) {
  const productItems = (productFaqs ?? []).map((f) => ({ q: f.question, a: f.answer }));
  const items = [...productItems, ...PDP_FAQS];

  return (
    <section className="mt-20 max-w-2xl">
      <Reveal>
        <p className="muv-eyebrow mb-3">FAQ</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Common Questions</h2>
      </Reveal>
      <div className="space-y-3">
        {items.map((item, i) => (
          <Reveal key={item.q} delay={i * 0.04}>
            <details className="muv-card group">
              <summary className="muv-text-solid text-sm font-medium cursor-pointer list-none flex items-center justify-between gap-4">
                {item.q}
                <span className="muv-text-faint flex-shrink-0 transition-transform group-open:rotate-45" aria-hidden style={{ fontSize: 18 }}>+</span>
              </summary>
              <p className="muv-text-meta text-sm mt-3" style={{ lineHeight: 1.7 }}>{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
