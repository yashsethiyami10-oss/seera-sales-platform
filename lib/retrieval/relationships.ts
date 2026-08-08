import { prisma } from "@/lib/prisma";
import { allowedLayers } from "./permissions";
import type { CallerClearance, KnowledgeSourceType, SourceReference } from "./types";

/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) cross-module
 * relationship resolution. Returns structured references only (type + id
 * + optional label) — never the referenced record's full content, per
 * "the resolver must return structured references... never duplicate
 * content."
 *
 * Of the 9 required pairs, 7 already have a real foreign key or relation
 * table from Modules 2–4 (PIF↔Product, PrIF↔Product, CIF↔Product,
 * PIF↔PrIF, PIF↔CIF, PrIF↔CIF, Knowledge↔CIF) and are resolved with
 * `linkKind: "direct"`. The remaining two — Knowledge↔PIF and
 * Knowledge↔PrIF — have no direct relation in the schema (adding one
 * would mean a new column on Module 1/2/3's own models, which "do NOT
 * redesign previous modules" rules out for this module). They're instead
 * resolved *transitively*, through the `Product` both sides already
 * reference independently, and returned with `linkKind: "via-product"` so
 * a caller can tell the difference — no new schema, no duplicated data,
 * still a real, honest answer to "what relates to this."
 */
export async function resolveRelationships(sourceType: KnowledgeSourceType, recordId: string, clearance: CallerClearance): Promise<SourceReference[]> {
  const layers = allowedLayers(clearance);
  const refs: SourceReference[] = [];

  let productIds: string[] = [];
  const directPifIds = new Set<string>();
  const directPrifIds = new Set<string>();
  const directKnowledgeIds = new Set<string>();

  if (sourceType === "KNOWLEDGE") {
    const item = await prisma.knowledgeItem.findUnique({ where: { id: recordId }, select: { productId: true } });
    if (item?.productId) productIds = [item.productId];
  } else if (sourceType === "PRODUCT_INTELLIGENCE") {
    const item = await prisma.productIntelligence.findUnique({ where: { id: recordId }, select: { productId: true } });
    if (item?.productId) productIds = [item.productId];
  } else if (sourceType === "PROBLEM_INTELLIGENCE") {
    const version = await prisma.problemIntelligenceVersion.findFirst({
      where: { problemIntelligenceId: recordId, status: "PUBLISHED" },
      select: { productRelationships: { select: { productId: true, productIntelligenceId: true } } },
    });
    productIds = version?.productRelationships.map((r) => r.productId) ?? [];
    for (const r of version?.productRelationships ?? []) if (r.productIntelligenceId) directPifIds.add(r.productIntelligenceId);
  } else if (sourceType === "CARE_INTELLIGENCE") {
    const version = await prisma.careIntelligenceVersion.findFirst({
      where: { careIntelligenceId: recordId, status: "PUBLISHED" },
      select: {
        relatedProducts: { select: { id: true } },
        relatedProductIntelligence: { select: { id: true } },
        relatedProblemIntelligence: { select: { id: true } },
        relatedKnowledgeItems: { select: { id: true } },
      },
    });
    productIds = version?.relatedProducts.map((p) => p.id) ?? [];
    for (const p of version?.relatedProductIntelligence ?? []) directPifIds.add(p.id);
    for (const p of version?.relatedProblemIntelligence ?? []) directPrifIds.add(p.id);
    for (const k of version?.relatedKnowledgeItems ?? []) directKnowledgeIds.add(k.id);
  }

  for (const id of productIds) refs.push({ type: "PRODUCT", id, linkKind: "direct" });
  for (const id of directPifIds) refs.push({ type: "PRODUCT_INTELLIGENCE", id, linkKind: "direct" });
  for (const id of directPrifIds) refs.push({ type: "PROBLEM_INTELLIGENCE", id, linkKind: "direct" });
  for (const id of directKnowledgeIds) refs.push({ type: "KNOWLEDGE", id, linkKind: "direct" });

  // Transitive, via-Product resolution — the two pairs with no direct relation.
  if (productIds.length && sourceType !== "KNOWLEDGE") {
    const related = await prisma.knowledgeItem.findMany({ where: { productId: { in: productIds }, layer: { in: layers } }, select: { id: true } });
    for (const r of related) refs.push({ type: "KNOWLEDGE", id: r.id, linkKind: "via-product" });
  }
  if (productIds.length && sourceType !== "PRODUCT_INTELLIGENCE") {
    const related = await prisma.productIntelligence.findMany({ where: { productId: { in: productIds }, layer: { in: layers } }, select: { id: true } });
    for (const r of related) if (!directPifIds.has(r.id)) refs.push({ type: "PRODUCT_INTELLIGENCE", id: r.id, linkKind: "via-product" });
  }
  if (productIds.length && sourceType !== "PROBLEM_INTELLIGENCE") {
    const related = await prisma.problemIntelligence.findMany({
      where: { layer: { in: layers }, versions: { some: { productRelationships: { some: { productId: { in: productIds } } } } } },
      select: { id: true },
    });
    for (const r of related) if (!directPrifIds.has(r.id)) refs.push({ type: "PROBLEM_INTELLIGENCE", id: r.id, linkKind: "via-product" });
  }
  if (productIds.length && sourceType !== "CARE_INTELLIGENCE") {
    const related = await prisma.careIntelligence.findMany({
      where: { layer: { in: layers }, versions: { some: { relatedProducts: { some: { id: { in: productIds } } } } } },
      select: { id: true },
    });
    for (const r of related) refs.push({ type: "CARE_INTELLIGENCE", id: r.id, linkKind: "via-product" });
  }

  // Reverse direct lookups — CIF items that explicitly reference this record.
  if (sourceType !== "CARE_INTELLIGENCE") {
    let related: { id: string }[] = [];
    if (sourceType === "KNOWLEDGE") {
      related = await prisma.careIntelligence.findMany({ where: { layer: { in: layers }, versions: { some: { relatedKnowledgeItems: { some: { id: recordId } } } } }, select: { id: true } });
    } else if (sourceType === "PRODUCT_INTELLIGENCE") {
      related = await prisma.careIntelligence.findMany({ where: { layer: { in: layers }, versions: { some: { relatedProductIntelligence: { some: { id: recordId } } } } }, select: { id: true } });
    } else if (sourceType === "PROBLEM_INTELLIGENCE") {
      related = await prisma.careIntelligence.findMany({ where: { layer: { in: layers }, versions: { some: { relatedProblemIntelligence: { some: { id: recordId } } } } }, select: { id: true } });
    }
    for (const r of related) refs.push({ type: "CARE_INTELLIGENCE", id: r.id, linkKind: "direct" });
  }

  // De-duplicate (type+id), preferring "direct" over "via-product" if a
  // reference was found by more than one path.
  const deduped = new Map<string, SourceReference>();
  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`;
    const existing = deduped.get(key);
    if (!existing || (existing.linkKind === "via-product" && ref.linkKind === "direct")) deduped.set(key, ref);
  }
  return Array.from(deduped.values());
}
