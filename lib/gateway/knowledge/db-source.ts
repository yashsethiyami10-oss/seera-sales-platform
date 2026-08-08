import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import type { KnowledgeSourceType, RetrievalContext, RetrievalResult } from "@/lib/retrieval/types";

/**
 * MUV AI Gateway (Phase 5.2, Module 3) — thin wrapper around Module 5's
 * existing, frozen, DB-backed Knowledge Retrieval Core. Not a
 * reimplementation: permission resolution, layer filtering, ranking, and
 * telemetry (`KnowledgeRetrievalLog`) all still happen exactly as they do
 * today for the live storefront turn — this file only shapes the call.
 *
 * Resolves to `[]` (never throws) on failure — `runRetrievalPipeline`
 * itself already logs the real failure to `KnowledgeRetrievalLog` before
 * rethrowing, so nothing is lost by catching here; this just keeps a
 * Knowledge API caller from having one DB source's failure take down an
 * otherwise-successful multi-source query (the same "safe fallback"
 * discipline as the response shape itself).
 */
export async function queryDbKnowledge(
  action: string,
  sourceTypes: KnowledgeSourceType[],
  context: Omit<RetrievalContext, "sourceTypes">
): Promise<RetrievalResult[]> {
  try {
    const { results } = await runRetrievalPipeline(action, { ...context, sourceTypes });
    return results;
  } catch {
    return [];
  }
}
