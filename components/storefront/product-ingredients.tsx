import { Droplet } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

/**
 * Real `Product.ingredients` free text, tokenized on commas/newlines into
 * individual cards — same pattern as the fragrance-notes filter in
 * ProductGrid. CMS-ready: if this ever becomes a structured list at the
 * admin level, this component's rendering doesn't need to change, only the
 * parsing step would simplify.
 */
function parseIngredients(ingredients: string | null | undefined): string[] {
  if (!ingredients) return [];
  return ingredients
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

export function ProductIngredients({ ingredients }: { ingredients: string | null | undefined }) {
  const items = parseIngredients(ingredients);
  if (items.length === 0) return null;

  return (
    <section className="mt-20">
      <Reveal>
        <p className="muv-eyebrow mb-3">Ingredients</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Key Actives</h2>
      </Reveal>
      <div className="flex flex-wrap gap-3">
        {items.map((item, i) => (
          <Reveal key={item} delay={i * 0.03}>
            <div className="muv-card flex items-center gap-2.5" style={{ padding: "12px 18px" }}>
              <Droplet size={14} strokeWidth={1.4} style={{ color: "var(--lavender)" }} aria-hidden />
              <span className="muv-text-solid text-sm">{item}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
