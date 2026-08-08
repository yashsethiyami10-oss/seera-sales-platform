import { Reveal } from "@/components/ui/reveal";
import { buildMetadata, buildBreadcrumbSchema, buildFAQSchema } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "FAQs",
  description: "Common questions about ordering, payment, delivery, and returns at Muv.",
  path: "/faq",
});

/**
 * Every answer here is built only from real, already-implemented behavior
 * (payment methods, shipping timelines reused from /shipping, account
 * flows, and the return/replacement policy on /returns) — no invented
 * policy specifics.
 */
const FAQS = [
  {
    q: "What payment methods do you accept?",
    a: "UPI, cards, net banking, or Cash on Delivery — you don't need an account to check out, though creating one makes reordering faster.",
  },
  {
    q: "How long does delivery take?",
    a: "Standard delivery is 4–6 business days — free above ₹499, ₹49 below it. Express delivery is 1–2 business days — ₹50 above ₹499, ₹99 below it. Exact availability is confirmed by pincode at checkout, before you pay.",
  },
  {
    q: "Do you deliver to my area?",
    a: "Enter your pincode at checkout and we'll confirm serviceability and delivery timeline before you commit to anything.",
  },
  {
    q: "How do I track my order?",
    a: "Sign in and visit your order history to see the current status of every order you've placed.",
  },
  {
    q: "My order arrived damaged, leaked, or wrong — what now?",
    a: "Report it within 48 hours of delivery — open the order in your order history and use \"Report an Issue / Request Replacement\" with a photo or video. Used/consumed products and change-of-mind requests aren't eligible. See our Returns page for full details.",
  },
  {
    q: "Do you supply hotels, hospitals, restaurants, or other businesses?",
    a: "Yes — Muv supplies hotels, hospitals, restaurants, offices, car washes, and laundry operations in bulk. Fill out the enquiry form on our Contact page and our business team will follow up.",
  },
  {
    q: "Are your reviews genuine?",
    a: "Yes. Reviews are shown as submitted, including neutral ones — never filtered to only-positive, never fabricated.",
  },
];

export default function FaqPage() {
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "FAQs", path: "/faq" },
  ]);
  const faqSchema = buildFAQSchema(FAQS.map((f) => ({ q: f.q, a: f.a })));

  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <p className="muv-eyebrow mb-5">FAQs</p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display text-white mb-10" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3rem)" }}>
            Frequently asked questions.
          </h1>
        </Reveal>

        <div className="space-y-4">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.04}>
              <details className="muv-card group">
                <summary className="muv-text-solid text-sm font-medium cursor-pointer list-none flex items-center justify-between gap-4">
                  {item.q}
                  <span className="muv-text-faint flex-shrink-0 transition-transform group-open:rotate-45" aria-hidden style={{ fontSize: 18 }}>
                    +
                  </span>
                </summary>
                <p className="muv-text-meta text-sm mt-3" style={{ lineHeight: 1.7 }}>
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>

        <p className="muv-text-meta text-sm mt-10">
          Didn&rsquo;t find your answer?{" "}
          <a href="/contact" className="muv-footer-link muv-text-solid">
            Contact us
          </a>
          .
        </p>
      </div>
    </div>
  );
}
