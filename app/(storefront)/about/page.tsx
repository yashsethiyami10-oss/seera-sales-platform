import { Reveal } from "@/components/ui/reveal";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Our Story",
  description: "Why Muv exists — an affordable luxury from India, across Home, Fabric, Body, Personal, and Car Care.",
  path: "/about",
});

/**
 * Copy sourced directly from PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md §1 (the
 * frozen brand soul document) — condensed per §6's writing rules, not
 * invented for this page. Same treatment as the homepage's Brand Story
 * section (components/storefront/brand-story.tsx).
 */
export default function AboutPage() {
  return (
    <div className="px-6" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="max-w-7xl mx-auto flex justify-center">
        <div style={{ maxWidth: "62ch" }}>
          <Reveal>
            <p className="muv-eyebrow mb-5">Our Story</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(2rem,4.4vw,3.2rem)", lineHeight: 1.15 }}>
              Maintenance is not beneath care.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="muv-text-body mt-8" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.8 }}>
              Nobody dreams about detergent the way they dream about a fragrance. Every category Muv touches
              — home, fabric, body, personal, car — is something people buy out of necessity, not desire.
              Muv exists because we believe the unglamorous, repetitive, necessary parts of a life still
              deserve craftsmanship. The five minutes someone spends wiping down a counter, washing a shirt,
              or cleaning a car doesn&rsquo;t have to feel like a tax on their day. It can feel like a small,
              considered act of care for the things and people they&rsquo;re responsible for.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <p className="muv-text-body mt-6" style={{ fontWeight: 300, fontSize: "16px", lineHeight: 1.8 }}>
              We&rsquo;re quietly confident, not loud. Muv doesn&rsquo;t need to shout to be believed, and
              doesn&rsquo;t borrow foreign luxury signifiers to be taken seriously — an affordable luxury
              from India is a statement of confidence, not an apology or a compromise.
            </p>
          </Reveal>

          <Reveal delay={0.32}>
            <div className="mt-10">
              <p className="muv-text-solid text-sm font-medium mb-3">What Keep Muving&trade; means</p>
              <ul className="space-y-3">
                <li className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>
                  <span style={{ color: "var(--lavender)" }}>Literal</span> — the physical motion of care: wiping, washing, cleaning, maintaining.
                </li>
                <li className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>
                  <span style={{ color: "var(--lavender)" }}>Metaphorical</span> — forward momentum as a way of life. Nothing in the Muv experience should leave you standing still, confused, or stuck.
                </li>
                <li className="muv-text-body text-sm" style={{ lineHeight: 1.7 }}>
                  <span style={{ color: "var(--lavender)" }}>Emotional</span> — momentum as the antidote to drudgery. Each small task is evidence that a life is moving forward, not stuck in a loop.
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
