import { prisma } from "@/lib/prisma";
import { queryDbKnowledge } from "./db-source";
import { ALL_KF_DOMAINS, queryKnowledgeFactory } from "./kf-source";
import { fetchLiveAvailability } from "./availability-source";
import { authorizeKfResults, resolveKnowledgeCallerClearance } from "./authorization";
import { buildKnowledgeResponse, emptyResponse, fromDbResult, fromKfResult, invalidQueryResponse } from "./normalize";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./constants";
import type { KnowledgeApiResponse, KnowledgeApiResult } from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 3) — the Knowledge API.
 *
 * "The MUV Knowledge Library™ remains the single source of truth": every
 * function below reads only from one of three already-real, already-
 * governed sources —
 *   1. Module 5's DB-backed Knowledge Retrieval Core (`db-source.ts`) —
 *      KnowledgeItem / ProductIntelligence / ProblemIntelligence /
 *      CareIntelligence, with Module 5's own permission/layer filtering
 *      and deterministic ranking untouched.
 *   2. Stage 6D's file-backed MUV Knowledge Factory index (`kf-source.ts`)
 *      — the real 1,187 Knowledge Objects across the 5 completed
 *      Factories (Product/Marketing/Institutional Sales/Founder
 *      Intelligence/Customer Care) on disk under `docs/*-knowledge-factory/`.
 *   3. The live product catalog (`availability-source.ts`), for
 *      commercial facts only, per FR-001.
 * Nothing here ever calls out to the open web, an LLM, or any external
 * service — "provider-agnostic" and "do not mix external web knowledge"
 * both hold structurally, not by convention.
 *
 * NOT wired into the live turn path: `lib/experience/experience-
 * orchestrator.ts` does not import this file, and this module does not
 * import anything from `lib/gateway/providers/` — "preserve current
 * behavior... until a later module explicitly enables knowledge-grounded
 * generation" and "the Provider Adapter remains separate and must not be
 * invoked by this module" both hold by construction, not by a runtime
 * flag check. `lib/gateway/ai-gateway.ts` exposes this API the same way
 * it exposes the Provider Adapter (Module 2) — available, tested,
 * unused by `runAiGatewayTurn` today.
 *
 * Phase 5.2.1 (Foundation Stabilization) — every function that queries
 * the Knowledge Factory now resolves the caller's real clearance
 * (`resolveKnowledgeCallerClearance()`) and passes raw results through
 * `authorizeKfResults()` (see `authorization.ts`) before they can appear
 * in any response. This is the ONE place that filtering happens — a
 * caller of this API never receives an unapproved or over-privileged
 * result and never has to filter anything itself. The DB-backed half
 * (`db-source.ts`) already enforced this via Module 5's own pipeline;
 * this closes the gap that existed only on the Knowledge-Factory half.
 */

function clampLimit(limit?: number): number {
  return Math.max(1, Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT));
}

function nonEmptyKeywords(keywords: string | undefined | null): string | undefined {
  const trimmed = keywords?.trim();
  return trimmed ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// 1. General search — across every DB-backed and Knowledge-Factory source.
// ---------------------------------------------------------------------------

export async function searchKnowledge(query: string, opts: { limit?: number } = {}): Promise<KnowledgeApiResponse> {
  const keywords = nonEmptyKeywords(query);
  if (!keywords) return invalidQueryResponse("A non-empty search query is required.");
  const limit = clampLimit(opts.limit);

  const [dbResults, clearance, rawKfResults] = await Promise.all([
    queryDbKnowledge("gateway.knowledge.search", ["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE"], { keywords, limit: MAX_LIMIT }),
    resolveKnowledgeCallerClearance(),
    Promise.resolve(queryKnowledgeFactory(ALL_KF_DOMAINS, keywords, undefined, MAX_LIMIT)),
  ]);
  const kfResults = authorizeKfResults(rawKfResults, clearance);

  const normalized: KnowledgeApiResult[] = [
    ...dbResults.map((r) => fromDbResult(r, "GENERAL_KNOWLEDGE")),
    ...kfResults.map((r) => fromKfResult(r, "GENERAL_KNOWLEDGE")),
  ];
  return buildKnowledgeResponse(normalized, limit);
}

// ---------------------------------------------------------------------------
// 2. Fetch by ID — tries Module 5's DB sources first, then a Knowledge
//    Factory KOID lookup. A caller never needs to know which repository a
//    given ID belongs to.
// ---------------------------------------------------------------------------

export async function fetchKnowledgeById(sourceId: string): Promise<KnowledgeApiResponse> {
  const id = sourceId?.trim();
  if (!id) return invalidQueryResponse("A non-empty source ID is required.");

  const dbResults = await queryDbKnowledge("gateway.knowledge.fetchById", ["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE"], { knowledgeId: id, limit: 4 });
  if (dbResults.length) return buildKnowledgeResponse(dbResults.map((r) => fromDbResult(r, "GENERAL_KNOWLEDGE")), 4);

  const clearance = await resolveKnowledgeCallerClearance();
  const rawKfResults = queryKnowledgeFactory(ALL_KF_DOMAINS, undefined, id, 1);
  // Deliberately no distinction between "doesn't exist" and "exists but
  // not authorized for you" — both fall through to the same EMPTY
  // outcome, so a caller can never learn a CONFIDENTIAL/INTERNAL KOID is
  // real just by probing IDs.
  const kfResults = authorizeKfResults(rawKfResults, clearance);
  if (kfResults.length === 0) return emptyResponse(`No knowledge record found for ID "${id}" in any approved source.`);
  return buildKnowledgeResponse(kfResults.map((r) => fromKfResult(r, "GENERAL_KNOWLEDGE")), 1);
}

// ---------------------------------------------------------------------------
// 3. Fetch by product/category.
// ---------------------------------------------------------------------------

export async function fetchByProductOrCategory(
  params: { productId?: string; categoryId?: string; keywords?: string },
  opts: { limit?: number } = {}
): Promise<KnowledgeApiResponse> {
  const { productId, categoryId } = params;
  if (!productId && !categoryId) return invalidQueryResponse("Either productId or categoryId is required.");
  const limit = clampLimit(opts.limit);

  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) return emptyResponse(`No product found for productId "${productId}" — no knowledge can be linked to an unknown product.`);
  }

  let categoryName: string | null = null;
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
    if (!category) return emptyResponse(`No category found for categoryId "${categoryId}".`);
    categoryName = category.name;
  }

  const dbResults = productId
    ? await queryDbKnowledge("gateway.knowledge.byProduct", ["KNOWLEDGE", "PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE"], {
        productId,
        keywords: nonEmptyKeywords(params.keywords),
        limit: MAX_LIMIT,
      })
    : [];

  const clearance = await resolveKnowledgeCallerClearance();
  const kfResults = categoryName ? authorizeKfResults(queryKnowledgeFactory(["PRODUCT_KF"], categoryName, undefined, MAX_LIMIT), clearance) : [];

  const normalized: KnowledgeApiResult[] = [
    ...dbResults.map((r) => fromDbResult(r, "PRODUCT_KNOWLEDGE")),
    ...kfResults.map((r) => fromKfResult(r, "PRODUCT_KNOWLEDGE")),
  ];
  return buildKnowledgeResponse(normalized, limit);
}

// ---------------------------------------------------------------------------
// 4. Policies.
// ---------------------------------------------------------------------------

export async function fetchPolicies(keywords?: string, opts: { limit?: number } = {}): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  const q = nonEmptyKeywords(keywords) ?? "policy shipping returns privacy terms delivery";
  const clearance = await resolveKnowledgeCallerClearance();
  const kfResults = authorizeKfResults(queryKnowledgeFactory(["MARKETING_KF", "CUSTOMER_CARE_KF"], q, undefined, MAX_LIMIT), clearance);
  return buildKnowledgeResponse(kfResults.map((r) => fromKfResult(r, "POLICY")), limit);
}

// ---------------------------------------------------------------------------
// 5. FAQs.
// ---------------------------------------------------------------------------

export async function fetchFaqs(keywords?: string, opts: { limit?: number } = {}): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  const q = nonEmptyKeywords(keywords) ?? "frequently asked question faq";
  const clearance = await resolveKnowledgeCallerClearance();
  const kfResults = authorizeKfResults(queryKnowledgeFactory(["CUSTOMER_CARE_KF", "PRODUCT_KF"], q, undefined, MAX_LIMIT), clearance);
  return buildKnowledgeResponse(kfResults.map((r) => fromKfResult(r, "FAQ")), limit);
}

// ---------------------------------------------------------------------------
// 6. Safety guidance — the real product record's own `safety` field
//    (live, verified, highest confidence) plus Module 5's Problem
//    Intelligence and the Product Knowledge Factory's safety content.
// ---------------------------------------------------------------------------

export async function fetchSafetyGuidance(
  params: { productId?: string; keywords?: string } = {},
  opts: { limit?: number } = {}
): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  const results: KnowledgeApiResult[] = [];

  if (params.productId) {
    const product = await prisma.product.findUnique({ where: { id: params.productId }, select: { id: true, name: true, safety: true } });
    if (!product) return emptyResponse(`No product found for productId "${params.productId}".`);
    if (product.safety) {
      results.push({
        sourceId: product.id,
        sourceType: "SAFETY",
        title: `${product.name} — Safety Information`,
        content: product.safety,
        confidence: 100,
        relevanceScore: 100,
        productId: product.id,
        categoryId: null,
        freshness: { versionNumber: null, status: "PUBLISHED", retrievedAt: new Date().toISOString() },
        governance: { layer: "LIVE", approvalTier: null, isGapRecord: false, escalationRequired: false },
      });
    }
  }

  const dbResults = await queryDbKnowledge("gateway.knowledge.safety", ["PROBLEM_INTELLIGENCE"], {
    productId: params.productId,
    keywords: nonEmptyKeywords(params.keywords),
    limit: MAX_LIMIT,
  });
  results.push(...dbResults.map((r) => fromDbResult(r, "SAFETY")));

  const clearance = await resolveKnowledgeCallerClearance();
  const kfResults = authorizeKfResults(
    queryKnowledgeFactory(["PRODUCT_KF"], nonEmptyKeywords(params.keywords) ?? "safety", undefined, MAX_LIMIT),
    clearance
  );
  results.push(...kfResults.map((r) => fromKfResult(r, "SAFETY")));

  return buildKnowledgeResponse(results, limit);
}

// ---------------------------------------------------------------------------
// 7. Usage instructions — the real product record's own `directions`
//    field plus Module 5's Product Intelligence.
// ---------------------------------------------------------------------------

export async function fetchUsageInstructions(params: { productId: string }, opts: { limit?: number } = {}): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  if (!params.productId?.trim()) return invalidQueryResponse("productId is required.");

  const product = await prisma.product.findUnique({ where: { id: params.productId }, select: { id: true, name: true, directions: true } });
  if (!product) return emptyResponse(`No product found for productId "${params.productId}".`);

  const results: KnowledgeApiResult[] = [];
  if (product.directions) {
    results.push({
      sourceId: product.id,
      sourceType: "USAGE",
      title: `${product.name} — Directions for Use`,
      content: product.directions,
      confidence: 100,
      relevanceScore: 100,
      productId: product.id,
      categoryId: null,
      freshness: { versionNumber: null, status: "PUBLISHED", retrievedAt: new Date().toISOString() },
      governance: { layer: "LIVE", approvalTier: null, isGapRecord: false, escalationRequired: false },
    });
  }

  const dbResults = await queryDbKnowledge("gateway.knowledge.usage", ["PRODUCT_INTELLIGENCE"], { productId: params.productId, limit: MAX_LIMIT });
  results.push(...dbResults.map((r) => fromDbResult(r, "USAGE")));

  return buildKnowledgeResponse(results, limit);
}

// ---------------------------------------------------------------------------
// 8. Care guides — Module 5's Care Intelligence.
// ---------------------------------------------------------------------------

export async function fetchCareGuides(
  params: { productId?: string; category?: string; keywords?: string } = {},
  opts: { limit?: number } = {}
): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  const dbResults = await queryDbKnowledge("gateway.knowledge.careGuides", ["CARE_INTELLIGENCE"], {
    productId: params.productId,
    category: params.category,
    keywords: nonEmptyKeywords(params.keywords),
    limit: MAX_LIMIT,
  });
  return buildKnowledgeResponse(dbResults.map((r) => fromDbResult(r, "CARE_GUIDE")), limit);
}

// ---------------------------------------------------------------------------
// 9. Institutional knowledge — Institutional Sales Knowledge Factory only.
// ---------------------------------------------------------------------------

export async function fetchInstitutionalKnowledge(keywords?: string, opts: { limit?: number } = {}): Promise<KnowledgeApiResponse> {
  const limit = clampLimit(opts.limit);
  const q = nonEmptyKeywords(keywords);
  if (!q) return invalidQueryResponse("A non-empty search query is required for institutional knowledge.");
  const clearance = await resolveKnowledgeCallerClearance();
  const kfResults = authorizeKfResults(queryKnowledgeFactory(["INSTITUTIONAL_SALES_KF"], q, undefined, MAX_LIMIT), clearance);
  return buildKnowledgeResponse(kfResults.map((r) => fromKfResult(r, "INSTITUTIONAL")), limit);
}

// ---------------------------------------------------------------------------
// 10. Availability/variant information — live only, per FR-001.
// ---------------------------------------------------------------------------

export async function fetchAvailability(params: { productId: string }): Promise<KnowledgeApiResponse> {
  if (!params.productId?.trim()) return invalidQueryResponse("productId is required.");

  const product = await fetchLiveAvailability(params.productId);
  if (!product) return emptyResponse(`No product found for productId "${params.productId}" — cannot report availability for an unknown product.`);

  const commercial = product.variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    size: v.size,
    price: v.price,
    mrp: v.mrp,
    inStock: v.quantity > 0,
    quantity: v.quantity,
  }));

  const result: KnowledgeApiResult = {
    sourceId: product.id,
    sourceType: "AVAILABILITY",
    title: `${product.name} — Live Availability`,
    content: commercial.length
      ? `${commercial.filter((c) => c.inStock).length} of ${commercial.length} variant(s) in stock.`
      : "No variants exist for this product.",
    confidence: 100,
    relevanceScore: 100,
    productId: product.id,
    categoryId: null,
    freshness: { versionNumber: null, status: product.status, retrievedAt: new Date().toISOString() },
    governance: { layer: "LIVE", approvalTier: null, isGapRecord: false, escalationRequired: false },
    commercial,
  };

  return {
    status: "OK",
    message: "Live availability resolved directly from the product catalog (never from static Knowledge Factory content, per FR-001).",
    results: [result],
  };
}
