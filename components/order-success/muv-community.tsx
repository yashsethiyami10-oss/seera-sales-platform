import { Reveal } from "@/components/ui/reveal";

/**
 * Copy drawn from PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md §1 (the frozen brand
 * soul), same treatment as components/storefront/brand-story.tsx — not
 * invented for this page. "MUV Ritual™" is named here as a future concept
 * per this phase's own brief (Future-Ready Architecture's extension-point
 * list) — mentioned, not built; no functionality implied.
 */
export function MuvCommunity() {
  return (
    <section className="mt-16 flex justify-center">
      <div className="text-center" style={{ maxWidth: "58ch" }}>
        <Reveal><p className="muv-eyebrow mb-5">Welcome to the Movement</p></Reveal>
        <Reveal delay={0.08}>
          <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.4rem,2.6vw,1.9rem)", lineHeight: 1.5 }}>
            Keep Muving&trade;
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="muv-text-body mt-5" style={{ fontWeight: 300, fontSize: "15px", lineHeight: 1.8 }}>
            This order is one small, considered act of care — for your home, your family, yourself. An
            affordable luxury from India, held to one standard across every category. Forward momentum,
            not a chore. That's the whole idea.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <p className="muv-text-faint text-xs mt-6">
            A more connected Muv Ritual&trade; experience is on the way.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
