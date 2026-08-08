# Ranking

`lib/retrieval/ranking.ts`. Deterministic, explainable, and — per the spec's explicit instruction — not
AI. No model, no embeddings, no learned weights: a fixed, documented point table, summed per result,
sorted descending.

## Weight table

| Factor | Weight | Triggered when |
|---|---|---|
| Exact Match | 1000 | `matchedFields` includes `id` or `slug` |
| Relationship Match | 500 | `matchedFields` includes `relationship` (the result is directly linked to a `productId`/etc. named in the query) |
| Tag Match | 100 | `matchedFields` includes `tag` |
| Keyword Match | 50 | `matchedFields` includes `keyword` |
| Category Match | 25 | `matchedFields` includes `category` |
| Recent Version | up to 10 | `min(10, versionNumber)` — a small, capped tiebreaker |
| Priority Score | variable | `result.priorityScore` (currently always 0 from every source fetcher — see `known-limitations.md`) |

Order matches the spec's own suggested factor list exactly (Exact → Relationship → Tag → Keyword →
Category → Recent Version → Priority Score) via strictly decreasing weight magnitudes, so a higher-tier
match can never be outranked by any combination of lower-tier ones.

## Explainability

Every result's own `matchedFields` array is returned to the caller unmodified — nothing is hidden. A
result's `confidence` (0–100) is computed as `round((score / maxPossibleScore) * 100)`, so it's a
transparent percentage of the theoretical maximum, not an opaque number. Anyone can recompute a result's
score by hand from its `matchedFields` and this weight table.

## Determinism

Verified live: ranking the same candidate set twice produces byte-identical output order both times (no
randomness, no time-of-day dependency beyond the capped, deterministic "recent version" tiebreaker).

## Not implemented

No semantic similarity, no learned relevance, no personalization. "Keyword Match" is a plain
case-insensitive substring check (`lib/retrieval/sources.ts`'s `keywordHit()`) — real text matching, not
semantic search, which the spec explicitly excludes.
