import type { RetrievalResult } from "@/lib/retrieval/types";
import type { RuntimeKnowledgeResult } from "@/lib/runtime/types";
import { MIN_CONFIDENCE_THRESHOLD } from "./constants";
import type { KnowledgeApiResponse, KnowledgeApiResult, KnowledgeApiSourceType } from "./types";

/**
 * MUV AI Gateway (Phase 5.2, Module 3) — the only place a Module 5
 * `RetrievalResult` or a Stage 6D `RuntimeKnowledgeResult` is mapped into
 * the Knowledge API's own normalized shape. Neither source's own type is
 * ever widened or changed to accommodate this — both stay exactly as
 * Module 5/Stage 6D already froze them; this file adapts outward only.
 */

export function fromDbResult(r: RetrievalResult, sourceType: KnowledgeApiSourceType): KnowledgeApiResult {
  const productRef = r.sourceReferences.find((ref) => ref.type === "PRODUCT");
  const meta = r.internalMetadata as { escalationRequired?: boolean } | null;
  return {
    sourceId: r.recordId,
    sourceType,
    title: r.title,
    content: r.summary ?? "",
    confidence: r.confidence,
    relevanceScore: r.confidence,
    productId: productRef?.id ?? null,
    categoryId: null,
    freshness: { versionNumber: r.versionNumber, status: r.status, retrievedAt: r.retrievedAt },
    governance: {
      layer: r.layer,
      approvalTier: null,
      isGapRecord: false,
      escalationRequired: Boolean(meta?.escalationRequired),
    },
  };
}

export function fromKfResult(r: RuntimeKnowledgeResult, sourceType: KnowledgeApiSourceType): KnowledgeApiResult {
  const meta = r.internalMetadata as { isGapRecord?: boolean } | null;
  return {
    sourceId: r.recordId,
    sourceType,
    title: r.title,
    content: r.summary ?? "",
    confidence: r.confidence,
    relevanceScore: r.priorityScore,
    productId: null,
    categoryId: null,
    freshness: { versionNumber: r.versionNumber, status: r.status, retrievedAt: r.retrievedAt },
    governance: {
      // Knowledge Factory content is internally authored documentation,
      // never raw public web content — "INTERNAL" here describes
      // provenance, not a customer-visibility restriction (the Knowledge
      // API itself performs no permission filtering beyond what Module
      // 5's own pipeline already applies to DB-backed results).
      layer: "INTERNAL",
      approvalTier: r.status,
      isGapRecord: Boolean(meta?.isGapRecord),
      escalationRequired: false,
    },
  };
}

export function invalidQueryResponse(message: string): KnowledgeApiResponse {
  return { status: "INVALID_QUERY", message, results: [] };
}

export function emptyResponse(message: string): KnowledgeApiResponse {
  return { status: "EMPTY", message, results: [] };
}

/**
 * The one place retrieval-limit and confidence-threshold policy is
 * applied, so no individual fetch function reimplements "sort, filter,
 * cap" differently. `results` should already be in "candidate" form —
 * this both filters and builds the final structured response.
 */
export function buildKnowledgeResponse(results: KnowledgeApiResult[], limit: number): KnowledgeApiResponse {
  if (results.length === 0) {
    return emptyResponse("No verified MUV knowledge was found for this query. Treat this as 'knowledge unavailable' — do not fabricate an answer.");
  }

  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const passing = sorted.filter((r) => r.confidence >= MIN_CONFIDENCE_THRESHOLD);

  if (passing.length === 0) {
    return {
      status: "LOW_CONFIDENCE",
      message: "Matching content was found but every result is below the safe confidence threshold — treat as unverified, do not present as fact.",
      results: sorted.slice(0, limit),
    };
  }

  return {
    status: "OK",
    message: `Found ${Math.min(passing.length, limit)} verified result(s).`,
    results: passing.slice(0, limit),
  };
}
