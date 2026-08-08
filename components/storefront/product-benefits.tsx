import { Sparkles, Droplet, Leaf, ShieldCheck, Star, Wind } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { TrustCard } from "@/components/storefront/trust-card";

const ICONS = [Sparkles, Droplet, Leaf, ShieldCheck, Star, Wind];

/**
 * Parses the real, admin-entered `Product.benefits` field (one line per
 * bullet, per the same convention already relied on by
 * app/(storefront)/page.tsx's extractUSP) into icon cards. Icons rotate
 * generically rather than being semantically matched per bullet — the text
 * itself is the real claim; the icon only supports it, never substitutes
 * for it (PHASE_5 §8). A product with no benefits text renders nothing.
 */
function parseBenefits(benefits: string | null | undefined): string[] {
  if (!benefits) return [];
  return benefits
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

export function ProductBenefits({ benefits }: { benefits: string | null | undefined }) {
  const lines = parseBenefits(benefits);
  if (lines.length === 0) return null;

  return (
    <section className="mt-20">
      <Reveal>
        <p className="muv-eyebrow mb-3">Benefits</p>
      </Reveal>
      <Reveal delay={0.06}>
        <h2 className="font-display text-white mb-8" style={{ fontWeight: 400, fontSize: "1.6rem" }}>What this does for you</h2>
      </Reveal>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {lines.map((line, i) => (
          <Reveal key={line} delay={i * 0.05}>
            <TrustCard icon={ICONS[i % ICONS.length]!} heading={line} description="" />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
