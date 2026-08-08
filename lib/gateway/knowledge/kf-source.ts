import { searchKnowledgeFactories } from "@/lib/runtime/knowledge-factory-retrieval";
import type { RuntimeKnowledgeResult } from "@/lib/runtime/types";
import type { KnowledgeFactorySourceType } from "@/lib/runtime/types";

export const ALL_KF_DOMAINS: KnowledgeFactorySourceType[] = [
  "PRODUCT_KF",
  "MARKETING_KF",
  "INSTITUTIONAL_SALES_KF",
  "FOUNDER_INTELLIGENCE_KF",
  "CUSTOMER_CARE_KF",
];

/**
 * MUV AI Gateway (Phase 5.2, Module 3) — thin wrapper around Stage 6D's
 * existing, real, file-backed MUV Knowledge Factory search
 * (`lib/runtime/knowledge-factory-retrieval.ts`). Pure, synchronous,
 * zero network/DB calls — reading and indexing 1,187 real Knowledge
 * Objects from `docs/*-knowledge-factory/` on disk, cached in-process.
 * Never throws for "no match" (returns `[]`); genuine errors (a malformed
 * source file) surface from the underlying loader itself, not swallowed
 * here, since this layer adds no additional failure mode of its own.
 */
export function queryKnowledgeFactory(
  domains: KnowledgeFactorySourceType[],
  keywords?: string,
  koid?: string,
  limit?: number
): RuntimeKnowledgeResult[] {
  return searchKnowledgeFactories({ domains, keywords, koid, limit });
}
