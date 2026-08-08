/**
 * Turns a real admin-entered `benefits` field (one line per bullet, often
 * literally prefixed "•") into a short, punchy USP tag — prefers the first
 * line that's already 8 words or fewer over hard-truncating a longer one
 * mid-clause. Never invents copy; a product with no usable benefits text
 * just shows no USP line.
 *
 * Extracted (Phase 16) from five identical inline copies —
 * app/(storefront)/page.tsx, shop/page.tsx, products/[slug]/page.tsx,
 * cart/page.tsx, checkout/success/page.tsx all defined this exact function
 * locally. Behavior is unchanged.
 */
export function extractUSP(benefits: string | null | undefined): string | null {
  if (!benefits) return null;
  const lines = benefits
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.endsWith(":"));
  if (lines.length === 0) return null;

  const short = lines.find((l) => l.split(/\s+/).length <= 8);
  if (short) return short.replace(/[.]+$/, "");

  const words = lines[0]!.split(/\s+/).slice(0, 8);
  return words.join(" ").replace(/[.,;:]+$/, "");
}
