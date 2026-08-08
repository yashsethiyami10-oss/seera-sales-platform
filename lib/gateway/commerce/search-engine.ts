import { prisma } from "@/lib/prisma";
import { productCard } from "@/lib/product-catalog";

/**
 * MUV AI Gateway — Production Rollout v1.0, Stage 3 (Search Intelligence
 * Upgrade).
 *
 * Deterministic, in-process product retrieval for natural-language AI
 * queries ("do you have a floor cleaner for marble?"), replacing the
 * pilot's raw `name.contains(rawQuery)` substring match — the pilot's
 * `intent.ts` already strips stopwords into a keyword phrase, but a
 * multi-word phrase still had to appear VERBATIM inside a product's name
 * to match at all, which real customer phrasing almost never does.
 *
 * Deliberately NOT a change to `lib/product-catalog.ts`'s own
 * `searchProducts()` — that function backs the public storefront's own
 * shop-page search bar (`app/api/products/route.ts`, `/shop`) and stays
 * completely untouched; this file is a new, additive, AI-only capability.
 * `lib/gateway/commerce/commerce-api.ts`'s `searchProducts()` (the
 * Commerce Intelligence tool — its own signature/return shape is
 * unchanged) now calls THIS engine for the free-text query case and the
 * original catalog function for everything else (plain category
 * browsing/sorting), so nothing about the Commerce Intelligence contract
 * changes for any existing caller.
 *
 * No generative/ML search — every score is a fixed, explainable function
 * of real product fields (name, category, benefits, fragrance notes,
 * description, variant size) plus a small, explicit, human-editable
 * synonym table. "Never infer unsupported compatibility" is enforced one
 * layer up (the pilot's grounded-prompt construction) — this engine's
 * only job is honest, explainable RETRIEVAL: which real products a query
 * plausibly refers to, not which claims about them are true.
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "the", "do", "does", "did", "you", "have", "has", "having", "is", "are", "am",
  "i", "we", "my", "your", "for", "of", "to", "in", "on", "at", "and", "or", "please",
  "hi", "hello", "hey", "can", "could", "would", "should", "want", "wanted", "looking",
  "look", "need", "needed", "some", "any", "me", "us", "it", "this", "that", "these",
  "those", "with", "about", "if", "so", "there", "just", "how", "hows", "what", "whats",
  "where", "which", "one", "ones", "got", "get",
]);

/** Deliberately small, explicit, easy-to-audit-in-one-glance. Add a new
 * entry only for a real, observed customer phrasing gap — never a whole
 * thesaurus. Each key maps to additional tokens a match against ANY real
 * product field may also satisfy. */
const SEARCH_SYNONYMS: Record<string, string[]> = {
  shampoo: ["wash"], // "car shampoo" -> also matches "Car Wash"
  detergent: ["wash"],
  cleaning: ["cleaner"],
};

function singularize(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export type SearchToken = { token: string; expansions: string[] };

/** Tokenize + singularize + stopword-strip + synonym-expand a raw query.
 * Pure, exported for permanent unit tests. */
export function tokenizeQuery(rawQuery: string): SearchToken[] {
  const normalized = normalizeText(rawQuery);
  if (!normalized) return [];
  const seen = new Set<string>();
  const tokens: SearchToken[] = [];
  for (const raw of normalized.split(" ")) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const token = singularize(raw);
    if (STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push({ token, expansions: SEARCH_SYNONYMS[token] ?? [] });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Typo tolerance — bounded Levenshtein distance, deterministic
// ---------------------------------------------------------------------------

/** Classic DP edit distance, capped — this is a small-catalog, per-query,
 * per-candidate-word computation (never per-character-of-a-huge-corpus),
 * so an uncapped O(n*m) table is fine at this scale. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j]!, dp[j - 1]!);
      prevDiag = temp;
    }
  }
  return dp[n]!;
}

function isTypoMatch(token: string, candidateWord: string): boolean {
  if (candidateWord.length < 4 || token.length < 4) return false;
  const maxDistance = token.length >= 7 ? 2 : 1;
  return levenshteinDistance(token, candidateWord) <= maxDistance;
}

// ---------------------------------------------------------------------------
// Candidate data + scoring
// ---------------------------------------------------------------------------

type SearchCandidate = {
  id: string;
  name: string;
  categoryName: string;
  variantSizes: string[];
  keyBenefits: string[];
  benefits: string | null;
  fragranceNotes: string | null;
  shortDescription: string;
};

const FIELD_WEIGHTS = {
  name: 40,
  nameTypo: 20,
  category: 25,
  categoryTypo: 12,
  variantSize: 10,
  keyBenefit: 15,
  benefits: 12,
  fragranceNotes: 15,
  shortDescription: 8,
} as const;

const EXACT_PHRASE_BONUS = 60;
export const MIN_CONFIDENCE_SCORE = 30;

function fieldWords(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

/** Whole-word/whole-phrase match, not a bare substring — otherwise a
 * token like "wash" would spuriously match inside "dishwash". */
function containsWholeWord(haystackNormalized: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystackNormalized);
}

function scoreField(tokens: SearchToken[], text: string, matchWeight: number, typoWeight?: number): number {
  const words = fieldWords(text);
  if (words.length === 0) return 0;
  const normalized = normalizeText(text);
  let score = 0;
  for (const { token, expansions } of tokens) {
    const candidates = [token, ...expansions];
    const directHit = candidates.some((c) => containsWholeWord(normalized, c));
    if (directHit) {
      score += matchWeight;
      continue;
    }
    if (typoWeight) {
      const typoHit = words.some((w) => candidates.some((c) => isTypoMatch(c, w)));
      if (typoHit) score += typoWeight;
    }
  }
  return score;
}

export type ScoredCandidate = { id: string; score: number };

/** Pure — no I/O. Exported for permanent unit tests independent of the
 * database. */
export function scoreCandidate(tokens: SearchToken[], candidate: SearchCandidate): number {
  if (tokens.length === 0) return 0;
  let score = 0;

  score += scoreField(tokens, candidate.name, FIELD_WEIGHTS.name, FIELD_WEIGHTS.nameTypo);
  score += scoreField(tokens, candidate.categoryName, FIELD_WEIGHTS.category, FIELD_WEIGHTS.categoryTypo);
  for (const size of candidate.variantSizes) score += scoreField(tokens, size, FIELD_WEIGHTS.variantSize);
  for (const benefit of candidate.keyBenefits) score += scoreField(tokens, benefit, FIELD_WEIGHTS.keyBenefit);
  if (candidate.benefits) score += scoreField(tokens, candidate.benefits, FIELD_WEIGHTS.benefits);
  if (candidate.fragranceNotes) score += scoreField(tokens, candidate.fragranceNotes, FIELD_WEIGHTS.fragranceNotes);
  score += scoreField(tokens, candidate.shortDescription, FIELD_WEIGHTS.shortDescription);

  const queryPhrase = tokens.map((t) => t.token).join(" ");
  if (queryPhrase && containsWholeWord(normalizeText(candidate.name), queryPhrase)) score += EXACT_PHRASE_BONUS;

  return score;
}

export type IntelligentSearchResult = {
  /** Deterministically ranked, above the confidence threshold, deduplicated by construction (one entry per product id). */
  matchedProductIds: string[];
  /** "HIGH" = at least one real strong signal (name/category exact match); "LOW" = only typo/weak-field matches cleared the threshold; "NONE" = nothing cleared it. Informational only — ambiguous-query clarification is the caller's decision, not this engine's. */
  confidence: "HIGH" | "LOW" | "NONE";
  tokens: string[];
}

/**
 * Production Rollout v1.0, Stage 10 (Cost, Latency, Reliability
 * Optimization) — a short-lived, in-memory cache over the candidate
 * fetch below. Safe because:
 *   - it's public, non-customer-specific catalog metadata (name/
 *     category/benefits/fragrance/description/variant SIZES only) —
 *     "no caching of private customer data across users" doesn't apply,
 *     there is no customer data here at all;
 *   - it never caches price/stock — `fetchProductsByIdsOrdered()` (the
 *     function that actually produces the commercial facts shown to a
 *     customer) always re-reads fresh from the database, completely
 *     unaffected by this cache, so FR-001 ("live data only for price/
 *     stock") is untouched;
 *   - the TTL (5s) is short enough that a newly ACTIVE/deactivated
 *     product still becomes searchable/unsearchable within one HTTP
 *     round-trip's worth of time in the worst case, and long enough to
 *     collapse repeated identical DB reads within a single burst of
 *     nearby customer turns.
 * Same in-memory, single-instance, resets-on-restart tradeoff
 * `lib/rate-limit.ts` already documents and this codebase already
 * accepts; swap for a shared cache (Redis) at the same point that file
 * recommends doing so.
 */
const CANDIDATE_CACHE_TTL_MS = 5_000;
let candidateCache: { data: SearchCandidate[]; expiresAt: number } | null = null;

/** The engine's only DB touch — one unpaginated read of every ACTIVE
 * product's scoring-relevant fields. Fine at this catalog's real size
 * (dozens of SKUs); documented as a v1 scaling limit for a future
 * catalog large enough to need a real search index (Elasticsearch/
 * Postgres full-text) instead of in-process scoring. */
async function fetchSearchCandidates(): Promise<SearchCandidate[]> {
  if (candidateCache && candidateCache.expiresAt > Date.now()) {
    return candidateCache.data;
  }
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      benefits: true,
      fragranceNotes: true,
      shortDescription: true,
      category: { select: { name: true } },
      variants: { select: { size: true } },
      content: { select: { keyBenefits: true } },
    },
  });
  const mapped = products.map((p) => ({
    id: p.id,
    name: p.name,
    categoryName: p.category.name,
    variantSizes: p.variants.map((v) => v.size),
    // One bullet per line (see ProductContent.keyBenefits's own schema
    // comment) — not a real array column.
    keyBenefits: p.content?.keyBenefits ? p.content.keyBenefits.split("\n").map((line) => line.trim()).filter(Boolean) : [],
    benefits: p.benefits,
    fragranceNotes: p.fragranceNotes,
    shortDescription: p.shortDescription,
  }));
  candidateCache = { data: mapped, expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS };
  return mapped;
}

/** Test/ops-only escape hatch — never called from real request handling. */
export function clearSearchCandidateCache(): void {
  candidateCache = null;
}

/**
 * Real, deterministic, production-grade retrieval — the function
 * `commerce-api.ts`'s `searchProducts()` calls for the free-text query
 * case. Returns ranked product IDs above the confidence threshold; the
 * caller re-fetches those specific IDs with its own full display shape
 * (unchanged from before this stage).
 */
export async function runIntelligentProductSearch(rawQuery: string): Promise<IntelligentSearchResult> {
  const tokens = tokenizeQuery(rawQuery);
  if (tokens.length === 0) return { matchedProductIds: [], confidence: "NONE", tokens: [] };

  const candidates = await fetchSearchCandidates();
  const scored: ScoredCandidate[] = candidates
    .map((c) => ({ id: c.id, score: scoreCandidate(tokens, c) }))
    .filter((s) => s.score >= MIN_CONFIDENCE_SCORE);

  scored.sort((a, b) => b.score - a.score);

  const strongMatch = scored.some((s) => s.score >= FIELD_WEIGHTS.name);
  const confidence: IntelligentSearchResult["confidence"] = scored.length === 0 ? "NONE" : strongMatch ? "HIGH" : "LOW";

  return { matchedProductIds: scored.map((s) => s.id), confidence, tokens: tokens.map((t) => t.token) };
}

/** Re-fetches a specific, already-ranked set of product IDs with the same
 * display shape `lib/product-catalog.ts` already uses everywhere else,
 * preserving the caller's given order (`findMany({where:{id:{in}}})`
 * does not itself preserve order) — same pattern already established by
 * `compareProducts` in that file. */
export async function fetchProductsByIdsOrdered(orderedIds: string[]) {
  if (orderedIds.length === 0) return [];
  const rows = await prisma.product.findMany({ where: { id: { in: orderedIds }, status: "ACTIVE" }, select: productCard });
  const order = new Map(orderedIds.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
