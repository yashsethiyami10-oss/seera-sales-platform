import { Reveal } from "@/components/ui/reveal";

/**
 * Parses the real `Product.directions` field into numbered steps — splits
 * on sentence-ending punctuation or newlines, whichever the admin actually
 * used. A single unstructured sentence just renders as one step, never
 * padded into fake multi-step instructions.
 */
function parseSteps(directions: string | null | undefined): string[] {
  if (!directions) return [];
  const byLine = directions.split("\n").map((l) => l.trim()).filter(Boolean);
  const source = byLine.length > 1 ? byLine : directions.split(/(?<=[.!])\s+/).map((s) => s.trim()).filter(Boolean);
  return source.map((s) => s.replace(/^[•\-*\d.)\s]+/, "").trim()).filter(Boolean);
}

export function ProductHowToUse({ directions }: { directions: string | null | undefined }) {
  const steps = parseSteps(directions);
  if (steps.length === 0) return null;

  return (
    <section className="mt-20 max-w-2xl">
      <Reveal>
        <p className="muv-eyebrow mb-3">How To Use</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Getting the most out of it</h2>
      </Reveal>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <Reveal key={i} delay={i * 0.06}>
            <li className="flex items-start gap-4">
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-full muv-text-solid text-xs font-medium"
                style={{ width: 26, height: 26, border: "1px solid var(--card-border)", background: "rgba(183,171,240,0.1)" }}
                aria-hidden
              >
                {i + 1}
              </span>
              <p className="muv-text-body text-sm mt-0.5" style={{ lineHeight: 1.7 }}>{step}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
