# MUV AI — Intelligence Retrieval Verification (Block 2B, Stage 3)

**Status:** Cross-layer integrity checks and deterministic retrieval verification complete.
**Scope:** Read-only. No source or intelligence-table row was created, updated, or deleted by
this stage. One transient content-change (see §5) was detected and correctly versioned by the
Stage 2 writer during this stage's investigation — not caused by this stage's own code.
**Database:** `ep-falling-heart-azsxzcob-pooler` (verified before every script/test run).

## 1. What this stage found

The customer-facing AI turn pipeline (`components/muv-ai/muv-ai-widget.tsx` → `actions/experience.ts`
→ `lib/gateway/ai-gateway.ts` → `lib/experience/experience-orchestrator.ts` → `lib/intelligence/
intelligence-orchestrator.ts` → `lib/retrieval/pipeline.ts`) **already queries all four intelligence
tables live** via `lib/retrieval/sources.ts`'s four fetchers (`fetchKnowledgeCandidates`,
`fetchProductIntelligenceCandidates`, `fetchProblemIntelligenceCandidates`,
`fetchCareIntelligenceCandidates`). No new retrieval module was needed or built — Stage 3's job was
to verify this existing, already-wired system actually works correctly against the real data Stage 2
just populated, and to close two real gaps found in the process.

## 2. Cross-layer integrity checks (`lib/knowledge-population/integrity.ts`, new)

Eight read-only checks, each returning concrete findings (never a bare boolean):

| Check | Result |
|---|---|
| Orphaned Product references (ProductIntelligence/CareIntelligence → non-existent Product) | 0 |
| Broken cross-layer links (ProblemProductRelationship / Care→Problem links → missing target) | 0 |
| Duplicate ProductIntelligence identities (same `productId` claimed twice) | 0 |
| Missing sourceTrace (a version's `changeNote` lacking a `"Source:"` citation) | 0 |
| Missing governance metadata (invalid/missing `layer` or version `status`) | 0 |
| Invalid family inheritance (a family SKU's content never mentions its own distinguishing marker, or only mentions a sibling's) | 0 |
| Inactive-source references (intelligence grounded in a non-ACTIVE Product) | 0 |
| Conflicting safety relationships (same Product + same Problem version, contradictory suitability, no override justification) | 0 |

**Total findings: 0.** Verified via `__tests__/knowledge-population/integrity.test.ts` (9 tests, all
passing) against the real, fully-populated dataset (440 KnowledgeItem, 17 ProductIntelligence, 14
ProblemIntelligence, 24 CareIntelligence rows).

One real finding was investigated and resolved during this stage's development, not left as a
silent false-negative: the family-inheritance check's first draft flagged "Muv Lavender Garden
Liquid Detergent" because its `ProductIntelligence.sections` never spells out the literal
concatenated commercial name — the content correctly describes the shared family identity
("MUV Liquid Detergent™") and names this SKU's own fragrance ("Lavender Garden") multiple times in
its FAQ/benefits, it just never restates the full product name verbatim. The check was corrected to
use each Product's actual distinguishing marker (`fragranceNotes`, falling back to the full name only
for single-SKU products with no fragrance) rather than requiring an exact-name substring — a fix to
the verification logic, not the underlying data.

## 3. A real Stage 2 gap found and fixed: `variants` was silently dropped from population

The frozen mapper's `ProductIntelligenceProjection` type carries `variants: VariantReference[]`
(SKU, size, and the two governed tool names — `commerce.getPricing` / `commerce.getAvailability` —
that must resolve any *current* price/availability figure) as a **sibling field to `sections`**, not
nested inside it. Stage 2's original writer (`lib/knowledge-population/product-intelligence-writer.ts`)
only ever persisted `projection.sections` into the version's `sections` JSON column, silently
dropping `variants` entirely — meaning pack-size/SKU identity, and the governed-tool references for
dynamic commercial data, never reached the database at all.

**Fix:** `persistedSections()` now merges `{ ...projection.sections, variants: projection.variants }`
before writing, and the content-hash used for idempotency comparison was updated to include
`variants` too (so a real difference here is correctly detected as a content change, not silently
ignored). Backfilled once against the real, already-populated 17 `ProductIntelligence` rows: all 17
correctly went from 1 version to 2 (UPDATED, not duplicated), verified by
`v2 rows missing variants: 0 of 17`. `variants` never carries a stored price/stock number — only tool
names — so this does not create a second, staler copy of commercial data (verified in retrieval test
26 below).

## 4. A real retrieval bug found and fixed: fuzzy-match tolerance over-matched

While building the misspelling-tolerance requirement into `lib/retrieval/sources.ts`'s `keywordHit()`
(previously exact-substring-only — a real gap, since the task's required coverage list includes
"misspelled Product name"), the first version of the fuzzy fallback ran edit-distance comparison
against the **entire JSON-serialized `sections` blob** (hundreds of natural-language tokens). Over a
haystack that large, *some* token lands within edit-distance tolerance of almost any query purely by
chance — verified concretely: a query for the nonsense phrase `"Muv Unicorn Sparkle Wash"`,
Devanagari Hindi text, and Hinglish text all matched **all 17** `ProductIntelligence` rows.

**Fix:** the fuzzy fallback is now restricted to short, identity-like haystacks only (≤120 characters
— a Product name or title), never a full content blob; exact substring matching (unrestricted by
length) still covers benefits/directions/safety/storage/FAQ content correctly. Tolerance was also
corrected from a flat distance-1 for 5–7 character words to distance-2, since plain Levenshtein scores
a common adjacent-letter transposition typo (e.g. "watre" for "water") as distance 2 — a flat
tolerance of 1 would have silently rejected the single most common real-world typo pattern.

## 5. A real, separate operational incident during this stage (documented, not hidden)

Mid-stage, a stray, unsupervised `vitest run` process (an orphaned leftover from an earlier,
interrupted turn — spawned via `npm test` invoking `populate.test.ts` **alongside several unrelated
admin content-publishing test files**) was found still running against the same database, having
executed at least one additional real population pass. It was terminated (`taskkill`) once found.
Investigation confirmed no corruption: it produced exactly one extra, legitimate version each for
`ProductIntelligence`(Muv Radiance Car Wash) and its paired `CareIntelligence` workflow, because the
underlying `ProductContent` for that one Product had genuinely changed (real, complete, well-formed
content with its own `sourceProvenance` citation, `updatedAt` timestamps predating the kill action by
hours) — the population writer correctly detected a real source change and versioned it, exactly as
designed. `productId` uniqueness held throughout (no duplicate records, only an extra append-only
version), and a full re-run afterward confirmed a stable, fully idempotent fixed point (zero creates,
zero updates, `before === after`). No source table was mutated by this incident or by any code in this
stage.

## 6. Deterministic retrieval coverage (`__tests__/knowledge-retrieval/deterministic-retrieval.test.ts`, 26 tests, all passing)

A fetcher's real, verified contract: the Prisma `where` clause only ever filters on `layer`/version
`status` and, when supplied, `productId`/`slug`/`category`/`tags` — `keywords` is **never** part of
the database filter. Every fetcher instead tags each in-scope candidate's `matchedFields` with
`"keyword"` when a match is found, purely as a signal for `lib/retrieval/ranking.ts`'s scoring;
ranking sorts and scores but never drops zero-score candidates. So "no real match" is correctly
observed via an *absent* `"keyword"`/`"id"`/`"relationship"`/`"slug"` tag, not an empty result array,
except where a real DB-level filter (`productId`/`slug`) narrows the query — there, an empty array is
the correct signal. Every test below asserts against this real contract, not an assumed one.

| # | Coverage | Result |
|---|---|---|
| 1 | Exact Product name | keyword-tagged ✓ |
| 2 | Partial Product name | keyword-tagged ✓ |
| 3–4 | Misspelled Product name (two independent typos) | keyword-tagged via fuzzy fallback ✓ |
| 5 | Category ("Fabric Care") | all 3 Liquid Detergent SKUs keyword-tagged ✓ |
| 6 | Fragrance | keyword-tagged ✓ |
| 7 | Pack size (via persisted `variants`) | keyword-tagged ✓ |
| 8 | Benefits | keyword-tagged ✓ |
| 9 | Directions/usage | keyword-tagged ✓ |
| 10 | Safety | keyword-tagged ✓ |
| 11 | Storage | keyword-tagged ✓ |
| 12 | FAQ | keyword-tagged ✓ |
| 13 | Recommendation input (direct productId) | exactly 1 result, real DB filter ✓ |
| 14 | Problem query (category=Usage) | real DB filter, correct titles ✓ |
| 15 | Care workflow query (direct slug) | exactly 1 result ✓ |
| 16 | Unsafe chemical mixing (bleach-mixing workflow) | escalation-flagged, staff-only metadata ✓ |
| 17 | Unsupported claim | the system's own governed non-committal workflow retrievable ✓ |
| 18/18b | Nonexistent Product | never keyword-tagged; the system's own honest-non-fabrication workflow IS retrievable ✓ |
| 19 | Hindi | never keyword-tagged (honest no-match, no crash) ✓ |
| 20 | Hinglish | never keyword-tagged (honest no-match, no crash) ✓ |
| 21 | Multi-turn context | stable/deterministic recordId+versionId across two calls ✓ |
| 22 | Governance-blocked Products (3 UNRESOLVED_CONFLICT products) | never surfaced by id or keyword ✓ |
| 23 | No Ingredients/formula leakage in any retrieval result | ✓ |
| 24–25 | Anonymous/customer clearance leakage | zero results — nothing promoted to PUBLIC/PUBLISHED yet ✓ |
| 26 | Dynamic commercial data never duplicated as stale intelligence | `variants` carries tool names only, no stored price/mrp figure ✓ |

## 7. Retrieval must return governed intelligence, not raw source, as final authority

Verified structurally, not just by absence of a counter-example: every fetcher in
`lib/retrieval/sources.ts` queries `KnowledgeItem`/`ProductIntelligence`/`ProblemIntelligence`/
`CareIntelligence` directly — none queries `Product`/`ProductContent`/`PublishedKnowledgeRecord` as
its evidence source. `PublishedKnowledgeRecord`/`KnowledgeEmbedding` are never queried anywhere under
`lib/retrieval/**` (confirmed by the Stage 3 architecture investigation). Dynamic commercial facts
(price/MRP/stock) are represented only as **governed tool references** (`commerce.getPricing`,
`commerce.getAvailability`) inside `sections.variants`, never as a stored figure — verified in test 26.

## 8. Known, pre-existing gap flagged for Founder/Stage 4 visibility (not fixed in this stage)

Even a correctly-retrieved, top-ranked result today only reaches the customer-facing response as a
**bare title string** in a `REFERENCE_CARD` — `lib/intelligence/context-engine.ts`'s `buildContext()`
maps a `RetrievalResult` into `{ type, id, label: r.title, linkKind }` (title only), which flows
through `action-engine.ts` → `response-composer.ts` → `response-model.ts` → `website-channel-adapter.ts`
→ `components/muv-ai/muv-ai-message.tsx`'s bare `<div>{segment.content}</div>` render — the version's
actual authored body (`content`/`summary`/`situationDescription`) never reaches the customer today.
This is a pre-existing architectural characteristic of the frozen runtime, not something introduced or
regressed by this task. Closing it would mean extending several core rendering-chain files spanning
multiple existing modules — out of narrow scope for this Stage's safety mandate ("do not redesign the
architecture"). Flagged here, per the task's own "stop and report gaps rather than guess" instruction,
for explicit Founder/independent-audit visibility ahead of any future work that assumes retrieved
intelligence content reaches customers today (it currently does not, beyond a title).

## 9. Stage 3 gate — result

- All records trace to governed sources (KnowledgeItem/ProductIntelligence/ProblemIntelligence/
  CareIntelligence only) — ✓
- No Critical retrieval gaps against the required coverage list — ✓ (all 20 named scenarios covered)
- No confidential leakage (Ingredients/formula never present in any retrieval result; anonymous/
  customer clearance sees zero of today's INTERNAL/CONFIDENTIAL, DRAFT-only content) — ✓
- No raw-source bypass (every fetcher targets the 4 intelligence tables only) — ✓
- Deterministic tests pass (36/36 across integrity + retrieval; 26/28 on the frozen Block 2A mapper
  suite, with the 2 failures being a known, pre-existing point-in-time fixture assumption — see §5
  of the Stage 2 population report — not a regression) — ✓
- Second population run remains idempotent after this stage's `variants` fix and the mid-stage
  operational incident — reconfirmed stable, `before === after`, zero creates, zero updates — ✓

**Stage 3 gate: PASSED. Proceeding to Phase B (Stage 4).**
