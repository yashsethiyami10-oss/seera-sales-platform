import { Reveal } from "@/components/ui/reveal";

type Spec = { label: string; value: string };

/**
 * Only real fields are shown. "Shelf Life" is deliberately omitted — no
 * such field exists anywhere in the schema (checked prisma/schema.prisma),
 * and a specification table is exactly the wrong place to guess at a
 * number. "Country of Origin" is the one spec not read from a per-product
 * field — "India" is a real, brand-wide fact (PHASE_3 §1's "an affordable
 * luxury from India"), true for every MUV product, not a per-product guess.
 */
export function ProductSpecs({
  categoryName,
  variantSize,
  weight,
  fragranceNotes,
  brand,
}: {
  categoryName: string;
  variantSize?: string;
  weight?: string | null;
  fragranceNotes?: string | null;
  brand: string;
}) {
  const specs: Spec[] = [
    { label: "Category", value: categoryName },
    ...(variantSize ? [{ label: "Variant", value: variantSize }] : []),
    ...(weight ? [{ label: "Volume / Weight", value: weight }] : []),
    ...(fragranceNotes ? [{ label: "Fragrance", value: fragranceNotes }] : []),
    { label: "Manufacturer", value: brand },
    { label: "Country of Origin", value: "India" },
  ];

  return (
    <section className="mt-20 max-w-2xl">
      <Reveal>
        <p className="muv-eyebrow mb-3">Specifications</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-6" style={{ fontWeight: 400, fontSize: "1.6rem" }}>Product Specifications</h2>
      </Reveal>
      <Reveal delay={0.12}>
        <div className="muv-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="w-full text-sm">
            <tbody>
              {specs.map((s, i) => (
                <tr key={s.label} style={{ borderTop: i === 0 ? "none" : "1px solid var(--hairline)" }}>
                  <th scope="row" className="muv-text-meta text-left font-normal" style={{ padding: "12px 20px", width: "40%" }}>{s.label}</th>
                  <td className="muv-text-solid" style={{ padding: "12px 20px" }}>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </section>
  );
}
