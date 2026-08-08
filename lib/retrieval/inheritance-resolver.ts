import { prisma } from "@/lib/prisma";

/**
 * MUV Intelligence Factory V4 §2.3 — Category -> Product -> Variant
 * inheritance resolution. The one place this logic lives; every future
 * retrieval caller (Sprint 6/7's orchestration plan) calls this rather than
 * re-implementing the fallback order.
 *
 * Resolution order, exactly as specified — never merged, always exclusive:
 *   1. PUBLISHED ProductVariantIntelligenceVersion section, if present —
 *      used exclusively, never merged with product-level.
 *   2. Else PUBLISHED ProductIntelligenceVersion section.
 *   3. Else PUBLISHED CategoryIntelligenceVersion section, only if the
 *      section is category-eligible (a closed list — usage/ingredients/
 *      pricing must never silently inherit from a category).
 *   4. Else explicitly "no published intelligence" — never fabricated.
 */

export const CATEGORY_ELIGIBLE_SECTIONS = ["generalSafetyClass", "generalStorageClass", "generalCareGuidance"] as const;

export type InheritanceScope = "VARIANT" | "PRODUCT" | "CATEGORY" | "NONE";

export type ResolvedSection = {
  scope: InheritanceScope;
  value: unknown;
  sourceVersionId: string | null;
};

function readSection(sections: unknown, section: string): { present: boolean; value: unknown } {
  if (sections && typeof sections === "object" && !Array.isArray(sections)) {
    const record = sections as Record<string, unknown>;
    if (section in record && record[section] !== undefined && record[section] !== null) {
      return { present: true, value: record[section] };
    }
  }
  return { present: false, value: null };
}

export async function resolveInheritedSection(input: { productId: string; variantId?: string; section: string }): Promise<ResolvedSection> {
  // 1. Variant scope — exclusive if present.
  if (input.variantId) {
    const variantIntelligence = await prisma.productVariantIntelligence.findUnique({
      where: { variantId: input.variantId },
      include: { versions: { where: { status: "PUBLISHED" }, take: 1 } },
    });
    const publishedVariant = variantIntelligence?.versions[0];
    if (publishedVariant) {
      const result = readSection(publishedVariant.sections, input.section);
      if (result.present) return { scope: "VARIANT", value: result.value, sourceVersionId: publishedVariant.id };
    }
  }

  // 2. Product scope.
  const productIntelligence = await prisma.productIntelligence.findUnique({
    where: { productId: input.productId },
    include: { versions: { where: { status: "PUBLISHED" }, take: 1 } },
  });
  const publishedProduct = productIntelligence?.versions[0];
  if (publishedProduct) {
    const result = readSection(publishedProduct.sections, input.section);
    if (result.present) return { scope: "PRODUCT", value: result.value, sourceVersionId: publishedProduct.id };
  }

  // 3. Category scope — only for category-eligible sections.
  if ((CATEGORY_ELIGIBLE_SECTIONS as readonly string[]).includes(input.section)) {
    const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { categoryId: true } });
    if (product) {
      const categoryIntelligence = await prisma.categoryIntelligence.findUnique({
        where: { categoryId: product.categoryId },
        include: { versions: { where: { status: "PUBLISHED" }, take: 1 } },
      });
      const publishedCategory = categoryIntelligence?.versions[0];
      if (publishedCategory) {
        const result = readSection(publishedCategory.sections, input.section);
        if (result.present) return { scope: "CATEGORY", value: result.value, sourceVersionId: publishedCategory.id };
      }
    }
  }

  // 4. Nothing published anywhere in the chain — explicit, not fabricated.
  return { scope: "NONE", value: null, sourceVersionId: null };
}
