import { Reveal } from "@/components/ui/reveal";
import { FeaturedProducts, type FeaturedProduct } from "@/components/storefront/featured-products";

type Rail = { eyebrow: string; title: string; products: FeaturedProduct[] };

/**
 * Phase 14A — presentational only, all data/personalization decisions made
 * server-side in app/(storefront)/page.tsx (which rail to show, guest vs
 * logged-in default) so this stays a plain, reusable "row of real products"
 * renderer, same responsibility split the rest of the homepage already uses.
 */
export function PersonalizedSection({ rails, wishlistedIds }: { rails: Rail[]; wishlistedIds: string[] }) {
  const visible = rails.filter((r) => r.products.length > 0);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((rail) => (
        <section key={rail.title} className="py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col items-center text-center mb-14">
              <Reveal>
                <p className="muv-eyebrow mb-4">{rail.eyebrow}</p>
              </Reveal>
              <Reveal delay={0.06}>
                <h2 className="font-display text-white" style={{ fontWeight: 400, fontSize: "clamp(1.7rem,3.4vw,2.4rem)" }}>{rail.title}</h2>
              </Reveal>
            </div>
            <FeaturedProducts products={rail.products} wishlistedIds={wishlistedIds} />
          </div>
        </section>
      ))}
    </>
  );
}
