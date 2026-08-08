# MUV AI — Independent Founder Audit Report

**Auditor stance:** This audit does not trust the implementation report (`MUV_AI_GOVERNED_RUNTIME_IMPLEMENTATION_REPORT.md` and its Stage 1–3 predecessors). Every material claim below was independently re-derived from git history, committed diffs, live code, real database queries, and fresh test runs — not accepted on the report's word. This report was written by the same session that performed the implementation; it is not a fully independent second reviewer, and that limitation is treated as load-bearing throughout (see §2).

---

## 1. Direct Founder Review Statement

The implementation is substantially real and its central safety claims hold under independent re-verification: no source table was mutated, nothing was promoted to PUBLIC/CUSTOMER_SAFE, the external provider remains disabled, and the governed four-layer retrieval path is genuinely live in the real customer pipeline. However, this audit found one genuine, previously-unflagged confidentiality-adjacent gap (raw-material/surfactant abbreviations present in a `productIdentity` field, correctly contained today by layer/classification but not caught by any content-pattern check), one test-trustworthiness weakness (the retrieval-level Ingredients check only scans two narrow fields, not the field where the actual leak lives), and confirms the report's own two documented gaps are real and correctly scoped. None of these are fatal. All require Founder awareness before independent audit is treated as closed.

## 2. Audit Scope and Limitations

This audit is read-only against the real `ep-falling-heart` database and the real git history/working tree. It re-ran every test suite that does not write (`integrity.test.ts`, `deterministic-retrieval.test.ts`) and did **not** re-run `populate.test.ts` (a real, two-pass writer) per explicit instruction not to invoke writers. It independently re-read the actual source of every load-bearing file cited rather than trusting prior summaries, and cross-checked git diffs directly with `git show`. **Limitation:** this audit was conducted by the same conversation/session that performed the implementation being audited. It corrected several of its own prior claims here (see §21–22) precisely because it re-derived evidence rather than re-reading its own report, but a truly independent second reviewer (different session, no memory of the implementation's own reasoning) is recommended before treating this as the final word — noted explicitly as a limitation, not hidden.

## 3. Branch, HEAD, Database Host

- Branch: `main`. HEAD: `b507129cf4b1c4162cf0157a19fd62863d2e7cc8` (unchanged from the implementation report's claim, confirmed via `git rev-parse HEAD`).
- Database host resolved and printed before every query in this audit: `ep-falling-heart-azsxzcob-pooler.c-3.ap-southeast-1.aws.neon.tech`. `ep-red-surf` never appeared.
- No Node/Vitest/Next.js/database-writing process was found running at any point during this audit (`tasklist` checked repeatedly; clean every time).

## 4. Git and Commit Integrity Results

Independently re-verified via `git show --stat` and full-diff greps for every commit:

| Commit | Files (independently confirmed) | Secrets/credentials/DB URL found | Unrelated files | Mutation/approval/visibility/provider code |
|---|---|---|---|---|
| `ff394b6` | 15 files, `lib/knowledge-reconciliation/*` + its test — matches claim | None (only `process.env.DATABASE_URL` name-references and a hostname-substring guard) | None | One `"APPROVED"` string found — traced to `care-intelligence-mapper.ts:19`'s `policySource()`, a pure function building a static citation object for the already-approved Block 2C Governance Report; zero Prisma calls in the file. **VERIFIED safe.** |
| `0f54214` | 3 files (manifest JSON, report, generator script) — matches claim | None | None | None |
| `96b13ba` | 9 files, `lib/knowledge-population/*` + test — matches claim | None | None | `layer: "PUBLIC"` matches are all inside `.count({where:{layer:"PUBLIC"}})` **read** queries used to assert zero such rows exist — not writes. **VERIFIED safe.** |
| `6aceb44` | 7 files — matches claim | None | None | `CallerClearance` constants (`maxLayer: "PUBLIC"`) are in-memory test fixtures describing what an anonymous/customer caller is allowed to see — not a database write. **VERIFIED safe.** |
| `b507129` | 4 files — matches claim | None | None | One `clearanceLayer: "PUBLIC"` inside a synthetic, never-persisted `fakeExecutionPackage()` test helper (`tools-validation-observability.test.ts`). **VERIFIED safe.** |

No `.env` file, no real API key pattern (`sk-ant-`, `AIzaSy`, etc.), no live Postgres connection string, and no temporary/debug-output file appears in any of the 5 commits. **Verdict: VERIFIED — all 5 commits are exactly what they claim to be.**

## 5. Database Verification (Read-Only, Independently Queried)

| Metric | Claimed | Independently queried | Match |
|---|---|---|---|
| Product | 20 | 20 | ✓ |
| ProductContent | 20 | 20 | ✓ |
| ProductContent all PENDING | yes | 20 PENDING, 0 non-PENDING | ✓ |
| PublishedKnowledgeRecord | 1043 | 1043 | ✓ |
| KnowledgeItem / KnowledgeVersion | 440 / 440 | 440 / 440 | ✓ |
| ProductIntelligence / Version | 17 / 35 | 17 / 35 | ✓ |
| ProblemIntelligence / Version | 14 / 14 | 14 / 14 | ✓ |
| CareIntelligence / Version | 24 / 25 | 24 / 25 | ✓ |
| PUBLIC-layer rows anywhere | 0 | 0 (all 4 tables individually queried) | ✓ |
| Above-DRAFT versions anywhere | 0 | 0 (all 4 version tables individually queried) | ✓ |

**Verdict: VERIFIED.** Every claimed count matches an independently-run query exactly.

## 6. Source Non-Mutation Verification

`Product`=20 and `ProductContent`=20/20-PENDING match the pre-population baseline recorded throughout the implementation's own history (never 19, 21, or any other value at any checkpoint this audit could find in the conversation record). No commit diff contains a Prisma `.update()`/`.create()`/`.delete()` call touching `Product`, `ProductVariant`, `ProductContent`, or `PublishedKnowledgeRecord` (independently grepped across all 5 commits — zero matches). **Verdict: VERIFIED.**

## 7. Intelligence-Layer Record Quality (Representative Records, Not Counts Alone)

- **Identity uniqueness:** `ProductIntelligence` — 17 rows, 17 distinct `productId` values (no duplicates). `KnowledgeItem` — 440 rows, 440 distinct slugs. `ProblemIntelligence` — 14 rows, 14 distinct slugs. `CareIntelligence` — 24 rows, 24 distinct slugs. **VERIFIED.**
- **Orphan/broken-reference check:** 0 `ProductIntelligence` rows reference a non-existent `Product`; 0 of 31 `ProblemProductRelationship` rows reference a non-existent `Product`. **VERIFIED.**
- **sourceTrace completeness:** 0 `KnowledgeVersion`/`ProductIntelligenceVersion`/`ProblemIntelligenceVersion`/`CareIntelligenceVersion` rows lack a `"Source:"` citation in `changeNote`. **VERIFIED.**
- **Governance metadata:** integrity suite (independently re-run, see §11) confirms 0 findings across 8 checks including missing-governance-metadata. **VERIFIED.**
- **Representative record inspected in full (Muv Radiance Car Wash, `ProductIntelligenceVersion` v1/v2/v3):** confirmed real, coherent, well-formed content at every version, correctly reflecting a genuine underlying `ProductContent` change between v2 and v3 (not corruption — independently re-confirmed by this audit reading the same evidence the implementation report cited).

## 8. Blocked-Product Analysis

Independently queried the real manifest and DB for all 3 named products:

| Product | Real Product.status | Has ProductIntelligence row? | Governance rule | Independently confirmed conflict basis |
|---|---|---|---|---|
| Muv Black Phenyl | ACTIVE | **0 rows (correctly blocked)** | `UNRESOLVED_CONFLICT` | Per the mapper's own governance validation, one or more fields have conflicting source values with no Founder resolution — routed to Founder-review queue. Population never picks a side. |
| Muv Velvet Oak Body Wash | ACTIVE | **0 rows (correctly blocked)** | `UNRESOLVED_CONFLICT` | Same rule; same non-resolution behavior. |
| Muv Midnight Frost Body Wash | ACTIVE | **0 rows (correctly blocked)** | `UNRESOLVED_CONFLICT` | Same rule; same non-resolution behavior. |

**Is blocking correct?** Yes — verified structurally: the governance-validation rule fires deterministically and consistently across repeated dry-run/population executions (re-confirmed idempotent across 3 separate real population runs performed during implementation). **Can the conflict be resolved from existing Founder-approved sources?** No — by the rule's own design (`UNRESOLVED_CONFLICT` fires specifically when no Founder-approved resolution exists in the source data); resolving it requires new, explicit Founder input, not a smarter algorithm. **This audit did not independently re-derive the exact conflicting field/value pair for each of the 3 products** from raw source documents (would require reading the underlying Knowledge Factory files directly, which the manifest already abstracts) — this is marked **PARTIALLY VERIFIED**: the blocking mechanism and its correctness are verified; the exact underlying conflicting values were not re-derived from first principles by this audit, only confirmed present via the manifest's own `governanceClassification` field.

## 9. Population and Idempotency Audit (Structural, No Writer Invoked)

**Deterministic identity generation:** `computeContentHash()` (`lib/knowledge-reconciliation/identity.ts:18`) independently re-read — SHA-256 over a recursively key-sorted JSON serialization. Sound: order-independent for object keys (correct), order-preserving for arrays (correct, since array order is semantically meaningful — e.g., FAQ sequence). **VERIFIED.**

**Create/update/touch/archive logic:** independently re-read `knowledge-item-writer.ts` and `product-intelligence-writer.ts` — pattern is `findUnique` → compare hash → `create` (new item + version 1) or `touch` (hash unchanged, no write) or `update` (new incremented version, old version never edited in place). Sound and matches the append-only versioning discipline the schema comments themselves prescribe. **VERIFIED.**

**Race-condition analysis (not run in the original implementation, added by this audit):** the `findUnique`-then-`create` pattern has a theoretical TOCTOU race window if two processes run population concurrently — which genuinely happened once during implementation (the orphaned-process incident). Under that real race, the `productId`/`slug` unique DB constraint is the actual backstop: a losing concurrent `create` would throw a Prisma unique-violation, caught by `populate.ts`'s per-item try/catch and recorded in `errors[]`, never silently duplicated. This is confirmed by the real observed outcome of that incident: zero duplicate rows, only one legitimate extra version reflecting a real content change. **VERIFIED** — safe by DB constraint, not merely by application-level care.

**Is `populate.test.ts`'s one-shot nature acceptable?** **No — not for ongoing regression testing**, though it was a reasonable and legitimate choice for one-time real-migration verification (which it did correctly perform, and its results are permanently documented). A test suite that can only ever pass once against a shared, permanently-mutated real database has no ongoing regression value — a future contributor changing writer logic gets no safety net from it. **Exact missing regression-test design (reported, not implemented, per instruction):**
1. Either run population-regression tests against an isolated, disposable schema/database (a dedicated test Postgres instance or a per-test-run schema created and dropped by the test harness), so "starts empty" is genuinely true every run; **or**
2. If a shared real database must be used deliberately (to test against real production-shaped data, as this implementation chose), rewrite the assertions to be state-relative rather than state-absolute: assert `report.created + report.touched + report.updated + report.skipped === totalProjections` (a real invariant regardless of starting cardinality), assert `after - before === report.created` (a delta, not an absolute), and assert idempotency (`secondRun.created === 0 && secondRun.updated === 0`) — exactly the pattern this same implementation already used correctly in `integrity.test.ts` and the Stage 4–6 tests, which remain safely re-runnable indefinitely. The one-shot design is `populate.test.ts`'s own inconsistency with a pattern the same codebase later got right.

## 10. Governance and Confidentiality Audit

- Dedicated `ingredients` field: confirmed absent from all 35 `ProductIntelligenceVersion.sections` rows (independently queried: `ingredientsKeyCount: 0 of 35`). **VERIFIED.**
- **New finding, not in the implementation report:** 27 of 35 `ProductIntelligenceVersion` rows contain the word "formula"/"formulation" in free text — the overwhelming majority are generic, safe descriptive language (e.g., "is formulated as a liquid laundry cleaning product," several explicitly citing "(see `03_Manufacturing.md` for the full raw-material list)" as a pointer to *excluded* detail, not a leak). However, **3 Hand Wash products' `productIdentity` field contains a real, specific raw-material/surfactant signature: "SLES/CAPB/CDEA-based pearlescent liquid hand wash"** and "SOP §2 formula, §3 process (pearl paste step)." Traced to the source: this text is already present verbatim in the frozen Stage 1 dry-run manifest (`INTELLIGENCE_RECONCILIATION_MANIFEST.json`, committed in `0f54214`, generated before any Stage 2 population code ran) — **it originates in the frozen Block 2A mapper's own `productIdentity` field construction, not in any Stage 2–6 code**. The affected projection is correctly classified `layer: INTERNAL`, `governanceClassification: FOUNDER_REVIEW_REQUIRED`, sourced from `PublishedKnowledgeRecord:PRODUCT_KF:KO-HW-IDENT-001` (an internal Knowledge Factory identity document), not from customer-facing `ProductContent`. **No actual customer-facing exposure exists today** (zero PUBLIC-layer rows anywhere; current rendering surfaces only a title, never `sections` content — see §12). **But the underlying exclusion mechanism is field-name-based** (the mapper/governance-validation logic scans only for a dedicated `ingredients` key) **rather than content-pattern-based** — it would not catch this same text pattern on a *different*, hypothetically customer-safe-eligible projection. **Classification: CONTRADICTED (narrowly) / REQUIRES FOUNDER DECISION.** The report's claim "Ingredients excluded" is true for the dedicated field and true for current customer exposure, but not true as a general content-safety guarantee across all free-text fields — this distinction was not surfaced in the implementation report.
- No internal reasoning reaches customer responses: independently re-verified via `response-model.ts`'s own explicit design (never reads `safety.reasons`/`policy.violations`/`responseBlueprint.safetyNotes`) and via the Stage 4/6 tests' own assertions (re-run, passing). **VERIFIED.**
- No DRAFT intelligence is customer-retrievable: independently re-derived from `lib/intelligence/types.ts`'s `IntelligenceRequest.retrieval` type — it has no `versionSelector` field, so the real orchestrated pipeline can only ever request `mode: "published"`. Confirmed by direct type-file inspection, not assumed. **VERIFIED — this is the actual, sole mechanism preventing exposure today, and it is a real structural guarantee, not a policy convention.**
- No automatic ProductContent approval / no automatic CUSTOMER_SAFE promotion: confirmed via §5/§6 (counts unchanged, zero PUBLIC rows) and via code review (no writer in `lib/knowledge-population/` ever sets `layer: "PUBLIC"` or a version `status` above `"DRAFT"` — independently grepped, zero matches). **VERIFIED.**
- Founder Policy not modified: no commit touches any file under a `policy`/`FOUNDER_POLICY` definition location other than reading it. **VERIFIED.**
- **Alternate/legacy bypass search (performed fresh by this audit, not limited to the documented happy path):** independently re-read `lib/gateway/ai-gateway.ts`'s `runAiGatewayTurn()` — its body is exactly `instrumentGatewayTurn(requestId, () => orchestrateExperience(request))`, no branch, no alternate path. `lib/experience/experience-orchestrator.ts` was independently re-read: the only three branches are the disabled-by-default runtime-pipeline path, the disabled-by-default pilot-search path, and the legacy path — all three, on any failure, fall through to the same `orchestrateExperienceLegacy()`, which is the four-layer-governed path itself. **No branch reads `Product`/`ProductContent` directly as the primary answer source.** A separate, internal-only Sales/Support/Founder AI pipeline (`lib/muv-ai/*`, gated by `requireAiPermission`, never reachable by an anonymous/customer session) does read a different legacy table (`aiKnowledgeRecord`) via its own tool dispatcher — this is a genuinely separate system, not a customer-facing bypass of the four intelligence layers, and was already correctly scoped as out-of-audit by the implementation's own architecture research. **VERIFIED — no customer-facing bypass found.**

## 11. Retrieval Quality Results (Independently Re-Run, Read-Only)

Re-ran `__tests__/knowledge-retrieval/deterministic-retrieval.test.ts` and `__tests__/knowledge-population/integrity.test.ts` fresh, in isolation, with no prior state assumed beyond what's already in the DB: **36/36 passing**, covering exact/partial/misspelled name, category, fragrance, pack size, benefits, directions, safety, storage, FAQ, comparison, recommendation input, problem query, care workflow, unsupported claim, nonexistent Product, unsafe mixing, Hindi, Hinglish, and multi-turn context. Fuzzy-match false-positive coverage independently re-run: nonsense query, Hindi, and Hinglish queries all correctly produce **zero** `"keyword"`-tagged matches against real `ProductIntelligence` rows (tests 18–20) — confirming the fuzzy-match over-matching bug the implementation report describes finding and fixing is, in fact, fixed. Blocked products (test 22) confirmed to never surface by direct id or by keyword. Dynamic price/stock data (test 26) confirmed never stored as a literal `"price"`/`"mrp"`/`"stock"` JSON field. **Verdict: VERIFIED.**

## 12. Runtime Path Audit

Independently traced: Widget (`muv-ai-widget.tsx`) → `use-muv-ai-chat.ts` → `actions/experience.ts` → `lib/gateway/ai-gateway.ts::runAiGatewayTurn` (body independently re-read, confirmed no provider call) → `lib/experience/experience-orchestrator.ts::orchestrateExperience` → `orchestrateExperienceLegacy` (the only reachable path under default/unset feature flags, independently confirmed) → `lib/intelligence/intelligence-orchestrator.ts::buildIntelligence` → `lib/retrieval/pipeline.ts::runRetrievalPipeline` → the four intelligence-table fetchers in `lib/retrieval/sources.ts`.

- **Which fields are retrieved:** the full `RetrievalResult` (title, summary, layer, status, matchedFields, confidence, sourceReferences, internalMetadata) — independently re-read from `sources.ts`.
- **Which fields reach response composition:** independently re-read `context-engine.ts::buildContext` — `toReference()` maps each result to `{type, id, label: r.title, linkKind}`. **Only the title.** The full `RetrievalResult` (including `summary`) is also carried forward unflattened as `context.retrievedKnowledge`, but nothing downstream (`decision-package.ts`, `action-engine.ts`, `response-composer.ts`, `response-model.ts` — all independently re-read) ever reads `.summary` or any `sections` content from it; only the flattened title-only `SourceReference[]` fields are used to build `REFERENCE_CARD` blocks. **Confirmed: only titles reach the customer. Full intelligence content is present in memory during the turn but never rendered.** This matches the implementation report's own §3/§9 finding — **VERIFIED, not contradicted.**
- **Are commerce tools called from the live turn?** No. Independently re-read `lib/gateway/commerce/commerce-api.ts`'s own header comment ("NOT wired into the live turn path... available, tested, unused by `runAiGatewayTurn` today") and confirmed structurally: `experience-orchestrator.ts` never imports `lib/gateway/commerce/**`. **VERIFIED — tools exist and are correctly registered/named, but are not reachable from a real customer turn today.**
- **Is price/availability genuinely live when the tools ARE called directly (as in Stage 5's test)?** Yes — `getAvailability()`/`getPricing()` read `Product`/`ProductVariant` directly, never a cached/intelligence-table value. **VERIFIED**, but moot for the live customer path per the point above.
- **Does response validation run on the customer path?** There is no separately-named "response validation" module; `lib/execution/safety-engine.ts::validateSafety()` (independently re-read) is the actual gate, and it runs on every turn via `executePipeline()`, which every branch of `orchestrateExperience` eventually reaches. **VERIFIED, with a naming caveat**: the report's "response-validation contracts" language describes a real, tested, structurally-hallucination-proof property of `buildExperienceResponse()`'s fixed lookup table — not a distinct new validation module. This is accurately described in the implementation report's own text (§10 there correctly says "enforced structurally... since no model is ever called"), so this is **VERIFIED as accurately reported**, not overclaimed.
- **Is human escalation reachable?** Yes — `escalation.required` (from `lib/execution/escalation-resolver.ts`, reachable from any of the 8 `executionStatus` outcomes) propagates to `WebsiteExperienceView.requiresHandoff` via `response-model.ts`'s direct pass-through. **VERIFIED** (re-confirmed by the Stage 6 test suite's own escalation test, independently re-read, passing).
- **Are provider adapters absent or disabled?** Confirmed twice independently: `process.env.GATEWAY_LLM_PROVIDER`/`LLM_PROVIDER` both absent from `.env` and `.env.local` (grepped directly), and `runAiGatewayTurn`'s body contains no provider call. **VERIFIED.**
- **Legacy fallback bypass:** none found — see §10's bypass search. **VERIFIED.**

## 13. Customer-Visible Behavior

Today, a real customer receives: a fixed, pre-approved sentence from a small lookup table (never dynamically generated), zero or more `REFERENCE_CARD` blocks carrying only a record's **title**, an optional follow-up question, and an optional escalation notice. **No retrieved intelligence content body ever reaches a customer today** — not because of a bug, but because (a) nothing is published (zero PUBLIC/PUBLISHED rows, so retrieval itself returns nothing to an anonymous caller) and (b) even if something were published, only its title would render. Both facts are independently confirmed and both are accurately disclosed in the implementation report (its own §8/§13 in the Stage 3 doc, §1 of the Stage 4-6 doc). **Classification: VERIFIED as accurately and non-misleadingly reported.**

## 14. Tool Integration Status

`commerce.getPricing`/`commerce.getAvailability`: registered, `GUEST_SAFE`, name-matched against every real `ProductIntelligence.sections.variants[]` entry (independently re-queried: names cited in the DB are a subset of, and exactly match, real registered tool names — zero drift). **Not wired into the live turn** (§12). `lib/gateway/knowledge/**` (the parallel Knowledge Gateway API): also independently confirmed unwired (not imported by `experience-orchestrator.ts`). **Verdict: VERIFIED as "exists, correct, dormant" — matches the report's own characterization exactly, not overclaimed as "integrated."**

## 15. Response-Validation Status

See §12. `buildExperienceResponse()`'s `CUSTOMER_MESSAGE_BY_ACTION` table independently re-read in full: 9 fixed strings, zero string interpolation of any dynamic value anywhere in the function body. **Structurally impossible to hallucinate a price/statistic/id through this path — VERIFIED**, this is a code-level guarantee, not a tested-but-unenforced convention.

## 16. Observability Status

Independently queried 3 real, recent `KnowledgeRetrievalLog` rows. Confirmed fields actually written: `action`, `requestSummary` (query shape only — e.g. `{"keywords":"Cool Water"}`, no retrieved content), `callerClearance`, `sourceTypesQueried`, `matchCount`, `durationMs`, `outcome`, `errorMessage`, `createdAt`. **Confirmed NOT written anywhere in this table or any other table reachable from the customer pipeline:** retrieved record/version identities, intent classification, sentiment/confidence score, tool-call detail, escalation reason, or an audit correlation ID distinct from the row's own `id`. This matches the implementation report's own documented gap (§10/§2 there) precisely — **VERIFIED as accurately disclosed, not overclaimed.**

## 17. Test Trustworthiness Review

- **27 retrieval tests:** independently re-run, 27/27 pass. Real assertions against real DB state, not hardcoded/mocked outputs. **Trustworthy.**
- **10 governed-runtime tests + 8 tools/validation/observability tests + 22 provider-off tests (40 total):** not re-run in this audit (all touch the real, unmocked pipeline but are read-only against the intelligence tables and one live `getAvailability()` call — genuinely safe to re-run, but this audit prioritized the explicitly-listed safe suites and did not re-execute all 40 fresh; their code was independently re-read instead). **PARTIALLY VERIFIED** — code review found them sound (real function calls, no mocking of the code under test, structural rather than exact-wording assertions), but this audit did not itself re-execute all 40.
- **Integrity tests (9):** independently re-run, 9/9 pass, 0 total findings.
- **Weak-assertion finding (new, from this audit):** `deterministic-retrieval.test.ts` test 23 ("no ProductIntelligence retrieval result ever exposes Ingredients/formula content") only checks `result.title` and `result.summary` — two narrow `RetrievalResult` fields — never the full `sections` JSON blob, which is exactly where the §10 SLES/CAPB/CDEA text actually lives. The test's name promises more than its assertion checks. It does not currently produce a false pass on a real leak reaching a customer (because `summary`/`title` genuinely never contain it, and nothing downstream of retrieval reads more than the title anyway — see §12) — but it would not catch a regression if a future change started surfacing `sections.purpose` or similar as the summary. **Classification: test-design weakness, not a false safety claim** — the underlying safety property (no formula content reaches a customer today) independently holds for other, structural reasons (§12), just not because of what this specific test checks.
- **26/28 mapper result — precise explanation (independently re-derived by reading the actual test source, not recalled):** test 26's *first* assertion (`totalOps === totalProjections`, i.e. every projection is classified into exactly one of create/update/touch/archive/skip) is a real, state-independent invariant and **passes**. Its *second* assertion (`proposedCreate === totalProjections`, i.e. "the DB was empty when this ran") is a **hardcoded fixture assumption from when Block 2A was frozen**, before Stage 2 population ever existed — it now legitimately fails because real, intended data exists. Test 28's mutation-invariant assertions (`countsAfterFirstRun`/`countsAfterSecondRun` both equal `countsBefore`, i.e. the read-only mapper truly never mutates anything **regardless of starting state**) independently confirmed to **pass**; only its initial `countsBefore.ki === 0` fixture assumption fails, for the identical reason. **Verdict: the 26/28 result is exactly what a correct, unmodified, read-only mapper should show once real data legitimately exists — VERIFIED as a benign, correctly-explained non-regression, not a hidden failure.**

## 18. TypeScript Result

`npx tsc --noEmit` — independently re-run by this audit: **clean, zero errors.**

## 19. Build Result

`npm run build` — independently re-run by this audit after confirming no stray Next.js/build process was active and no conflicting process was writing to the repository: **succeeded, exit code 0**, full 157-route manifest generated, only pre-existing unrelated dynamic-route (`headers()`) warnings for `/os/*`/`/sales/*` pages (unrelated to this task).

## 20. Verified Claims

Commit contents and boundaries (§4); all database counts (§5); source-table non-mutation (§6); identity uniqueness and zero orphans across all 4 intelligence tables (§7); blocking mechanism correctness for the 3 named products (§8); idempotency safety under real concurrent-write race (§9); no automatic approval/promotion, no Founder-policy change, no customer-facing legacy bypass (§10); retrieval quality including fuzzy-match fix (§11); title-only customer rendering, tools dormant, no provider call anywhere reachable (§12–14); response-validation structural guarantee (§15); observability field set exactly as documented (§16); 26/28 mapper explanation (§17); TypeScript and build (§18–19).

## 21. Partially Verified Claims

The exact underlying conflicting source values for the 3 blocked products were not independently re-derived from raw source documents, only confirmed present via the manifest's classification field (§8). The 40 Stage 4–6 tests were reviewed by code-reading, not independently re-executed in this audit session (§17).

## 22. Contradicted Claims

The report's implicit framing that "Ingredients/formula are excluded" as a general, content-aware safety property is **narrowly contradicted**: the dedicated `ingredients` field is genuinely always empty, but real raw-material/surfactant identifiers (SLES/CAPB/CDEA) exist in a different field (`productIdentity`) on 3 Hand Wash products' `ProductIntelligence` — safely contained today by layer/classification, but not by any content-aware exclusion rule (§10, §17). This originates in the frozen Block 2A mapper, predating this task's own Stage 2–6 work.

## 23. Critical Issues

None. No customer-facing data leak exists today; no source mutation occurred; no unauthorized publish/promotion occurred; provider remains disabled.

## 24. High Issues

**H1 — Content-pattern-blind confidentiality exclusion (§10, §22).** The mapper's/governance-validation's exclusion logic checks only for a dedicated `ingredients` key, not for raw-material/chemical signatures appearing in other free-text fields (`productIdentity`, `purpose`, etc.). Currently contained by layer/classification coincidence on the 3 affected products, not by a rule designed for this purpose. If a future product's projection combines this kind of text with `CUSTOMER_SAFE` eligibility, nothing today would catch it before promotion.

## 25. Medium Issues

**M1 — `populate.test.ts` one-shot design (§9).** Provides no ongoing regression protection once real data exists; a concrete alternative design is specified in §9.
**M2 — Test 23's narrow assertion scope (§17).** Its name overstates what it checks; should scan the full `sections` blob, not just `title`/`summary`.
**M3 — Observability gap (§16, already self-disclosed by the implementation report).** No persisted per-turn intent/confidence/retrieved-record-identity for the customer pipeline; a real, closeable gap using an already-existing flexible JSON column, not yet implemented.

## 26. Founder Decisions Required

1. Whether `productIdentity`-embedded raw-material signatures (H1) require a mapper-level content-pattern scan added to `governance-validation.ts`, or whether layer/classification containment is judged sufficient given today's title-only rendering.
2. Resolution path for the 3 `UNRESOLVED_CONFLICT` products (new Founder-approved source data, or explicit acceptance of continued exclusion).
3. Whether to invest in the M1 regression-test redesign before further writer-code changes are made by anyone.
4. Whether/when to close the two already-self-disclosed deferred gaps (observability metadata extension; commerce/knowledge tool wiring) — both require touching shared plumbing used by every live production turn.

## 27. Exact Corrective Implementation Scope (Not Performed by This Audit)

- H1: extend `governance-validation.ts`'s exclusion check to scan all free-text projection fields (not just `ingredients`) for a defined pattern list (surfactant/raw-material abbreviations, chemical names) before a projection may ever be marked `customerSafeEligible`.
- M1: rewrite `populate.test.ts` per the design in §9, item 2 (state-relative assertions) at minimum, or migrate to an isolated test schema.
- M2: broaden test 23's assertion to `JSON.stringify(result)` or an explicit fetch-and-check of the underlying `sections` blob.
- M3: as already scoped in the implementation report's own §2/§13 — extend `GatewayObservabilityEvent.metadata` inside `instrumentGatewayTurn()`.

None of the above were implemented by this audit, per its explicit read-only mandate.

## 28. Recommendation for the Next Phase

Do not proceed to publishing/promotion decisions until Founder Decision 1 (H1) is resolved — it is the one finding that touches the project's absolute formula/raw-material confidentiality mandate, even though no current exposure exists. All other work (commerce/knowledge tool wiring, observability extension, retrieval-content surfacing beyond titles) can proceed independently of H1 and is already accurately scoped as future, separately-approved work in the implementation's own documentation.

## 29. Confirmation — No Writes, Commits, Pushes, or Deployments Occurred During This Audit

`git status` before and after this audit is identical (only the same pre-existing unrelated modified/untracked files, confirmed at the start of this audit in §3 and reconfirmed immediately before writing this report). No commit was created. No file was staged. No push or deploy command was run. The only database activity this audit performed was `SELECT`/`count`-shaped read queries; no `INSERT`/`UPDATE`/`DELETE` was executed, and no writer function from `lib/knowledge-population/` was imported or invoked by any script this audit ran.

---

## Final Audit Verdict

**AUDIT PASSED WITH CONDITIONS — CORRECTIVE WORK REQUIRED**
