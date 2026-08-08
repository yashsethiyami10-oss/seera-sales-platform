import { Reveal } from "@/components/ui/reveal";

/**
 * "Why this product is different" — elevated presentation of the product's
 * own real `fullDescription`, not new invented marketing copy. There is no
 * per-product storytelling field beyond what's already on the product
 * record, and Phase 3's Honesty principle rules out writing a new claim
 * this component has no source for. Same real text the page already
 * rendered as a plain paragraph, given the typographic weight the brief
 * asks for instead.
 */
export function ProductWhyChoose({ fullDescription, categoryName }: { fullDescription: string | null | undefined; categoryName: string }) {
  if (!fullDescription) return null;

  return (
    <section className="mt-20 flex justify-center">
      <div className="text-center" style={{ maxWidth: "60ch" }}>
        <Reveal>
          <p className="muv-eyebrow mb-5">Why This {categoryName} Product</p>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.3rem,2.4vw,1.7rem)", lineHeight: 1.6 }}>
            {fullDescription}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
