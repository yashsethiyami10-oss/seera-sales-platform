/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Read-only source fetchers. Every function here performs exactly one
 * Prisma read and returns plain data — no writes, ever. This is the only
 * file in `lib/knowledge-reconciliation/` that touches the database.
 */

import { prisma } from "@/lib/prisma";

export type SourceProduct = Awaited<ReturnType<typeof fetchAllProducts>>[number];

export async function fetchAllProducts() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    include: {
      category: { select: { name: true, slug: true } },
      content: true,
      variants: { orderBy: { price: "asc" }, include: { inventory: { select: { quantity: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function fetchPublishedKnowledgeRecords() {
  return prisma.publishedKnowledgeRecord.findMany({
    orderBy: { koid: "asc" },
  });
}

export type SourcePublishedKnowledgeRecord = Awaited<ReturnType<typeof fetchPublishedKnowledgeRecords>>[number];

export async function fetchSourceCounts() {
  const [productCount, variantCount, productContentCount, publishedKnowledgeRecordCount] = await Promise.all([
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.productVariant.count(),
    prisma.productContent.count(),
    prisma.publishedKnowledgeRecord.count(),
  ]);
  return { productCount, variantCount, productContentCount, publishedKnowledgeRecordCount };
}

/** Existing rows in the four intelligence tables — always empty today
 * (Block 1/2C baseline), read here only so the identity/diff logic
 * (Phase 14) has a real, if currently-empty, comparison set, and so it
 * keeps working unchanged once a future, separately-approved write step
 * populates these tables. */
export async function fetchExistingIntelligenceKeys() {
  const [knowledgeItems, productIntelligence, problemIntelligence, careIntelligence] = await Promise.all([
    prisma.knowledgeItem.findMany({ select: { id: true, slug: true } }),
    prisma.productIntelligence.findMany({ select: { id: true, productId: true } }),
    prisma.problemIntelligence.findMany({ select: { id: true, slug: true } }),
    prisma.careIntelligence.findMany({ select: { id: true, slug: true } }),
  ]);
  return { knowledgeItems, productIntelligence, problemIntelligence, careIntelligence };
}
