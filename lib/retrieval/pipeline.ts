import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveCallerClearance, layerAllowed } from "./permissions";
import { fetchKnowledgeCandidates, fetchProductIntelligenceCandidates, fetchProblemIntelligenceCandidates, fetchCareIntelligenceCandidates, levenshteinDistance, fuzzyToleranceFor } from "./sources";
import { resolveRelationships } from "./relationships";
import { rankResults } from "./ranking";
import { ALL_SOURCE_TYPES } from "./types";
import type { CallerClearance, KnowledgeSourceType, RetrievalContext, RetrievalResult } from "./types";
import type { RetrievalOutcome } from "@prisma/client";

/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) pipeline orchestration.
 *
 * Implements the frozen 8-stage flow exactly, in order, as named stage
 * comments below — "do not change this order" is honored structurally,
 * not just by convention: each stage is a discrete step in this function,
 * not interleaved.
 *
 *   Query Request -> Permission Validation -> Determine Retrieval Scope ->
 *   Identify Candidate Sources -> Retrieve Published Versions -> Filter by
 *   Layer A/B/C -> Resolve Relationships -> Rank Results -> Return
 *   Structured Retrieval Result
 */

const SOURCE_FETCHERS: Record<KnowledgeSourceType, (ctx: RetrievalContext, clearance: CallerClearance) => Promise<RetrievalResult[]>> = {
  KNOWLEDGE: fetchKnowledgeCandidates,
  PRODUCT_INTELLIGENCE: fetchProductIntelligenceCandidates,
  PROBLEM_INTELLIGENCE: fetchProblemIntelligenceCandidates,
  CARE_INTELLIGENCE: fetchCareIntelligenceCandidates,
};

export type PipelineOptions = {
  /** Resolve cross-module relationships for the top N ranked results only
   * — capped to avoid an N+1 explosion on a large result set. 0/undefined
   * skips relationship resolution entirely (e.g. for a pure keyword scan). */
  resolveRelationshipsForTop?: number;
};

export type PipelineResult = {
  results: RetrievalResult[];
  clearance: CallerClearance;
  candidateCount: number;
  failedSourceTypes: KnowledgeSourceType[];
};

export async function runRetrievalPipeline(action: string, context: RetrievalContext, options: PipelineOptions = {}): Promise<PipelineResult> {
  const startedAt = Date.now();
  let outcome: RetrievalOutcome = "SUCCESS";
  let errorMessage: string | undefined;
  let finalResults: RetrievalResult[] = [];
  let candidateCount = 0;
  let failedSourceTypes: KnowledgeSourceType[] = [];
  let clearance: CallerClearance;

  try {
    // Stage: Permission Validation — always server-derived, never trusted from the caller.
    clearance = await resolveCallerClearance();

    // Stage: Determine Retrieval Scope
    const sourceTypes = context.sourceTypes?.length ? context.sourceTypes : ALL_SOURCE_TYPES;
    const limit = Math.max(1, Math.min(context.limit ?? 10, 50));

    // Stage: Identify Candidate Sources + Stage: Retrieve Published Versions
    // (status/version filtering happens inside each fetcher, per Version
    // Resolution rules — see lib/retrieval/sources.ts's statusesFor()).
    const settled = await Promise.allSettled(sourceTypes.map((t) => SOURCE_FETCHERS[t](context, clearance)));
    let candidates: RetrievalResult[] = [];
    settled.forEach((s, idx) => {
      if (s.status === "fulfilled") candidates.push(...s.value);
      else {
        failedSourceTypes.push(sourceTypes[idx]!);
        logger.error("retrieval:source-fetch-failed", { sourceType: sourceTypes[idx], error: String(s.reason) });
      }
    });
    candidateCount = candidates.length;

    // Stage: Filter by Layer A/B/C — defense-in-depth re-check. Every
    // fetcher already queries with a layer filter; this stage re-verifies
    // every single result regardless, so a future fetcher bug can never
    // leak content past this point. "Permission filtering must occur
    // BEFORE results are returned" — this is the last check before ranking.
    candidates = candidates.filter((r) => layerAllowed(r.layer, clearance));

    // Stage: Filter by Relevance (Founder Publishing Review — Runtime
    // Answer-Delivery Correction, Issue 2) — see filterByRelevance()'s own
    // doc comment for the full design. Only ever engages when `keywords`
    // was actually supplied; every other context field (`productId`/
    // `slug`/`category`/`tags`) already narrows each fetcher's own Prisma
    // `where` clause directly (lib/retrieval/sources.ts), so a caller
    // doing a pure category/tag/productId lookup — or a genuine "browse
    // everything eligible" request with no keywords at all — is
    // completely unaffected by this stage.
    if (context.keywords?.trim()) {
      candidates = filterByRelevance(candidates, context.keywords);
    }

    // Stage: Resolve Relationships (optional, capped)
    if (options.resolveRelationshipsForTop && candidates.length) {
      const top = candidates.slice(0, options.resolveRelationshipsForTop);
      await Promise.all(
        top.map(async (r) => {
          const refs = await resolveRelationships(r.sourceType, r.recordId, clearance);
          r.sourceReferences = [...r.sourceReferences, ...refs];
        })
      );
    }

    // Stage: Rank Results
    finalResults = rankResults(candidates, context).slice(0, limit);

    if (failedSourceTypes.length === sourceTypes.length && sourceTypes.length > 0) outcome = "ERROR";
    else if (failedSourceTypes.length > 0) outcome = "PARTIAL";
    else if (finalResults.length === 0) outcome = "EMPTY";
    else outcome = "SUCCESS";

    // Stage: Return Structured Retrieval Result — see the caller (actions/retrieval.ts).
    await logRetrieval(action, context, clearance, sourceTypes, finalResults.length, Date.now() - startedAt, outcome);
    return { results: finalResults, clearance, candidateCount, failedSourceTypes };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    outcome = "ERROR";
    const fallbackClearance: CallerClearance = { role: "ANONYMOUS", maxLayer: "PUBLIC", canAccessNonPublished: false };
    await logRetrieval(action, context, fallbackClearance, context.sourceTypes ?? ALL_SOURCE_TYPES, 0, Date.now() - startedAt, outcome, errorMessage);
    throw err;
  }
}

// This catalog's own brand prefix — present in literally every product
// name, so its presence can never itself signal relevance to one
// candidate over another.
const RELEVANCE_BRAND_STOPWORD = "muv";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.()\-]+/)
    .filter((t) => t.length > 2 && t !== RELEVANCE_BRAND_STOPWORD);
}

function tokensOverlap(a: string[], b: string[]): boolean {
  return a.some((ta) => b.some((tb) => levenshteinDistance(ta, tb) <= fuzzyToleranceFor(ta.length)));
}

/**
 * Founder Publishing Review — Runtime Answer-Delivery Correction, Issue 2.
 *
 * `keywordHit()` (lib/retrieval/sources.ts) already tags each candidate's
 * `matchedFields` from one haystack at a time, with no visibility into
 * its siblings — safe for exact/near-exact matches, but not enough to
 * tell a genuinely distinguishing word (a product's own unique name,
 * e.g. "Cloud"/"Velvet"/"Radiance") from a word that's merely a shared
 * category suffix repeated across several unrelated real products (e.g.
 * "Wash", "Cleaner", "Phenyl") — a single-token version of this check,
 * tried and reverted, false-matched "Muv Unicorn Sparkle Wash" against
 * "Muv Radiance Car Wash" purely on the shared word "Wash"
 * (deterministic-retrieval.test.ts's own tests 18/22 caught this).
 * Telling those apart needs visibility across the whole candidate batch
 * at once, which only this pipeline stage has.
 *
 * Two tiers, first-match-wins per query, both deterministic:
 *
 * 1. Distinguishing — a token is "distinguishing" if it appears in
 *    exactly one candidate's title within this batch. A candidate passes
 *    this tier if it already has a structural match (`matchedFields`
 *    non-empty — id/slug/relationship/tag/category/keyword, including
 *    keywordHit()'s own exact/fuzzy/verbatim-reverse checks) OR the query
 *    contains at least one of its distinguishing tokens (exact or bounded
 *    fuzzy match). If ANY candidate passes tier 1, only tier-1 passers are
 *    returned — a query that clearly names something specific should not
 *    also surface everything that merely shares a category word with it.
 *
 * 2. Category fallback — only reached when NO candidate passes tier 1
 *    (the query named nothing specific). A candidate passes if at least
 *    half of the QUERY's own significant tokens (not the candidate's)
 *    overlap with its title's tokens. Requiring a query-side majority,
 *    not just one shared word, is what keeps a nonsense phrase that
 *    happens to contain one real category word ("Muv Unicorn Sparkle
 *    Wash") from passing here too — it shares only "wash" (1 of 3
 *    significant query tokens, well under half) with any real product.
 *    A genuine category query ("floor cleaning", "something for the
 *    car") clears this bar and correctly returns the relevant subset —
 *    "recommendation can retrieve a justified relevant set" without
 *    returning literally everything published.
 */
export function filterByRelevance(candidates: RetrievalResult[], keywords: string): RetrievalResult[] {
  const queryTokens = tokenize(keywords);
  if (queryTokens.length === 0) return candidates;

  const titleTokensByCandidate = candidates.map((c) => tokenize(c.title));
  const tokenFrequency = new Map<string, number>();
  for (const tokens of titleTokensByCandidate) {
    for (const t of new Set(tokens)) tokenFrequency.set(t, (tokenFrequency.get(t) ?? 0) + 1);
  }

  const tier1 = candidates.filter((c, i) => {
    if (c.matchedFields.length > 0) return true;
    const distinguishing = titleTokensByCandidate[i]!.filter((t) => tokenFrequency.get(t) === 1);
    return tokensOverlap(distinguishing, queryTokens);
  });
  if (tier1.length > 0) return tier1;

  return candidates.filter((_, i) => {
    const titleTokens = titleTokensByCandidate[i]!;
    if (titleTokens.length === 0) return false;
    const overlapCount = queryTokens.filter((qt) => titleTokens.some((tt) => levenshteinDistance(qt, tt) <= fuzzyToleranceFor(qt.length))).length;
    return overlapCount / queryTokens.length >= 0.5;
  });
}

/**
 * Best-effort telemetry write — never throws, never blocks the real
 * retrieval response on a logging failure. Logs the *request shape* only
 * (ids/slugs/tags/keywords/category — query parameters, not retrieved
 * content), per "do not log sensitive content unnecessarily": result
 * titles/summaries/internalMetadata are never persisted here.
 */
async function logRetrieval(
  action: string,
  context: RetrievalContext,
  clearance: CallerClearance,
  sourceTypesQueried: KnowledgeSourceType[],
  matchCount: number,
  durationMs: number,
  outcome: RetrievalOutcome,
  errorMessage?: string
) {
  try {
    await prisma.knowledgeRetrievalLog.create({
      data: {
        action,
        requestSummary: context as object,
        callerClearance: clearance.maxLayer,
        sourceTypesQueried,
        matchCount,
        durationMs,
        outcome,
        errorMessage,
      },
    });
  } catch (err) {
    logger.error("retrieval:log-write-failed", { action, error: err instanceof Error ? err.message : String(err) });
  }
}
