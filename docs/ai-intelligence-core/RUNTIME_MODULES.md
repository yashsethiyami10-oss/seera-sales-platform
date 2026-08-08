# MUV AI Runtime Engineering™ — Module Specifications

> Every module addresses all 17 required dimensions. Every module's decision logic is
> deterministic and explainable; every module exposes its reasoning inputs and outputs; every
> runtime step is auditable via a structured trace object, per this task's explicit requirement.

---

# Module 1 — Semantic Retrieval Engine™ (resolves CF-02)

- **Purpose:** Close the natural-language recall gap `ENGINEERING_TEST_REPORT.md` CF-02 named —
  Module 5's existing deterministic keyword-substring matching alone cannot find content phrased
  differently than a query, now that four large, varied-vocabulary Factories are in scope.
- **Responsibilities:** Run the existing Module 5 keyword pipeline unmodified; run a new,
  additive semantic-similarity pass in parallel; merge and re-rank both result sets into one
  ranked list ("Knowledge Ranking," the pipeline's own named second stage for this module).
- **Inputs:** Module 2's intent classification (scopes which Factory/domain to search first);
  the raw user query; session memory (prior-turn context).
- **Outputs:** A ranked `RetrievalResult[]` (Module 5's existing shape, unchanged, so every
  downstream consumer built for it keeps working) plus a new `retrievalMethod` field per result
  (`KEYWORD` | `SEMANTIC` | `BOTH`) for explainability.
- **Execution Flow:** Intent-scoped query → keyword pass (Module 5, unchanged) → semantic pass
  (new, below) → merge, deduplicate by KOID, re-rank by combined score → return top-N.
- **Decision Logic:** A result appearing in both passes ranks above a result appearing in only
  one; among single-pass results, keyword-only ranks above semantic-only for queries scoped to
  an intent with a small, well-known vocabulary (e.g., product SKU codes), and the reverse for
  open-ended natural-language questions — this weighting is itself a fixed, documented rule
  table, not a learned model.
- **Runtime Behaviour:** Both passes always run (no conditional skip) — the semantic pass is
  cheap relative to a generative call and its absence would silently reintroduce CF-02.
- **Dependencies:** Module 2 (intent scoping, runs first per the pipeline order); the codebase's
  existing `lib/retrieval/embedding-service.ts` (V4 governance layer — reused directly per
  Reference Before Create, not reinvented).
- **Cross-module Relationships:** feeds Module 3 (Context Builder) and Module 6 (Conflict
  Resolution, which needs to know if two ranked results disagree).
- **Edge Cases:** A query with zero keyword matches and zero semantic matches above threshold —
  must return an empty result set explicitly, never a low-relevance forced match (this is the
  runtime enforcement of Never-Invent applied to retrieval itself). A Gap-Record-only match (per
  Layer 1's exclusion rule) must resolve to a distinct "known gap" signal, not an empty result —
  **this directly resolves `ENGINEERING_TEST_REPORT.md` MF-01's tension** between "Gap Records
  aren't retrievable" and "the system should recognize a known gap": Gap Records are excluded
  from the *answerable content* index but remain present in a separate, explicitly-flagged
  *gap index* Module 1 also checks, returning a `GAP_RECORD_MATCH` result type distinct from a
  normal empty result.
- **Failure Modes:** The embedding service (currently a deterministic mock vector, per prior
  research) produces low-quality similarity scores until a real model replaces it — this is a
  disclosed, bounded degradation (semantic pass adds no value, keyword pass still works exactly
  as today), not a silent failure.
- **Recovery Logic:** If the semantic pass errors, degrade to keyword-only results (today's
  existing behavior) rather than failing the whole retrieval step.
- **Performance Expectations:** Both passes must complete within the same request; no additional
  round-trip beyond what Module 5 already requires. Exact latency budget is an implementation
  decision (not specified here, consistent with "no application code, no implementation").
- **Validation Rules:** The keyword pass's output for any of the original four source types must
  be byte-identical to pre-integration Module 5 behavior when the semantic pass is disabled —
  this is the mechanism that guarantees zero regression to `ENGINEERING_TEST_REPORT.md` Group 15.
- **Acceptance Criteria:** A representative set of paraphrased natural-language queries (varying
  vocabulary from a KO's actual stored text) retrieves that KO via the semantic pass where the
  keyword pass alone would have missed it.
- **Future Scalability:** The mock embedding vector is replaced by a real model as a future code
  decision, without changing this module's merge/re-rank contract.
- **Founder Constraints:** Never treat a semantic-only, low-confidence match as equivalent in
  authority to a verified keyword-exact match — Module 7 (Confidence Runtime) must weigh
  `retrievalMethod` accordingly, per Constitution Article 4 (Evidence Proportional to Claim).

---

# Module 2 — Intent Intelligence Engine™ (resolves CF-03)

- **Purpose:** Close the missing-classification gap CF-03 named — give the pipeline an explicit,
  first-class owner for "what kind of question is this," so downstream modules stop silently
  assuming it.
- **Responsibilities:** Classify the incoming query into a fixed intent taxonomy; carry that
  classification through the pipeline as a first-class object, not an implicit assumption.
- **Inputs:** Raw user input; session memory (Module 7's existing Memory Engine, unchanged,
  referenced not restated).
- **Outputs:** An `IntentClassification` object: primary intent (one of the fixed taxonomy
  below), a confidence score, and — where ambiguous — a ranked list of candidate intents rather
  than a forced single guess.
- **Execution Flow:** Raw input → pattern/keyword signal scoring against the fixed taxonomy →
  highest-scoring intent selected as primary, others retained as candidates → passed to Module 1
  to scope retrieval.
- **Decision Logic — the fixed taxonomy (deterministic, rule-table-based, modeled directly on
  Module 6's existing EQ/CQ Engine style per Reference Before Create):** `PRODUCT_INQUIRY`,
  `MARKETING_BRAND_INQUIRY`, `INSTITUTIONAL_SALES_INQUIRY`, `FOUNDER_BUSINESS_STRATEGY_INQUIRY`,
  `SAFETY_CRITICAL_INQUIRY`, `COMPLAINT_ESCALATION`, `CREATIVE_REVIEW_REQUEST` (routes directly
  to the appropriate Founder Original IP Gap Record — Image/Video Analysis Engine™ — never
  attempts to perform the review itself), `AMBIGUOUS_INSUFFICIENT_CONTEXT`, `UNKNOWN`. Each
  intent has a fixed keyword/pattern lexicon, exactly like Module 6's existing engines — no
  probabilistic model is the primary classifier, satisfying this task's determinism requirement
  directly.
- **Runtime Behaviour:** Every request receives exactly one primary intent, always, even if that
  intent is `UNKNOWN` — there is no "no classification" state, which is itself what closes CF-03
  (no more silent assumption; every downstream module can rely on this field existing).
- **Dependencies:** None (pipeline-opening module, runs immediately after User Input).
- **Cross-module Relationships:** feeds Module 1 (scopes retrieval), Module 3 (populates
  `businessContext`/`institutionalContext` directly instead of Layer 4's previously-unspecified
  "when relevant" trigger), Module 4 (selects which Founder Intelligence KF reasoning framework
  applies).
- **Edge Cases:** A query genuinely spanning two intents (e.g., an institutional buyer asking a
  safety question) — both are retained as candidates, not collapsed to one; downstream modules
  (3, 4) may consult more than one intent's context/reasoning when candidates are close in
  score.
- **Failure Modes:** A query matching no lexicon entries at all → `UNKNOWN`, routed toward
  Module 8's safety-first honest-uncertainty path, never toward a guessed intent.
- **Recovery Logic:** Stateless per-request classification; no persistence to recover.
- **Performance Expectations:** Must complete before Module 1 begins (it scopes retrieval) —
  this is a hard sequencing dependency, not a parallel step.
- **Validation Rules:** Every one of the fixed taxonomy's intents must have a non-empty
  lexicon before this module is considered complete; `CREATIVE_REVIEW_REQUEST` must never
  attempt image/video analysis itself, only route to the existing reserved Gap Record.
- **Acceptance Criteria:** The 16 Founder Acceptance Simulation categories from
  `ENGINEERING_TEST_REPORT.md` §6 each classify to a sensible primary intent (or correctly to
  `UNKNOWN` for category #16).
- **Future Scalability:** New intents are added the same way Founder Intelligence KF Constitution
  Article 8 governs new rules generally — only after a real, recurring pattern is observed, not
  speculatively.
- **Founder Constraints:** This module never makes a final business decision — it only labels
  the question; Module 4/5 retain all actual reasoning/decision authority.

---

# Module 3 — Context Builder™ (extends former Layer 4)

- **Purpose:** Assemble the full situational context every downstream module reasons over, now
  with an explicit input (Module 2) instead of an unspecified trigger.
- **Responsibilities:** Everything the former Context Engine did (assemble `IntelligenceContext`
  from retrieved knowledge, customer goal, referenced products/care workflows) — unchanged —
  plus deterministic population of `businessContext`/`institutionalContext` directly from
  Module 2's classification.
- **Inputs:** Module 1's ranked retrieval results; Module 2's `IntentClassification`; session
  memory (Layer 7, unchanged, referenced not restated).
- **Outputs:** `IntelligenceContext` — the existing shape, now always deterministically populated
  rather than conditionally "when relevant."
- **Execution Flow:** Unchanged assembly logic; the only change is the population trigger for
  the two previously-opaque fields, now driven by Module 2's `primaryIntent` value directly
  (e.g. `primaryIntent == INSTITUTIONAL_SALES_INQUIRY` → populate `institutionalContext`).
- **Decision Logic:** A simple, fixed mapping table from intent → which context fields populate
  — deterministic by construction.
- **Runtime Behaviour:** No change to existing Context Engine runtime characteristics.
- **Dependencies:** Module 1, Module 2.
- **Cross-module Relationships:** feeds Module 4, Module 5, Module 6 (unchanged from the prior
  architecture's Layer 4 relationships) plus Layer 10 (Care Engine, unchanged, referenced not
  restated).
- **Edge Cases:** Same as the prior architecture's Layer 4 — unchanged.
- **Failure Modes:** Same as prior — unchanged.
- **Recovery Logic:** Same as prior — stateless, no persistence to recover.
- **Performance Expectations:** No new cost beyond Module 1/2's own — this module remains pure
  assembly.
- **Validation Rules:** A retail session (Module 2 classifies `PRODUCT_INQUIRY` with no
  institutional signal) must produce a `IntelligenceContext` with `institutionalContext` empty,
  byte-identical to the pre-Module-2 baseline — this is the regression guarantee.
- **Acceptance Criteria:** `businessContext`/`institutionalContext` populate correctly and
  deterministically for every intent in Module 2's taxonomy that warrants them.
- **Future Scalability:** New intents automatically get context-population behavior once added
  to Module 2's taxonomy and this module's mapping table, without further Context Builder
  redesign.
- **Founder Constraints:** Context assembly never bypasses Module 1's retrieval permission
  filtering — it assembles what was already legitimately retrieved, never a shortcut around it.

---

# Module 4 — Founder Reasoning Runtime™ (resolves CF-04, hosts the CF-01 mechanism)

- **Purpose:** Give Founder Intelligence Knowledge Factory's reasoning frameworks real runtime
  execution, closing CF-04's finding that the prior architecture only *cited* them without
  applying them; simultaneously host the Founder Decision Registry that resolves CF-01's
  mechanism gap.
- **Responsibilities:** Select the Founder Intelligence KF reasoning framework(s) relevant to
  the current intent; evaluate the live situation against that framework's structure (the
  fourteen-field Founder Decision Model); maintain and query the Founder Decision Registry.
- **Inputs:** Module 2's `IntentClassification`; Module 3's `IntelligenceContext`; the Founder
  Decision Registry (below).
- **Outputs:** A `ReasoningTrace` object: which Founder Intelligence KF KOID(s) were selected,
  the Decision-Model fields populated from the live situation (Situation, Context, Objective,
  Options Considered, Reasoning, Trade-offs — the fields meaningfully answerable at runtime, per
  Founder Intelligence KF's own honest-thinness allowance for fields not always applicable), and
  a `preferredDirection` label (not a final decision — that remains Module 5's role).
- **Execution Flow:** Intent → framework selection (fixed mapping, e.g. `INSTITUTIONAL_SALES_
  INQUIRY` → `KO-FD-SI-001`/`KO-FD-SI-002`; `FOUNDER_BUSINESS_STRATEGY_INQUIRY` →
  `KO-FD-BU-001`/`KO-FD-BU-002`/`KO-FD-BU-003`) → Decision Model fields populated from
  `IntelligenceContext` → Founder Decision Registry consulted for any on-point, dated entry that
  overrides or refines the selected framework's default guidance → `ReasoningTrace` produced.
- **Decision Logic — the Founder Decision Registry, the CF-01 resolution:** A live, queryable,
  append-only ledger, structurally identical to the real, already-proven `FOUNDER_RULES.md`
  pattern (Product Knowledge Factory) — each entry has a date, scope, decision text, and status.
  Every module that needs authority (this one, and Module 6) queries it before falling back to
  static Factory content. **Honest disclosure, not silently resolved:** this registry's
  *mechanism* is fully specified here; its *content* — specifically, confirmed entries for
  OI-001, OI-002, OI-003, and Task 3's flagged items from `FOUNDER_DECISION_PACKET.md` — remains
  unconfirmed, exactly as `ENGINEERING_TEST_REPORT.md` CF-01 found. This module does not assume
  they were entered.
- **Runtime Behaviour:** Framework selection and Decision-Model population are always
  deterministic (fixed mapping + structured field extraction); only the Registry's *content* is
  Founder-authored, never system-generated.
- **Dependencies:** Module 2, Module 3.
- **Cross-module Relationships:** feeds Module 5 (Decision Runtime consumes `preferredDirection`
  as one input among several, never as an automatic final decision) and Module 6 (Conflict
  Resolution queries the same Registry).
- **Edge Cases:** An intent with no clean Founder Intelligence KF framework mapping — the module
  states this honestly (`frameworkSelected: null, reason: "no evidenced framework for this
  intent"`) rather than force-fitting an unrelated KOID, per Founder Intelligence KF's own
  Article 3.
- **Failure Modes:** A Registry query returning multiple conflicting on-point entries (e.g., an
  entry later superseded but not marked as such) — must surface all matching entries with their
  dates, never silently pick one, and must escalate the ambiguity itself as a data-quality
  finding.
- **Recovery Logic:** The Registry is append-only and durable by construction (mirrors
  `FOUNDER_RULES.md`'s own never-delete discipline) — no entry is ever "lost" in a way requiring
  recovery.
- **Performance Expectations:** Framework selection is a fixed lookup, sub-millisecond in
  principle; Registry query cost scales with ledger size, bounded by the same considerations as
  any append-only log lookup.
- **Validation Rules:** Every `ReasoningTrace` must cite a real, checkable Founder Intelligence
  KF KOID or Registry entry ID — never an invented framework name.
- **Acceptance Criteria:** For each of Module 2's non-`UNKNOWN` intents, a `ReasoningTrace` is
  produced citing at least one real KOID, or explicitly states none exists.
- **Future Scalability:** As Founder Intelligence KF's own Gap Records (`KO-FD-GAP-001`,
  `KO-FD-GAP-002`) receive real Founder Decisions, those decisions enter the Registry directly —
  this module's framework-selection mapping does not need to change for that to happen.
- **Founder Constraints:** This module never treats its own `preferredDirection` output as a
  final, actionable decision — per Constitution Article 6 (history preserved, decision not safe
  until preserved) — that authority remains with Module 5 and, ultimately, the Founder.

---

# Module 5 — Decision Runtime™ (extends former Layer 6)

- **Purpose:** Produce the final action recommendation, now consuming Module 4's structured
  reasoning trace as a real input rather than an inert citation, and with the previously-
  ambiguous cascade tiebreak resolved.
- **Responsibilities:** Everything the former Decision Engine did (five-outcome cascade,
  confidence computed alongside) — retained — plus explicit resolution of
  `ENGINEERING_TEST_REPORT.md` MF-06's tiebreak gap.
- **Inputs:** `PriorityResult`/`EQResult`/`CQResult` (existing, unchanged — Layer 5/10 referenced
  not restated), `MemoryResolution` (Layer 7, unchanged), Module 3's `IntelligenceContext`,
  Module 4's `ReasoningTrace`.
- **Outputs:** `DecisionPackage` — existing shape, now including a reference to the
  `ReasoningTrace` KOID(s) that informed it, for explainability.
- **Execution Flow:** Unchanged cascade evaluation, now with Module 4's `preferredDirection` as
  an additional weighted input alongside the existing five.
- **Decision Logic — MF-06 resolution:** The prior architecture placed the new institutional-
  sales-handoff outcome "at the same priority position" as the existing care-workflow outcome
  without a tiebreak. This is resolved: **when both a care-workflow need and an institutional-
  handoff signal are simultaneously valid, care-workflow takes priority** — grounded in
  Founder Intelligence KF Constitution Article 10 (Trust Compounds Over Generations: an
  unaddressed care/safety need represents a more immediate trust risk than a deferred sales
  handoff, and a care workflow, once resolved, does not preclude a subsequent institutional
  handoff in the same or a following turn).
- **Runtime Behaviour:** First-match-wins cascade, now six ordered outcomes (was five): escalate
  → care workflow → institutional-sales handoff → share knowledge → ask clarifying question →
  (implicit) no action.
- **Dependencies:** Module 3, Module 4; Layer 5/7/10 (unchanged, referenced not restated).
- **Cross-module Relationships:** feeds Module 6, Module 7.
- **Edge Cases:** Same as the prior architecture's Layer 6, plus: Module 4 states no framework
  exists for the current intent — the cascade proceeds using only its original five inputs,
  degrading gracefully rather than blocking.
- **Failure Modes:** Same as prior — degrades to "ask clarifying question," never fabricates.
- **Recovery Logic:** Stateless per-request; unchanged.
- **Performance Expectations:** No material change from the prior architecture's Decision Engine
  cost.
- **Validation Rules:** The original four-outcome test cases (Group 7, prior test report) must
  remain unchanged; the new tiebreak rule must be independently testable in isolation.
- **Acceptance Criteria:** A simultaneous care+institutional-signal test case resolves to
  care-workflow, deterministically, every time.
- **Future Scalability:** A future seventh outcome would require a new, explicit tiebreak
  statement relative to its nearest cascade neighbors — this module's design does not assume
  ties resolve themselves.
- **Founder Constraints:** Per Constitution Article 7 (Change Only What Was Authorized) — this
  module's only change from the prior architecture is the tiebreak rule and the new
  `ReasoningTrace` input; its five-input contract and confidence formula are otherwise untouched.

---

# Module 6 — Conflict Resolution Runtime™ (resolves CF-05)

- **Purpose:** Give conflict detection a real, bounded, deterministic mechanism (CF-05's first
  half) and give arbitration a defined runtime lookup order that never silently invents a
  winning authority (CF-05's second half, alongside CF-01's Registry).
- **Responsibilities:** Detect genuine substance disagreement between two or more retrieved
  results (as distinct from vocabulary difference); when detected, consult the Founder Decision
  Registry and the proposed cascade, in order, before escalating.
- **Inputs:** Module 1's ranked retrieval results (specifically, any set of ≥2 results
  addressing the same underlying question); the Founder Decision Registry (Module 4).
- **Outputs:** Either a resolved single answer with its resolution rationale (which Registry
  entry or cascade level applied), or an explicit `UNRESOLVED_CONFLICT` flag.
- **Execution Flow:** Retrieval returns ≥2 candidates on the same question → structural
  grounding-overlap check (below) → if substantively equivalent, pass through → if genuinely
  divergent → Registry lookup → if no Registry entry, apply the proposed default cascade → if
  the cascade itself does not resolve it (e.g., two same-domain-authority, same-recency sources
  disagree), flag unresolved.
- **Decision Logic — the CF-05 detection mechanism (deterministic, not semantic):** Two results
  are classified as **substantively divergent**, not merely differently worded, only when they
  make **structurally comparable but opposite assertions** against the same normalized subject
  — operationalized as: both results are tagged (at ingestion, Layer 1) with the same subject
  category (e.g., both about "return policy window," both about "minimum institutional order
  quantity") **and** contain numerically or categorically opposed values for that category
  (e.g., "48-hour return window" vs. "7-day return window"). This is deliberately narrower than
  full semantic disagreement detection — it will not catch every possible conflict, and this
  document states that limitation honestly rather than overclaiming: **it resolves CF-05's
  "no mechanism exists" finding with a bounded, explainable mechanism, not a claim of complete
  conflict coverage.** Vocabulary-only differences (no opposed value, same category) pass
  through without flagging, directly preventing the over-flagging failure mode named in the
  test report.
- **Decision Logic — the CF-01/OI-003 arbitration lookup order:** 1. Founder Decision Registry
  (Module 4) — an explicit, dated, on-point entry always wins. 2. The proposed cascade from
  `FOUNDER_DECISION_PACKET.md` Task 4 — **used here as the operative default specifically
  because no Registry entry yet exists for it either; this is disclosed as "proposed, pending
  Founder confirmation," not claimed as approved.** 3. Escalation, if the cascade's own levels
  don't resolve the specific pair (e.g., two Marketing KF domains disagree with each other).
- **Runtime Behaviour:** Detection always runs on multi-result sets; arbitration only runs on
  detected conflicts; the vast majority of retrievals (single dominant result, or multiple
  results in agreement) incur no arbitration cost at all.
- **Dependencies:** Module 1, Module 4.
- **Cross-module Relationships:** feeds Module 5 (unresolved conflict forces escalation) and
  Module 7 (unresolved conflict caps confidence).
- **Edge Cases:** A result pair tagged with the same subject category but one is a live-
  commercial-data field (Product KF `FR-001`) — this is not a knowledge conflict at all, it is
  resolved by the categorical live-data carve-out (Task 4's Level 4) before this module's
  detection logic even runs.
- **Failure Modes:** The subject-category tagging itself (an ingestion-time, Layer 1
  responsibility) is incomplete or inconsistent across Factories — degrades to under-detection
  (a real conflict goes unflagged), disclosed as a bounded limitation, not silently claimed
  solved.
- **Recovery Logic:** An unresolved conflict is a valid output state, not an error — Module 5
  handles it as a first-class cascade branch.
- **Performance Expectations:** Detection cost scales with the number of same-category results
  in a single retrieval, expected to be small in practice (most queries resolve to one dominant
  answer).
- **Validation Rules:** No conflict may be resolved by a cascade level below where the Registry
  or cascade actually applies — every resolution must cite its actual level, never a shortcut.
- **Acceptance Criteria:** The synthetic genuine-conflict/vocabulary-difference test pairs from
  `ENGINEERING_TEST_REPORT.md` Group 9 classify correctly under this mechanism; the proposed
  cascade is applied exactly as specified in `FOUNDER_DECISION_PACKET.md` Task 4, with its own
  disclosed caveat (domain-authority is not a naive global ranking) preserved.
- **Future Scalability:** As the Founder Decision Registry accumulates real entries (including,
  eventually, a confirmed answer to OI-003 itself), Registry lookups increasingly pre-empt
  reliance on the proposed default cascade — this module's structure does not need to change
  when that happens.
- **Founder Constraints:** This module must never treat the proposed cascade as Founder-approved
  in any user-facing or audit-facing output — every resolution trace must explicitly label
  cascade-based resolutions as "per proposed default cascade, pending Founder confirmation."

---

# Module 7 — Confidence Runtime™ (extends former Layer 9)

- **Purpose:** Extend confidence scoring to weigh Module 1's new `retrievalMethod` signal and
  Module 6's conflict-resolution-level signal, addressing `ENGINEERING_TEST_REPORT.md` MF-08's
  scaling concern along the way.
- **Responsibilities:** Everything the former Confidence Engine did (evidence-count scoring) —
  retained — plus two refinements: source-method weighting and a recalibrated ceiling.
- **Inputs:** Evidence used by Module 5; Module 6's conflict-resolution result (including which
  arbitration level, if any, was used).
- **Outputs:** A confidence score plus a `confidenceBasis` trace (evidence count, source-method
  mix, conflict-resolution level applied).
- **Execution Flow:** Unchanged core scoring, now reading `retrievalMethod` per evidence item
  and `conflictResolutionLevel` from Module 6.
- **Decision Logic — MF-08 resolution:** The evidence ceiling is recalibrated proportionally
  (from 8 to 16, reflecting 8 total possible source types post-integration, preserving the
  original ratio rather than arbitrarily doubling without justification) **and** the
  "answerable without hedging" threshold is re-expressed as a *percentage* of the ceiling rather
  than a fixed absolute number, so the threshold's real-world meaning does not silently drift as
  the ceiling changes.
- **Runtime Behaviour:** A `SEMANTIC`-only match contributes a fractional evidence weight (less
  than a `KEYWORD` or `BOTH` match) to the count, directly implementing the Founder Constraint
  named in Module 1.
- **Dependencies:** Module 1, Module 6.
- **Cross-module Relationships:** feeds Module 8, Module 9.
- **Edge Cases:** Arbitration resolved via the proposed-cascade level (not a confirmed Registry
  entry) — confidence must reflect that this resolution itself carries residual uncertainty,
  scored slightly lower than an equivalent Registry-resolved case.
- **Failure Modes:** Same as prior architecture's Confidence Engine — unchanged.
- **Recovery Logic:** Stateless, recomputed per request.
- **Performance Expectations:** No material change from prior.
- **Validation Rules:** Existing four-source test cases must produce equivalent *relative*
  confidence ordering under the recalibrated (percentage-based) threshold, even though the raw
  ceiling number changed — this is the backward-compatibility guarantee for MF-08.
- **Acceptance Criteria:** A `BOTH`-method, Registry-resolved case scores strictly higher than a
  `SEMANTIC`-only, cascade-resolved case, holding evidence count constant.
- **Future Scalability:** The ceiling recalibration formula (proportional to total source-type
  count) applies automatically as future Factories are added.
- **Founder Constraints:** Confidence must never be computed from a Gap Record match — Module 1's
  distinct `GAP_RECORD_MATCH` result type is explicitly excluded from the evidence count, per
  Constitution Article 3.

---

# Module 8 — Safety Runtime™ (resolves CF-06)

- **Purpose:** Give the mandatory post-generation restrictions check a real, deterministic,
  explainable mechanism, while honestly disclosing its residual risk rather than overclaiming
  perfect hallucination-proofing.
- **Responsibilities:** Verify every fact-bearing sentence in an assembled response is
  citation-backed; verify every citation resolves to a real, Verified/Derived (never Gap Record)
  Knowledge Object; verify no output value matches a live-commercial-data field pattern
  (price/stock/discount format) unless sourced from an actual live lookup.
- **Inputs:** Module 9's draft response (pre-delivery); the citation set Module 9 attaches to
  each claim; Module 7's confidence trace.
- **Outputs:** `SAFE_TO_DELIVER` or `BLOCKED` with a specific, itemized reason per blocked
  sentence; on block, a signal back to Module 9 to regenerate, substitute a fixed fallback
  template, or escalate (the specific choice among these three is itself Founder-decision-
  pending per `FOUNDER_DECISION_PACKET.md` Task 3's still-open "reject-vs-correct" question —
  this module specifies the three available outcomes, not which one fires by default).
- **Execution Flow:** Draft response in → sentence-level segmentation → per-sentence citation
  presence check → per-citation resolution check (real KOID, correct Evidence Classification) →
  live-commercial-data pattern check → aggregate verdict.
- **Decision Logic — the CF-06 resolution, a structural grounding-completeness check, not a
  truth-verification model:** This module does **not** attempt to verify that a generated
  sentence is *true* in any deep semantic sense (the test report correctly identified that as
  requiring either a fallible second model call or a trivially-bypassable keyword filter — this
  document does not pretend to have solved that). Instead, it verifies a narrower, fully
  deterministic property: **every sentence asserting a checkable fact has an attached citation,
  and that citation's source content structurally corresponds to the sentence's claim** (a
  bounded overlap check between the sentence's key terms and the cited KO's stored content —
  the same category of check, applied in the opposite direction, as Module 6's conflict
  detector). A sentence with no citation, or a citation whose content does not structurally
  correspond, is blocked. **This is disclosed honestly as a completeness/grounding check, not a
  correctness/truth check** — a citation-complete sentence could theoretically still
  misrepresent its source in a way this check cannot catch. That residual risk is why Module 10
  (Learning Runtime) must include mandatory human-audit sampling as a compensating control, not
  an optional nice-to-have.
- **Runtime Behaviour:** Runs on every response before delivery, no exceptions, no fast path
  that skips it.
- **Dependencies:** Module 9 (for the draft to check), Module 1 (to resolve citations back to
  real KOs).
- **Cross-module Relationships:** feeds back to Module 9 (block/regenerate signal); feeds
  Module 10 (every block event is logged as a learning signal).
- **Edge Cases:** A response with zero fact-bearing sentences (pure clarifying question) —
  trivially passes, since there is nothing to ground.
- **Failure Modes:** The overlap-check heuristic itself can produce false positives (blocking a
  correctly-grounded sentence phrased very differently from its source) — disclosed as a
  precision/recall trade-off, tunable but never fully eliminable without semantic
  understanding this module deliberately does not claim to have.
- **Recovery Logic:** A blocked response always falls back to Module 9's existing deterministic
  fixed-template path (from the prior architecture's Response Assembly Engine) — never to
  silence, per the established Recovery Strategy pattern this whole ecosystem uses consistently.
- **Performance Expectations:** Sentence-level checking scales linearly with response length;
  bounded and predictable, unlike a second-model-call approach.
- **Validation Rules:** 100% of the `ENGINEERING_TEST_REPORT.md` Group 12 "red-team" synthetic
  violations (unauthorized price, invented claim, fabricated fact) must be caught by this
  mechanism's citation-presence check alone (a fabricated fact, by definition, has no real
  citation to attach) — this is the concrete, testable claim this module makes, narrower than
  "catches all hallucinations" but real and checkable.
- **Acceptance Criteria:** Zero uncited fact-bearing sentences ever reach delivery.
- **Future Scalability:** If a future generative model reliably self-reports its own citations
  in a structured format, this module's citation-presence check becomes cheaper without changing
  its logic.
- **Founder Constraints:** This module never claims to guarantee truth, only groundedness —
  this distinction must be preserved in any Founder-facing description of this system's safety
  properties, per Constitution Article 3's own standard of never overclaiming certainty.

---

# Module 9 — Response Assembly Runtime™ (extends former Layer 11)

- **Purpose:** Assemble the final customer-facing response, now with an explicit citation
  contract that Module 8 can check, and explicit hooks for the two Task 3 open items (streaming,
  reject-vs-correct) without deciding them here.
- **Responsibilities:** Everything the former Response Assembly Engine did (deterministic
  lookup-table path unchanged; generative-path contract and guardrails) — retained — plus the
  structured citation-attachment requirement Module 8 depends on.
- **Inputs:** `DecisionPackage` (Module 5); Module 7's confidence trace; Module 6's conflict
  status; retrieved knowledge (Module 1).
- **Outputs:** A draft response with per-sentence citation metadata attached (the structure
  Module 8 checks), sent to Module 8 before final delivery.
- **Execution Flow:** Unchanged from the prior architecture's Layer 11, with one new mandatory
  step inserted before delivery: Module 8's Safety Runtime check.
- **Decision Logic:** Unchanged deterministic-path lookup table; for a future generative path,
  every generated sentence must be tagged with its supporting KOID(s) at generation time, not
  inferred after the fact — this is a contract requirement on the (still unbuilt) generative
  step, not a new decision this module makes itself today.
- **Runtime Behaviour:** No response ever reaches a customer without passing Module 8.
- **Dependencies:** Module 5, Module 6, Module 7.
- **Cross-module Relationships:** feeds Module 8 (mandatory gate) and, on approval, delivery;
  feeds Module 10 on every completed turn.
- **Edge Cases:** Same as prior architecture's Layer 11 — unchanged, plus: a Module 8 block
  triggers whichever of the three fallback behaviors (regenerate/template/escalate) is
  eventually Founder-selected — until then, this module defaults conservatively to the fixed
  lookup-table fallback (the one option requiring no new Founder decision to use safely today).
- **Failure Modes:** Same as prior — unchanged.
- **Recovery Logic:** Same as prior — unchanged.
- **Performance Expectations:** Adds Module 8's bounded, linear-in-length checking cost to the
  existing pipeline.
- **Validation Rules:** Every generated sentence must carry citation metadata before being
  passed to Module 8 — a response missing this metadata is itself a Module 9 defect, not a
  Module 8 false negative.
- **Acceptance Criteria:** 100% of deterministic-path responses pass Module 8 trivially (they
  already come from the fixed, pre-approved template set); the generative-path contract is
  fully specified for developers even though no generative code exists yet.
- **Future Scalability:** Streaming (Task 3, still open) would require Module 8's check to run
  against a buffered segment before that segment is released to the customer — this module's
  citation-tagging contract is streaming-compatible by design (per-sentence, not
  whole-response-only), even though the streaming decision itself remains open.
- **Founder Constraints:** No AI model is selected, no prompt is written, here — unchanged from
  the prior architecture's explicit scope boundary.

---

# Module 10 — Learning Runtime™ (extends former Layer 13)

- **Purpose:** Close the loop from real usage back to the Knowledge Factories and this runtime's
  own rule tables, now including the mandatory audit-sampling role Module 8's honest residual-
  risk disclosure requires.
- **Responsibilities:** Everything the former Continuous Learning Architecture did (structured
  Decision-Record-shaped learning capture, Factory-governance-gated proposals) — retained — plus
  mandatory sampling review of Module 8's grounding-check decisions specifically.
- **Inputs:** Captured feedback (Layer 13's existing `ExperienceFeedback` path, unchanged);
  Module 8's block/pass log; Module 6's conflict-resolution log (especially cascade-based, not
  Registry-based, resolutions — these are the ones most likely to need eventual Founder
  confirmation).
- **Outputs:** Structured learning records (Founder Intelligence KF `KO-FD-LN-002` ten-field
  shape, unchanged); a new, specific output category: audit-sample findings on Module 8's
  grounding checks (false positives/negatives observed).
- **Execution Flow:** Unchanged from the prior architecture, plus a new periodic sampling step
  over Module 8's decision log.
- **Decision Logic:** Sampling selection favors low-confidence-but-passed and high-confidence-
  but-blocked cases specifically (the two categories most likely to reveal a grounding-check
  defect), not a pure random sample — a deterministic, explainable prioritization rule.
- **Runtime Behaviour:** Unchanged cadence/governance from prior architecture; the new sampling
  role does not make this module self-executing on Factory content — every proposal still
  requires external, explicit Founder-authorized governance action, per Constitution Article 13,
  unchanged.
- **Dependencies:** Module 8 (new), plus the prior architecture's existing dependencies.
- **Cross-module Relationships:** feeds back to Module 1 (approved learnings become new
  ingestible content) and Module 6 (a cascade-based resolution that repeatedly proves correct
  under audit is itself evidence worth surfacing toward a future Founder Decision confirming
  OI-003).
- **Edge Cases:** Same as prior architecture, plus: a Module 8 audit sample reveals a systematic
  grounding-check weakness (e.g., consistently missing a specific phrasing pattern) — this
  becomes a high-priority learning record, not a routine one, per the existing "repeated
  objection is commercial intelligence" reasoning pattern (`KO-FD-SI-003`) applied here to
  safety-check quality instead of sales objections.
- **Failure Modes:** Same as prior architecture — unchanged.
- **Recovery Logic:** Same as prior — unchanged.
- **Performance Expectations:** Sampling review is an offline/asynchronous process, not a
  per-request cost — does not affect live response latency.
- **Validation Rules:** Same as prior architecture, plus: every Module 8 block/pass decision
  must be logged with enough detail (the sentence, its citation, the overlap score) for a later
  audit sample to actually evaluate it.
- **Acceptance Criteria:** Same as prior architecture's terminal-review-state requirement, now
  extended to audit-sample findings specifically.
- **Future Scalability:** Same as prior — unchanged.
- **Founder Constraints:** Unchanged from prior architecture — no learning record is
  self-executing; every proposed correction to a frozen Factory or to this runtime's own rule
  tables requires explicit, external Founder authorization.
