import type { RetrievalContext, RetrievalResult } from "./types";

/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) ranking engine.
 * Deterministic and explainable, per the spec's own explicit "do NOT use
 * AI" — every point of a result's score traces back to a named,
 * documented weight and is visible in that result's own `matchedFields`,
 * so a caller (or a founder auditing a ranking) can always see *why* a
 * result ranked where it did, not just that it did.
 *
 * Order follows the spec's suggested factor list exactly: Exact Match →
 * Relationship Match → Tag Match → Keyword Match → Category Match →
 * Recent Version → Priority Score.
 */
export const RANKING_WEIGHTS = {
  exactMatch: 1000,
  relationshipMatch: 500,
  tagMatch: 100,
  keywordMatch: 50,
  categoryMatch: 25,
  recentVersionMax: 10,
} as const;

const MAX_POSSIBLE_SCORE =
  RANKING_WEIGHTS.exactMatch +
  RANKING_WEIGHTS.relationshipMatch +
  RANKING_WEIGHTS.tagMatch +
  RANKING_WEIGHTS.keywordMatch +
  RANKING_WEIGHTS.categoryMatch +
  RANKING_WEIGHTS.recentVersionMax;

function scoreResult(result: RetrievalResult): number {
  let score = 0;
  if (result.matchedFields.includes("id") || result.matchedFields.includes("slug")) score += RANKING_WEIGHTS.exactMatch;
  if (result.matchedFields.includes("relationship")) score += RANKING_WEIGHTS.relationshipMatch;
  if (result.matchedFields.includes("tag")) score += RANKING_WEIGHTS.tagMatch;
  if (result.matchedFields.includes("keyword")) score += RANKING_WEIGHTS.keywordMatch;
  if (result.matchedFields.includes("category")) score += RANKING_WEIGHTS.categoryMatch;
  // "Recent Version" — a small, capped tiebreaker so it can never outrank
  // an actual content-relevance match, only break ties among otherwise
  // equally-relevant results.
  score += Math.min(RANKING_WEIGHTS.recentVersionMax, result.versionNumber ?? 0);
  score += result.priorityScore;
  return score;
}

/** Ranks results in place order (returns a new array) and stamps each
 * result's `confidence` with a deterministic 0–100 score derived from the
 * same weights — never an AI-estimated confidence. */
export function rankResults(results: RetrievalResult[], _context: RetrievalContext): RetrievalResult[] {
  const scored = results.map((r) => ({ result: r, score: scoreResult(r) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ result, score }) => ({
    ...result,
    confidence: Math.max(0, Math.min(100, Math.round((score / MAX_POSSIBLE_SCORE) * 100))),
  }));
}
