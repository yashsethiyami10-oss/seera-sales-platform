import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import { ALL_SOURCE_TYPES } from "@/lib/retrieval/types";
import type { KnowledgeSourceType, RetrievalContext } from "@/lib/retrieval/types";
import { searchKnowledgeFactories } from "./knowledge-factory-retrieval";
import { normalizeQuery } from "./query-normalizer";
import type { KnowledgeDomain, KnowledgeFactorySourceType, RetrievalMethod, RuntimeKnowledgeResult, SemanticRetrievalOutcome } from "./types";

/**
 * MUV AI — Stage 6C/6D Runtime, Semantic Retrieval Engine™.
 *
 * Resolves CF-02 from ENGINEERING_TEST_REPORT.md. Per the Founder's
 * Implementation Mission: "retain deterministic fallback; never remove
 * existing retrieval path until regression proves replacement safe." This
 * module does not replace `lib/retrieval/pipeline.ts`'s
 * `runRetrievalPipeline()` (Module 5) — it calls it unmodified as the base
 * layer, then adds a deterministic enrichment pass on top:
 *
 *   1. KOID lookup — if the message contains a Knowledge Object ID pattern
 *      (e.g. "KO-BI-014"), it is extracted and used both as an additional
 *      DB keyword term AND as an exact-match lookup against the real
 *      Knowledge Factory file index (Stage 6D) across all 4 factories,
 *      regardless of classified domain — a literal KOID reference is a
 *      precise signal that should never be filtered out by domain routing.
 *   2. Domain filtering — the Intent Engine's `KnowledgeDomain[]` is mapped
 *      to (a) the subset of DB-backed `KnowledgeSourceType`s and (b) the
 *      subset of file-backed `KnowledgeFactorySourceType`s that can
 *      actually answer it.
 *   3. Knowledge Factory retrieval (Stage 6D) — real, file-backed keyword
 *      search over the 4 completed Knowledge Factories via
 *      `knowledge-factory-retrieval.ts`, merged into the same result set
 *      as the DB-backed results below — never a placeholder, dummy, or
 *      simulated repository; every result is parsed from the real markdown
 *      files under `docs/*-knowledge-factory/`.
 *   4. Keyword fallback — Module 5's own keyword/tag matching, unchanged.
 *   5. Relationship expansion — Module 5's existing
 *      `resolveRelationshipsForTop` option, unchanged (DB-backed results
 *      only; Knowledge Factory relationships are carried in each result's
 *      own `sourceReferences`, populated directly from the real
 *      `Relationships` field parsed out of the source KO).
 *   6. Source-authority weighting + confidence ranking — a fixed,
 *      documented weight table (DB sources) blended with a separate fixed
 *      weight table (Knowledge Factories, by factory + real approval
 *      status — see `knowledge-factory-retrieval.ts`), never an
 *      AI-generated ranking.
 *
 * STAGE 6E ADDITION: every query (DB keywords AND Knowledge Factory
 * keywords) is passed through `query-normalizer.ts` first — Hindi/
 * Hinglish/Roman-Hindi terms are translated to their English equivalents
 * and ADDED to the query (never replacing it), so the same English
 * Knowledge Objects are reachable regardless of which language/script the
 * question arrived in. See `MULTILINGUAL_VALIDATION_REPORT.md` for real,
 * dictionary-scope limitations.
 *
 * HONEST LIMITATIONS (report these in every test/review document — do not
 * silently narrow them):
 *   - The Customer Care Knowledge Factory does not exist yet (not started
 *     per Stage 6C's own Stop Rule) — there is nothing to integrate for it.
 *   - "Semantic" still means deterministic keyword/tag/relationship
 *     matching for BOTH the DB sources and the 4 file-backed Knowledge
 *     Factories, never a real vector/embedding similarity search — no
 *     embedding model is wired into this pipeline (the only embedding
 *     code in this repo, `lib/retrieval/embedding-service.ts`, belongs to
 *     the separate, unrelated V4 Enterprise Knowledge Factory governance
 *     layer and returns a mock vector, not a real one).
 *   - Knowledge Factory content is served at `layer: "INTERNAL"`
 *     regardless of the individual KO's own governance intent — this
 *     runtime has no per-KO customer-facing/internal classification to
 *     read yet, so the conservative default (staff-clearance-only,
 *     matching this whole Runtime's staff-gated scope) is applied
 *     uniformly rather than guessed per-KO.
 */

const KOID_PATTERN = /\bKO-[A-Z]{2,3}-[A-Z0-9-]{2,20}\b/gi;

const DOMAIN_TO_SOURCE_TYPES: Record<KnowledgeDomain, KnowledgeSourceType[]> = {
  PRODUCT: ["PRODUCT_INTELLIGENCE", "PROBLEM_INTELLIGENCE", "CARE_INTELLIGENCE", "KNOWLEDGE"],
  CUSTOMER_CARE: ["CARE_INTELLIGENCE", "KNOWLEDGE"],
  MARKETING: ["KNOWLEDGE"],
  INSTITUTIONAL_SALES: ["KNOWLEDGE"],
  FOUNDER_INTELLIGENCE: ["KNOWLEDGE"],
  GENERAL: ALL_SOURCE_TYPES,
};

/** Stage 6D/8 — which real, file-backed Knowledge Factory(ies) can answer a
 * given classified domain. `CUSTOMER_CARE` now maps to `CUSTOMER_CARE_KF`
 * (built in the standalone Customer Care Knowledge Factory task and wired
 * here in Stage 8 — that repository is almost entirely Citation-only KOs
 * pointing back into `MARKETING_KF`, so a Customer Care question typically
 * surfaces both its own citation KO and, via the citation's own
 * `sourceReferences`, a path back to the real owning content). `GENERAL`
 * intentionally still maps to none — a generic, undomained question
 * should not trigger a broad, low-precision scan across all 5 factories;
 * it falls back to the DB-backed KNOWLEDGE source only, unchanged since
 * Stage 6D. */
const DOMAIN_TO_KF: Record<KnowledgeDomain, KnowledgeFactorySourceType[]> = {
  PRODUCT: ["PRODUCT_KF"],
  MARKETING: ["MARKETING_KF"],
  INSTITUTIONAL_SALES: ["INSTITUTIONAL_SALES_KF"],
  FOUNDER_INTELLIGENCE: ["FOUNDER_INTELLIGENCE_KF"],
  CUSTOMER_CARE: ["CUSTOMER_CARE_KF"],
  GENERAL: [],
};

const ALL_KF_SOURCE_TYPES: KnowledgeFactorySourceType[] = ["PRODUCT_KF", "MARKETING_KF", "INSTITUTIONAL_SALES_KF", "FOUNDER_INTELLIGENCE_KF", "CUSTOMER_CARE_KF"];

/** Fixed, documented authority weights (0-1) — never learned, never
 * AI-assigned. Product/Care intelligence outrank general Knowledge items
 * for product-safety topics per FD-AIC-002 level 3 (domain-authoritative
 * source wins within its own domain). Knowledge Factory results carry
 * their own weight (see `knowledge-factory-retrieval.ts`'s
 * `authorityWeightFor()`), computed per-result from real factory +
 * approval-status data, not from this fixed per-sourceType table — both
 * weight systems are compared on the same final numeric scale during the
 * merge-and-sort step below. */
const AUTHORITY_WEIGHT: Record<KnowledgeSourceType, number> = {
  PRODUCT_INTELLIGENCE: 1.0,
  CARE_INTELLIGENCE: 0.95,
  PROBLEM_INTELLIGENCE: 0.9,
  KNOWLEDGE: 0.8,
};

export async function runSemanticRetrieval(
  action: string,
  baseContext: RetrievalContext,
  customerMessage: string | undefined,
  domains: KnowledgeDomain[],
  resolveRelationshipsForTop = 3
): Promise<SemanticRetrievalOutcome> {
  const methodMix: RetrievalMethod[] = ["DETERMINISTIC_PIPELINE"];

  // Stage: KOID lookup
  const koids = customerMessage ? [...new Set([...customerMessage.matchAll(KOID_PATTERN)].map((m) => m[0].toUpperCase()))] : [];
  if (koids.length) methodMix.push("KOID_LOOKUP");

  // Stage: Domain filtering (DB sources)
  const domainSourceTypes = [...new Set(domains.flatMap((d) => DOMAIN_TO_SOURCE_TYPES[d] ?? ["KNOWLEDGE"]))];
  const effectiveSourceTypes = baseContext.sourceTypes?.length ? baseContext.sourceTypes : domainSourceTypes;
  if (baseContext.sourceTypes?.length) methodMix.push("STRUCTURED_METADATA");
  else methodMix.push("DOMAIN_FILTER");

  // Stage 6E: Hindi/Hinglish/Roman-Hindi query normalization (Objective 2).
  // Never replaces the original query text — only adds real, dictionary
  // -derived English terms alongside it, so an already-working English
  // query is never made worse. See query-normalizer.ts for full scope.
  const normalized = normalizeQuery(customerMessage);
  if (normalized.translations.length) methodMix.push("SEMANTIC_KEYWORD");

  const enrichedKeywords = [baseContext.keywords, ...koids, normalized.normalizedQuery].filter(Boolean).join(" ").trim() || undefined;
  if (enrichedKeywords && enrichedKeywords !== baseContext.keywords) methodMix.push("KEYWORD_FALLBACK");

  const context: RetrievalContext = { ...baseContext, sourceTypes: effectiveSourceTypes, keywords: enrichedKeywords };

  const { results, candidateCount, failedSourceTypes } = await runRetrievalPipeline(action, context, {
    resolveRelationshipsForTop,
  });
  if (resolveRelationshipsForTop > 0 && results.length) methodMix.push("RELATIONSHIP_EXPANSION");

  const dbEnriched: RuntimeKnowledgeResult[] = results.map((r) => ({
    ...r,
    retrievalMethods: methodMix,
    authorityWeight: AUTHORITY_WEIGHT[r.sourceType],
  }));

  // Stage: Knowledge Factory retrieval (Stage 6D) — real file-backed search.
  const kfDomains = [...new Set(domains.flatMap((d) => DOMAIN_TO_KF[d] ?? []))];
  let kfResults: RuntimeKnowledgeResult[] = [];

  // An explicit KOID mention is searched across ALL 4 factories regardless
  // of classified domain — "preserve KOIDs" means a literal reference
  // always resolves if it exists, not only when domain routing agrees.
  if (koids.length) {
    for (const koid of koids) {
      kfResults.push(...searchKnowledgeFactories({ koid, domains: ALL_KF_SOURCE_TYPES }));
    }
  }
  if (kfDomains.length && normalized.normalizedQuery) {
    kfResults.push(...searchKnowledgeFactories({ keywords: normalized.normalizedQuery, domains: kfDomains, limit: context.limit ?? 10 }));
  }
  // De-duplicate by koid (a message can both mention a KOID and keyword
  // -match it) — keep the higher-confidence occurrence.
  if (kfResults.length) {
    const byKoid = new Map<string, RuntimeKnowledgeResult>();
    for (const r of kfResults) {
      const existing = byKoid.get(r.recordId);
      if (!existing || r.confidence > existing.confidence) byKoid.set(r.recordId, r);
    }
    kfResults = [...byKoid.values()];
    methodMix.push("KNOWLEDGE_FACTORY_FILE_INDEX");
  }

  // Stage: Source-authority weighting + confidence ranking (merged set)
  const enriched: RuntimeKnowledgeResult[] = [...dbEnriched, ...kfResults].sort((a, b) => b.confidence * b.authorityWeight - a.confidence * a.authorityWeight);

  const fellBackToDeterministic = koids.length === 0 && !baseContext.sourceTypes?.length && domains.length === 1 && domains[0] === "GENERAL" && kfResults.length === 0;

  return {
    results: enriched,
    methodMix: [...new Set(methodMix)],
    candidateCount: candidateCount + kfResults.length,
    failedSourceTypes,
    fellBackToDeterministic,
  };
}
