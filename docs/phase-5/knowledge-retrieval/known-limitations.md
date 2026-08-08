# Known Limitations

## No `getRetrievalMetrics`-style action
The spec's "Metrics" section asks to track Retrieval Count, Cache Hit/Miss, Average Retrieval Time,
Permission Rejections, Source Distribution, and Failed Retrievals. Every one of these is *derivable*
from `KnowledgeRetrievalLog` (a `groupBy`/`avg`/`count` query away), and the raw data is captured on
every call — but no server action to actually compute and return them was built, because none is named
in this module's own 8-action Server Actions list. Given the discovered miscounting issue in Module 3's
report, this was treated as a hard boundary this time, not a judgment call to expand past — recorded
here plainly rather than silently added.

## Cache interface exists, isn't wired in
`RetrievalCache`/`InMemoryRetrievalCache`/`getRetrievalCache()` are complete and match the spec's
"create caching interfaces only... do not require Redis now" instruction precisely — but
`runRetrievalPipeline()` doesn't actually call `getRetrievalCache()` anywhere yet. Wiring it in (cache
key from `buildCacheKey()`, check-before-fetch, set-after-rank) is a small, contained addition for
whichever future module first needs retrieval to be fast under real load — not built speculatively here
since nothing yet depends on it, per "add only what is required."

## Knowledge↔PIF and Knowledge↔PrIF are transitive, not direct
See `architecture.md` for the full reasoning — no schema change was made to add a direct relation for
either pair (would mean editing Module 1/2/3's own models), so both are resolved via a shared `Product`
reference instead. This means: a Knowledge item with **no** `productId` set, and a PIF/PrIF that's
otherwise clearly "about the same topic" in some qualitative sense, will **not** be found related to
each other by `getKnowledgeRelationships` — the resolution is real but strictly product-anchored, not
topical/semantic (semantic matching is explicitly out of scope for this module anyway).

## Ranking's `priorityScore` factor is currently always 0
Every source fetcher sets `priorityScore: 0` on every result — nothing in Modules 1–4's own schemas has
an explicit "priority" field to source this from today. The ranking weight table (`ranking.md`) still
reserves a slot for it, so a future module that adds a real priority signal (e.g. a founder-set
"pin this to the top" flag) can wire straight into an already-tested part of the scoring formula without
a `ranking.ts` change.

## `resolveCallerClearance()` and the 8 Server Actions were not live-request-tested
Same disclosed limitation as every prior module for RBAC-adjacent logic — no test runner exists in this
repository to script a real authenticated Next.js request. The underlying library functions (which hold
all the actual permission logic) were tested directly instead; see `testing.md`.

## Keyword matching is substring-only
`keywordHit()` is a plain case-insensitive `.includes()` check against a small, fixed set of fields per
source type (title/content for Knowledge, product name + stringified sections for PIF, title/summary for
PrIF and CIF). No stemming, no fuzzy matching, no relevance scoring beyond "did the substring appear."
Deliberately simple and honest about what it is — anything more sophisticated starts to blur into
semantic search, which this module explicitly excludes.

## No pagination beyond `limit`
Every retrieval action returns at most `limit` (default 10, max 50) results; there's no cursor/offset
mechanism to page through more. Consistent with "retrieve only the minimum, most relevant" — if a future
caller genuinely needs to page through a large result set, that's a deliberate future addition, not an
oversight here.
