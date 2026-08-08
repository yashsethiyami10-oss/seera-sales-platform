import { Reveal } from "@/components/ui/reveal";

/**
 * Parses `content.productHighlights` (Production Customer Content Layer),
 * one bullet per line — same convention as ProductBenefits'
 * `content.keyBenefits`. Renders nothing when no Founder-approved
 * highlights exist for this product yet.
 */
function parseHighlights(highlights: string | null | undefined): string[] {
  if (!highlights) return [];
  return highlights
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

export function ProductHighlights({ highlights }: { highlights: string | null | undefined }) {
  const lines = parseHighlights(highlights);
  if (lines.length === 0) return null;

  return (
    <section className="mt-20 max-w-2xl">
      <Reveal>
        <p className="muv-eyebrow mb-3">Highlights</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>At a Glance</h2>
      </Reveal>
      <ul className="space-y-2.5">
        {lines.map((line, i) => (
          <Reveal key={line} delay={i * 0.04}>
            <li className="muv-text-body text-sm flex items-start gap-3" style={{ lineHeight: 1.7 }}>
              <span aria-hidden style={{ color: "var(--lavender)" }}>•</span>
              {line}
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
