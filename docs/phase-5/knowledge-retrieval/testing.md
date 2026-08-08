# Testing

No automated test runner exists in this repository (unchanged finding from Modules 1–4). Nothing below
is claimed as CI-style automated coverage.

## Build verification

| Command | Result |
|---|---|
| `npx prisma validate` | Valid |
| `npx prisma db push --skip-generate` | "Your database is now in sync with your Prisma schema." No data-loss warning. |
| `npx prisma generate` | Clean |
| `npx tsc --noEmit` | Clean on the second attempt — the first surfaced 27 real type errors (see below), all fixed before proceeding |
| `npm run build` | Clean production build |

### Real type errors caught and fixed

`tsc` caught a genuine root cause: `statusesFor()` originally returned a generic `string[]`, which broke
Prisma's type inference for the *entire* nested `include` clause in each of the four source fetchers
(not just the status filter itself) — a single generic-typed value cascaded into ~20 "property does not
exist" errors across `sources.ts`. Fixed by making `statusesFor()` generic over each model's own status
enum, intersecting the requested statuses against that model's actual valid set (which also correctly
handles Knowledge's 3-state lifecycle having no `REVIEW`, unlike Modules 2–4's 4-state one — requesting
`mode: "review"` against Knowledge now correctly yields zero results instead of a type error). A second,
unrelated bug: `getKnowledgeHistory`'s Knowledge branch tried to `select: { archivedAt: true }` on
`KnowledgeVersion`, which has no such column (Module 1's simpler lifecycle never added one) — fixed by
dropping it from that branch's select and synthesizing `archivedAt: null` in the returned shape instead,
consistent with the Retrieval Result Model's fixed field set.

## Manual verification script

`npx tsx`, calling the real library functions directly (`fetchKnowledgeCandidates`,
`fetchProductIntelligenceCandidates`, `fetchProblemIntelligenceCandidates`,
`fetchCareIntelligenceCandidates`, `resolveRelationships`, `rankResults`, `layerAllowed`,
`allowedLayers`) against the real database, plus the real Zod schemas. **34 checks, 34 passed, 0
failed** (one initial failure was a bug in the test's own assertion, not the code — corrected and
re-run; see the note below):

```
PASS: retrieveKnowledge rejects an empty query (never search everything)
PASS: searchKnowledge accepts a keywords-only query
PASS: searchKnowledge rejects empty keywords
PASS: Knowledge retrieval finds the linked item
PASS: PIF retrieval finds the linked item
PASS: PrIF retrieval finds the linked item (via productRelationships)
PASS: CIF retrieval finds the linked item
PASS: Keyword search matches on content text
PASS: Anonymous caller cannot retrieve a CONFIDENTIAL item
PASS: Admin caller can retrieve the same CONFIDENTIAL item
PASS: layerAllowed correctly gates CONFIDENTIAL for anonymous
PASS: layerAllowed correctly allows CONFIDENTIAL for admin
PASS: allowedLayers(ANON) is exactly [PUBLIC]
PASS: Anonymous caller requesting mode:draft is silently downgraded to PUBLISHED (sees v1, never the real v2 draft)
PASS: Admin caller requesting mode:draft sees the real draft version
PASS: Default version selector (no mode specified) still returns only PUBLISHED, even for admin
PASS: Knowledge -> Product is direct
PASS: Knowledge -> PIF resolved via shared Product (no direct relation exists)
PASS: Knowledge -> CIF is direct (CIF's own relatedKnowledgeItems)
PASS: CIF -> Product direct
PASS: CIF -> PIF direct
PASS: CIF -> PrIF direct
PASS: CIF -> Knowledge direct
PASS: PrIF -> PIF direct (via productRelationships.productIntelligenceId)
PASS: PrIF -> CIF direct (reverse lookup)
PASS: Relationship resolution respects the caller's layer too (no CONFIDENTIAL leakage via relationships)
PASS: Ranking is deterministic (same input -> identical order across two runs)
PASS: Every ranked result carries a visible matchedFields explanation
PASS: Exact/relationship matches outrank items with no match
PASS: internalMetadata is null for a non-staff caller
PASS: internalMetadata is populated for an admin caller
PASS: No content mutation occurred from any retrieval/ranking/relationship call itself
PASS: Single source retrieval completes well under 2s (actual: 5ms)
PASS: Retrieval logging writes a real, queryable row

34 passed, 0 failed
```

**Self-caught test bug, not a code bug:** the first run asserted an anonymous `mode: "draft"` request
should return *zero* results. It returned one (the real published v1) — which is the code's documented,
correct behavior (silent downgrade to published, not an empty/error response). The test's own
expectation was wrong; fixed to assert the actual intended behavior, then re-run clean. Recorded here
rather than silently rewritten, per this project's own transparency standard.

## Coverage against this module's own Testing Requirements

| Requirement | Verified? |
|---|---|
| Knowledge retrieval | ✅ live |
| PIF retrieval | ✅ live |
| PrIF retrieval | ✅ live (including matching via child-table `productRelationships`) |
| CIF retrieval | ✅ live |
| Relationship resolution | ✅ live — all 9 pairs, both directions where meaningful, both `direct` and `via-product` link kinds |
| Permission filtering | ✅ live — item-level (Confidential hidden from anonymous, visible to admin) and field-level (`internalMetadata`) |
| Layer protection | ✅ live, including confirming relationships never leak a Confidential reference |
| Version resolution | ✅ live — default (published-only), explicit draft for an authorized caller, and the silent-downgrade behavior for an unauthorized one |
| Ranking consistency | ✅ live — determinism verified by running the same ranking twice and diffing output order |
| Read-only enforcement | ✅ by code inspection (no source fetcher, relationship resolver, or ranking function calls any Prisma mutation method) plus structural confirmation in the test run |
| TypeScript | ✅ `tsc --noEmit` clean, after fixing real errors it caught |
| Prisma | ✅ `prisma validate`/`db push`/`generate` all clean |
| Production Build | ✅ clean |
| Performance sanity checks | ✅ a single source-type retrieval completed in single-digit milliseconds against the real database — far under any reasonable threshold |

## What was not tested, honestly

- `resolveCallerClearance()` itself was not exercised through a real Next.js request/session — the test
  script constructs `CallerClearance` objects directly and passes them to the library functions, the
  same approach used for RBAC-adjacent logic in every prior module (no test runner exists to script a
  real authenticated session).
- The 8 Server Actions in `actions/retrieval.ts` were not called directly (they wrap `auth()`, which
  needs a request context) — their underlying library functions (which contain all the real logic) were
  tested directly instead, and the actions themselves were confirmed via `tsc`/`build` to type-check and
  compile correctly.
- The `RetrievalCache` interface/`InMemoryRetrievalCache` implementation exists and is simple enough to
  read for correctness, but has no dedicated test — it isn't wired into the pipeline yet (see
  `known-limitations.md`), so there was nothing live to exercise it against.
- Metrics aggregation (count/avg-duration/etc. over `KnowledgeRetrievalLog`) was not implemented as a
  callable function in this pass — see `known-limitations.md` — so nothing to test there either.
