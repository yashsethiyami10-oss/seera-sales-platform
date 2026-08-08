# MUV AI Intelligence Core™ — Founder Decision Packet & Engineering Test Plan

> Companion to `INTELLIGENCE_CORE_MASTER.md`, `ENGINE_ARCHITECTURE.md`, `ENGINE_RELATIONSHIPS.md`,
> `ENGINE_VALIDATION.md`, `FOUNDER_REVIEW.md` — none of those documents is restated here beyond
> what each task requires. **Decision preparation only. No code implemented. No tests executed.
> No existing production module modified. No Stage 6 freeze performed.**

---

# TASK 1 — Three Open Items

## OI-001 — Layer 3 Retrieval Engine: `sourceType` Extension Method

| Field | Content |
|---|---|
| **Exact issue** | Module 5's `RetrievalResult.sourceType` is a closed union of exactly four values (`KNOWLEDGE`, `PRODUCT_INTELLIGENCE`, `PROBLEM_INTELLIGENCE`, `CARE_INTELLIGENCE`). Wiring in the four new Knowledge Factories requires extending this coverage, and two structurally different implementation paths exist. |
| **Affected layer(s)** | Layer 3 (Retrieval Engine); secondarily Layer 1 (Knowledge Integration), since ingestion tagging depends on the choice made here. |
| **Affected existing module(s)** | Module 5 (Knowledge Retrieval Core) — `lib/retrieval/sources.ts`, `lib/retrieval/types.ts`. |
| **Why it remains open** | This is a real code-contract decision on an existing, live-adjacent module. Choosing wrong risks rework once developers begin implementation; the architecture document named both paths rather than forcing one without Founder input. |
| **Current architecture behaviour** | `ENGINE_ARCHITECTURE.md` Layer 3 recommends Option A but does not mandate it. |
| **Risk if left unresolved** | Developers could independently choose differently across the four Factories (some via Option A, some via B), producing an undocumented, inconsistent implementation that diverges from the reviewed architecture without Founder visibility. |
| **Blocks Architecture Freeze** | NO — mechanism and rationale are already fully specified. |
| **Blocks Engineering Testing** | NO — the test plan (Task 5, Group 3) can validate either path. |
| **Blocks Production Integration** | YES — a concrete choice must exist before Layer 3 code ships. |
| **Blocks Go Live** | YES, transitively. |
| **Founder decision required** | Which extension method Module 5's `sourceType` uses for the four new Factories. |
| **Available decision options** | **(a)** Additive `relationship` value under existing `sourceType: "KNOWLEDGE"` — the pattern already proven twice by `operational-data-adapter.ts` and `orchestration-plan.ts`. **(b)** Formal union extension — add `MARKETING_KF` / `INSTITUTIONAL_SALES_KF` / `FOUNDER_INTELLIGENCE_KF` (and decide separately whether Product KF merges into the existing `PRODUCT_INTELLIGENCE` value or gets its own). **(c)** Hybrid — Product KF merges into `PRODUCT_INTELLIGENCE`; the other three use Option (a). |
| **Recommended option** | (a) — lowest risk, zero change to Module 5's existing type contract, matches established precedent exactly. |
| **Consequence of each option** | **(a)**: no schema/contract change, fastest and safest; every consumer of `sourceType` must additionally read `relationship` to get the real distinction (one extra indirection, not a defect). **(b)**: cleaner, more discoverable semantics in code; touches Module 5's existing type contract directly, requiring full re-verification of every existing Module 5 consumer — higher regression risk for a module the Founder has not yet frozen. **(c)**: pragmatic middle ground; creates asymmetry where Product KF content becomes indistinguishable from original Product Intelligence Foundation (PIF) content in retrieval results — risks confidence-scoring and citation confusion between two genuinely different provenances. |

## OI-002 — Founder Thinking Pipeline "Care" Stage Sequencing

| Field | Content |
|---|---|
| **Exact issue** | The Founder's specified pipeline places "Care" as stage 2 (Understand → Care → Retrieve...). The real, live implementation computes Care (Module 6's CQ Engine) *after* Retrieval and Context — mid-pipeline, not 2nd. |
| **Affected layer(s)** | Cross-cutting — primarily Layer 5 (Reasoning Engine) and Layer 10 (Care Engine); documented in `INTELLIGENCE_CORE_MASTER.md` §3. |
| **Affected existing module(s)** | Module 6 (Intelligence Core) — specifically `cq-engine.ts`'s position inside `intelligence-orchestrator.ts`. |
| **Why it remains open** | CQ Engine's current design takes `IntelligenceContext` (which itself depends on retrieval) as an input. Moving Care earlier is not a pure reordering — it would require redesigning CQ's input contract, a real code change to a structurally complete, "awaiting founder review" module already carrying live production traffic. |
| **Current architecture behaviour** | CQ Engine scores care signal using context that already includes the customer's real situation — functionally, care-awareness begins at intake (Understand), only the *scoring computation* happens mid-pipeline. |
| **Risk if left unresolved** | A future engineer or auditor reading the pipeline diagram literally may conclude the implementation contradicts the specified architecture, when in fact the discrepancy is cosmetic/sequencing-only, already disclosed. |
| **Blocks Architecture Freeze** | NO. |
| **Blocks Engineering Testing** | NO. |
| **Blocks Production Integration** | NO — no functional defect exists in current behavior. |
| **Blocks Go Live** | NO. |
| **Founder decision required** | Whether the documentation-level distinction is acceptable as a permanent, disclosed note, or whether Module 6 should be re-engineered to match literal stage order. |
| **Available decision options** | **(a)** Accept current implementation order; treat the Founder Thinking Pipeline as a conceptual/logical ordering, not a literal execution trace (recommended). **(b)** Require Module 6's internal orchestration be reordered so CQ executes before Retrieval — requires redesigning CQ's input contract. **(c)** Rename/reframe the pipeline documentation only, to describe real execution order, without any code change. |
| **Recommended option** | (a). |
| **Consequence of each option** | **(a)**: zero engineering cost; a disclosed, permanent nominal mismatch between the named pipeline order and real execution order remains in documentation. **(b)**: real engineering cost and regression risk to a live-traffic-bearing module, for a change with no demonstrated functional benefit — likely displaces higher-value work. **(c)**: cosmetic-only, avoids implying a functional promise the code doesn't keep, but weakens the pipeline document's value as a literal execution reference. |

## OI-003 — Layer 8 Conflict Resolution: Arbitration Rule (= `KO-FD-GAP-002`)

| Field | Content |
|---|---|
| **Exact issue** | Layer 8 can detect that two Knowledge Factories (or a Factory and an existing Module) disagree. It has no authorized rule for which source wins. |
| **Affected layer(s)** | Layer 8 (Conflict Resolution Engine) directly; downstream effects on Layer 6 (must escalate on unresolved conflict) and Layer 9 (must cap confidence on unresolved conflict). |
| **Affected existing module(s)** | None owns this today. The V4 governance layer's `KnowledgeConflict` model is the closest structural precedent, but was built for ingestion-time source conflicts, not cross-repository runtime conflicts — a disclosed scope gap, not a ready-made fit. |
| **Why it remains open** | Inventing a precedence rule without Founder authorization would violate the Never-Invent discipline (Founder Intelligence Knowledge Factory Constitution Article 3) that governs this entire multi-repository ecosystem. This is precisely Founder Intelligence KF's own recorded Gap Record, `KO-FD-GAP-002`, phrased almost identically. |
| **Current architecture behaviour** | Conflicts are detected and flagged; an unresolved conflict routes to Layer 6's escalation branch and lowers Layer 9's confidence score; no auto-resolution occurs today. |
| **Risk if left unresolved** | Every genuine two-Factory disagreement escalates to a human — safe, but does not scale. As real content is seeded (currently 0%, see `FOUNDER_REVIEW.md` Snapshot), escalation volume could exceed staff capacity without a resolution rule. |
| **Blocks Architecture Freeze** | NO — the detection mechanism is fully specified and freezable independently of the arbitration rule. |
| **Blocks Engineering Testing** | PARTIALLY — conflict *detection* is testable now (Task 5, Group 9); conflict *arbitration* is not testable until a rule exists. |
| **Blocks Production Integration** | YES for full conflict handling; an escalation-only interim state could ship without it, as a conservative default. |
| **Blocks Go Live** | Depends on Founder risk tolerance for escalation-only behavior at launch — see Task 4. |
| **Founder decision required** | The full authority cascade — addressed in full in Task 4 below. |
| **Available decision options** | See Task 4. |
| **Recommended option** | See Task 4. |
| **Consequence of each option** | See Task 4. |

---

# TASK 2 — Existing Platform Mapping (compact)

| # | Layer | Existing module reused | Extension required | New design required | Existing contract affected | Breaking change | Implementation status | Testing required |
|---|---|---|---|---|---|---|---|---|
| 1 | Knowledge Integration | Module 1 + V4 governance layer | New `sourceFactory` enum value; per-Factory adapters | Adapter logic only | `KnowledgeFileType` enum (additive) | NO | EXTENSION REQUIRED | Ingestion correctness, idempotency, Gap Record exclusion |
| 2 | Knowledge Graph | None (`relationships.ts` closest precedent) | N/A | Full graph representation | None directly | NO | NEW IMPLEMENTATION REQUIRED | Edge traceability, zero invented edges |
| 3 | Retrieval Engine | Module 5 | `sourceType` coverage (OI-001) | None beyond extension | `RetrievalResult.sourceType` | NO if (a); possibly YES if (b) | EXTENSION REQUIRED | Backward compat on 4 existing sources + new-source retrievability |
| 4 | Context Engine | Module 6 (Context Engine) | Populate existing unused fields | None | None (fields pre-exist, unused) | NO | EXTENSION REQUIRED | Existing consumers unaffected when empty; correct population when present |
| 5 | Reasoning Engine | Module 6 (Priority/EQ/CQ) | Documentation-only grounding | None | None | NO | EXISTING | Citation accuracy only, no runtime test |
| 6 | Decision Engine | Module 6 (Decision Engine) | One new additive cascade outcome | None | Action-candidate set | NO (additive) | EXTENSION REQUIRED | Existing 4 outcomes unchanged; new outcome fires only with corroboration |
| 7 | Memory Engine | Module 6 (Memory Resolver) + Module 8 (`ExperienceSession`) | None | None (1 open question logged, not designed) | None | NO | EXISTING | Regression only |
| 8 | Conflict Resolution Engine | V4 `KnowledgeConflict` (partial precedent) | N/A | Detection mechanism (arbitration blocked — OI-003) | None (new layer) | NO | NEW IMPLEMENTATION REQUIRED (detection); BLOCKED (arbitration) | Detection precision/recall; arbitration untestable pending decision |
| 9 | Confidence Engine | Module 6 (Confidence Engine) | Two new inputs (diversity, conflict penalty) | None | Confidence formula (additive inputs) | NO | EXTENSION REQUIRED | Backward compat + correct penalty application |
| 10 | Care Engine | Module 4 (CIF) + Module 6 (CQ) | New institutional-care fields | Field schema only | None (additive fields) | NO | EXTENSION REQUIRED | Retail unaffected; institutional populates correctly |
| 11 | Response Assembly Engine | Module 7 (Response Composer) + Module 8 (Response Model) | N/A | LLM contract + guardrails (no model/code) | None for deterministic path | NO | NEW IMPLEMENTATION REQUIRED | Deterministic-path regression + guardrail enforcement |
| 12 | Tool Orchestration Engine | Module 7 (Action Engine) + Module 8 (Orchestrator) | Tool-call classification, 9 action types | Contract reuses existing Server Action pattern | None (additive) | NO | EXTENSION REQUIRED | RBAC boundary + live-data-only enforcement |
| 13 | Continuous Learning Architecture | Module 8 (`ExperienceFeedback`, review prep) | Structured learning-record loop | Decision Record integration + Factory-routing gate | None (additive) | NO | NEW IMPLEMENTATION REQUIRED | No auto-modification of frozen Factories; all records reach terminal state |

**Zero breaking changes across all 13 layers.** 6 EXISTING/EXTENSION-only, 4 EXTENSION REQUIRED
with new schema, 4 NEW IMPLEMENTATION REQUIRED (one partially blocked).

---

# TASK 3 — LLM Response Assembly Decision Brief

## What the platform does today

`orchestrateExperience()` (`actions/experience.ts`) runs the full live chain: Module 8's
Experience Orchestrator → Module 7's Execution Orchestrator (Policy Validator → Safety Engine →
Action Engine → Response Composer) → Module 6's Intelligence Orchestrator (Priority → Context →
Memory → EQ → CQ → Decision) → Module 5's retrieval. The Response Composer produces a
`ResponseBlueprint` (intent label, tone words, structure outline, restrictions — **no prose**).
Module 8's `response-model.ts` then selects a customer-facing string from `CUSTOMER_MESSAGE_BY_
ACTION`, a small, fixed lookup table keyed by which of Module 7's 9 action types fired. This is
live, today, on the production chat widget.

## What it cannot do today

Generate free-form, knowledge-grounded prose tailored to the specific retrieved content and the
customer's specific phrasing. It can only select the closest pre-written template from a small
fixed set — it cannot synthesize a genuinely novel answer.

## Exact position of the LLM step in `orchestrateExperience()`

Between Module 7's Response Composer (produces `ResponseBlueprint`) and Module 8's delivery to
the channel adapter — i.e., inside/alongside `response-model.ts`, consuming the
`ResponseBlueprint` plus the actual retrieved knowledge (Layer 3) in place of (or as a
supplement to, for action types the fixed table can't cover well) `CUSTOMER_MESSAGE_BY_ACTION`.

## Inputs the LLM contract will receive — **A (already specified)**

`ResponseBlueprint` (intent, tone words, structure outline, restrictions); retrieved knowledge
content (Layer 3, filtered to Verified/Derived only — Gap Records excluded per Layer 1's
ingestion-time rule); `IntelligenceContext` (Layer 4, including `businessContext`/
`institutionalContext` when populated); confidence score (Layer 9); conflict status (Layer 8).

## Structured output expected — **A (principle) / C (exact schema)**

Principle specified: output must separate customer-facing text from metadata (citations used,
confidence tier, restrictions honored, escalation flag) to support the mandatory post-generation
validation pass. The exact field-level schema is an implementation detail (**C**).

## Knowledge citations required — **A (principle) / C (rendering format)**

Every generated sentence asserting a fact must trace to a specific retrieved KO, extending
Module 6's existing `explainability.md` pattern. Exact citation rendering (inline, footnote,
metadata-only) is implementation detail.

## Confidence handling — **A (already specified)**

Low confidence → hedge language, never refusal. Low confidence + unresolved Layer 8 conflict →
must route to escalation, never attempt a confident-sounding generated answer.

## Safety and care checks — **A (principle) / B (exact reject-vs-correct behavior)**

Post-generation restrictions check specified as mandatory (Layer 11's highest-named failure
mode). **Open (B):** does a failed check trigger regeneration, fallback to the fixed template,
or automatic escalation? Not decided — genuinely a Founder risk-tolerance call, not an
engineering detail.

## Fallback behaviour — **A (already specified)**

Any generative failure (timeout, error, restriction violation) falls back to Module 7's existing
fixed lookup-table response for the given action — never to silence or a raw error, matching
`lib/errors.ts`'s existing "generic message to client, full detail server-side" convention.

## Streaming requirement — **B (Founder decision required, not previously addressed)**

Not addressed in the prior architecture pass. Streaming improves perceived latency but makes the
mandatory post-generation restrictions check harder to enforce before any content reaches the
customer (a partial stream could contain a violation before the check completes). Given this
ecosystem's consistent safety-before-speed discipline (Founder Intelligence KF Constitution
Article 1: *"Movement Is Continuation, Not Speed"*), **this document recommends non-streaming, or
validated-streaming with a buffer, for a first implementation** — stated as a recommendation
only, since it is explicitly a Founder decision, not an architectural given.

## Model-provider independence — **A (already specified)**

This document requires the LLM step follow the codebase's own proven, twice-used provider-
abstraction pattern (`lib/shipping/index.ts`, `lib/messaging/index.ts`) — an env-var-switched
provider, never a hardcoded vendor SDK call. This was also the exact recommendation of the
original Phase-1 platform-readiness audit for `lib/ai/index.ts`.

## Audit logging — **A (principle) / C (exact schema/retention)**

Every generated response must be logged with its full input bundle (`ResponseBlueprint`,
retrieved KOs, confidence, provider/model used, output) for explainability and for Layer 13's
Continuous Learning loop, reusing `lib/logger.ts`'s existing convention. Exact log schema and
retention period are implementation detail.

## Failure behaviour — **A (already specified)**

Covered under Fallback behaviour above — timeout/error degrades toward escalation language,
never toward fabrication or a raw stack trace.

## Privacy boundaries — **B (Founder decision required, high priority)**

**Not decided, and more consequential than model selection itself.** The original platform
readiness audit already found no dedicated PII redaction/anonymization layer exists anywhere in
this codebase. Conversation content may include customer PII. Sending it to a third-party LLM
provider's API raises real questions this document cannot answer: is any PII redacted before
prompt construction? Under what data-processing terms does the chosen provider operate? This is
flagged as the single highest-priority open question in this entire brief.

## Consolidated A / B / C summary

| Category | Items |
|---|---|
| **A — Architecture already specified** | Position in pipeline; inputs; confidence handling; fallback behaviour; failure behaviour; model-provider independence; citation and audit-logging principles; structured-output principle |
| **B — Founder decision still required** | Post-generation reject-vs-correct behavior; streaming vs. non-streaming; **PII/privacy boundary (highest priority)** |
| **C — Future code implementation** | Exact output schema; exact citation rendering format; exact audit-log schema/retention; model/provider selection itself; prompt construction |

---

# TASK 4 — Conflict Arbitration Decision Brief (Proposal Only)

**This cascade is a proposal, assembled entirely from existing, real, already-written repository
governance — nothing below is a new rule invented for this brief. It is not finalized. It awaits
Founder selection, per Founder Intelligence Knowledge Factory Constitution Article 3.**

**A cross-cutting caveat, disclosed up front:** the levels below are not a single global linear
ranking applied to every question regardless of subject. Each Knowledge Factory is the
domain authority for its own subject matter (Product KF for product facts, Marketing KF for
marketing/brand, Institutional Sales KF for institutional sales process). The cascade below
governs **cross-domain overlaps and same-domain disagreements** — it does not mean Product KF
outranks Marketing KF on a marketing-copy question merely because it is evaluated earlier in
this list.

| Level | Source | Scope | Priority | When it applies | When it must not override another source | Escalation behaviour |
|---|---|---|---|---|---|---|
| 1 | **Explicit latest Founder Decision** | Any domain, any repository | Absolute — always wins when on-point | An explicit, dated, current Founder Decision exists addressing the exact question in conflict | Never overridden by anything below; a decision superseded by a *later* Founder Decision is itself superseded (append-only ledger discipline, per every repository's own Constitution Article 6/13 pattern) | N/A — this level, when present, terminates the cascade |
| 2 | **Founder Constitution** (Founder Intelligence KF) | Reasoning/judgment patterns — *not* domain-specific facts | Supreme within its own scope | The conflict is about *how to reason*, not *what the fact is* (e.g., "should we challenge a weak idea" vs. "what is the CAC formula") | Must not override a domain-specific factual authority (Level 3/5/6) on a pure fact question — the Constitution governs reasoning, not commercial/product/marketing specifics it does not itself contain | Escalates to Level 1 if the Constitution itself is ambiguous or silent on the exact question |
| 3 | **Product Knowledge Factory** | Product facts (formulation, safety, usage, ingredients) | Domain-supreme, per its own explicit freeze language | The conflict concerns product intelligence specifically | Must not be treated as authoritative on marketing, sales process, or general reasoning questions — its own Constitution scopes it to product intelligence only | Escalates to Level 1 if the conflict is within Product KF's own domain but two of its own packages disagree (a real, disclosed possibility — see `LEGACY_REMEDIATION_REPORT.md`'s own pre/post-Constitution package split) |
| 4 | **Live operational/commercial data** | Price, stock, discount, availability, images, URLs/slugs | Categorical carve-out, not a ranked level | Any of Product KF `CONSTITUTION.md` Article 2's eleven named commercial fields — **this is not really "level 4" in a ranking sense; it structurally pre-empts the question before any Factory is even consulted**, per Product KF's own binding rule | Must never be overridden by *any* Knowledge Factory's static content for these specific fields — this is the one case where "older/lower confidence" (Level 7) does not apply, since live data is definitionally current | N/A — a live-data field with no live source available is a system fault, not a knowledge conflict, and escalates as an operational incident, not a content dispute |
| 5 | **Marketing Knowledge Factory** | Marketing, brand, creative, growth, operations/learning content | Domain-supreme for its own scope | The conflict concerns marketing/brand/creative/growth guidance specifically | Must not override Product KF on product facts even when a marketing asset references a product claim — the claim's underlying fact still traces to Product KF or live data | Escalates to Level 1 if two Marketing KF domains disagree with each other (should not occur within one frozen domain, but is possible across domains authored at different times) |
| 6 | **Institutional Sales Knowledge Factory** | Institutional sales process and communication | Domain-supreme for its own scope; **frequently a mirror of Marketing KF content** | The conflict concerns institutional-sales-specific process/communication | Must not override Marketing KF where Institutional Sales KF's own content is explicitly provenance-tagged as mirrored from Marketing KF (per Institutional Sales KF's own `RELATIONSHIPS.md` provenance notes) — in that case, check whether the Marketing KF source has since been amended (Level 1) before trusting the mirror | Escalates to Level 1 if the mirrored content and its Marketing KF source have genuinely diverged, since that itself signals a missed update requiring a Founder Decision |
| 7 | **Older or lower-confidence knowledge (tiebreaker)** | Any domain, once Levels 1-6 don't resolve the conflict | Lowest substantive level | Two sources at the *same* domain-authority level, *same* recency, disagree, and neither is a live-data field | Never applied to override a domain authority that is simply "newer-sounding" without being an actual dated Founder Decision — recency alone is not authority, only Evidence Classification (Founder Note > Derived Founder Principle) and dated status are | Escalates to Level 8 if confidence/recency are also tied |
| 8 | **Unresolved conflict escalation** | Terminal fallback | N/A — this is the floor, not a source | Levels 1-7 do not resolve the conflict | N/A | Routes to Layer 6's escalation branch (human review) — this is never itself a silent default; every escalation is logged for Layer 13's Continuous Learning loop |

**This proposal is not finalized. It awaits explicit Founder selection or amendment before Layer
8's arbitration mechanism may be implemented.**

---

# TASK 5 — Stage 6 Engineering Test Plan (prepared, not executed)

*Testing must occur only after the Task 1 open items and Task 3/4 Founder decisions are
resolved. Severity scale: **CRITICAL** (blocks Go Live) / **HIGH** (blocks Production
Integration) / **MEDIUM** (must pass before Freeze, not urgent) / **LOW** (advisory).*

| # | Test group | Objective | Test inputs | Expected result | Failure condition | Required evidence | Blocking severity |
|---|---|---|---|---|---|---|---|
| 1 | Layer Tests | Verify each of the 13 layers meets its own stated Acceptance Criteria | Synthetic per-layer requests, using this codebase's established `tsc --noEmit`/`next build`/live-`curl`/Prisma-script verification convention (no test runner exists) | Every layer's Acceptance Criteria (`ENGINE_ARCHITECTURE.md`) satisfied | Any layer fails its own stated criteria | Per-layer script/log output | CRITICAL |
| 2 | Cross-layer Integration Tests | Verify each layer's Output satisfies the next layer's Input contract | End-to-end synthetic session traces across the full backbone chain (`ENGINE_RELATIONSHIPS.md`) | No data-shape mismatch at any layer boundary | Any layer receives malformed/unexpected upstream input | Full 13-layer trace logs for ≥3 representative scenarios | CRITICAL |
| 3 | Repository Retrieval Tests | Verify Layer 3 retrieves all 8 source types (4 original + 4 new) without regressing the original 4 | Queries against every source type | Correct, permission-filtered results; existing 4-source cases byte-identical to pre-integration baseline | Any regression on original 4 sources; any new source unretrievable | Before/after diff on existing cases + new-source logs | CRITICAL |
| 4 | Knowledge Graph Tests | Verify every graph edge traces to a real declared relationship | Full graph traversal cross-checked against all 4 Factories' `relationships.json` | 100% edges traceable; 0% invented | Any untraceable edge | Automated cross-check script output (PowerShell-verification discipline, matching this project's established method) | HIGH |
| 5 | Context Construction Tests | Verify `businessContext`/`institutionalContext` population is correct and safe | Institutional session, retail session, founder-facing session | Correct population per type; retail context byte-identical to pre-integration baseline | Unintended population; existing consumer (Priority Engine) breaks | Context-object diffs across session types | HIGH |
| 6 | Reasoning Tests | Verify Layer 5's Founder Intelligence KF citations are real and accurate | Full citation list from `ENGINE_ARCHITECTURE.md` Layer 5 | 100% citations verified against live registry; no misrepresentation | Any broken or misrepresented citation | PowerShell verification output + manual spot-check | MEDIUM |
| 7 | Decision Tests | Verify the 5-outcome cascade (4 existing + 1 new) is correct, zero regression | Module 6's existing test suite (`testing.md`) + new institutional-signal cases | Original 4 outcomes unchanged; new outcome fires only with corroboration | Any change to existing behavior; new outcome fires without corroboration | Before/after diff on Module 6's existing suite | CRITICAL |
| 8 | Memory Tests | Verify zero regression to Memory Resolver / `ExperienceSession` | Existing Module 6/8 test suites | 100% pass, unchanged | Any regression | Existing suite pass/fail output | HIGH |
| 9 | Conflict Detection and Arbitration Tests | Verify genuine-conflict vs. vocabulary-difference detection; arbitration untestable pending Task 4 decision | Matched genuine-conflict pairs and matched vocabulary-difference pairs (synthetic) | Genuine conflicts flagged; vocabulary differences not flagged; all flagged conflicts route to escalation + confidence penalty | Over/under-flagging beyond agreed tolerance; flagged conflict not routing to escalation | Precision/recall metrics on synthetic set | CRITICAL (detection) / BLOCKED (arbitration, pending OI-003) |
| 10 | Confidence Calibration Tests | Verify extended scoring is backward-compatible and correct | Existing confidence cases + multi-source-agreement cases + conflict-present cases | Existing cases unchanged; multi-source ≥ single-source; conflict-present below "answerable" threshold | Any existing case regresses; conflict case scores above threshold | Before/after score comparison | HIGH |
| 11 | Care Behaviour Tests | Verify institutional-care fields populate correctly, never leak to retail | Institutional session with Institutional Sales KF content; retail session | Institutional-only population; retail `CQResult` byte-identical to baseline | Any leakage or retail-session change | `CQResult` diffs across session types | HIGH |
| 12 | Response Assembly Tests | Verify deterministic path unchanged; post-generation restrictions check catches every violation (once generative path exists) | Existing Module 7/8 deterministic cases + synthetic "red team" generated outputs with unauthorized prices/claims/fabrications | Deterministic path unchanged; 100% red-team violations caught pre-delivery | Deterministic regression; any red-team violation reaching delivery | Before/after diff + red-team catch-rate report | CRITICAL — named the highest-consequence failure mode in `ENGINE_ARCHITECTURE.md` |
| 13 | Tool Orchestration Tests | Verify RBAC enforcement and live-data-only discipline for tool calls | Under-permissioned tool-call attempts; price/stock lookup calls | Unauthorized calls rejected; price/stock always live, never stale | Any privilege escalation; any stale data presented as live | RBAC rejection logs; live-data-freshness verification | CRITICAL |
| 14 | Continuous Learning Boundary Tests | Verify no auto-modification of frozen Factories; all records reach terminal review | Simulated feedback volume over a test period | 0% Factory content modified without external governance action; 100% records reach terminal status | Any direct Factory modification; any permanently-unreviewed record | Factory file diff (must be empty) + review-status completeness report | CRITICAL |
| 15 | Existing Production Regression Tests | Verify the live `orchestrateExperience()` entry point is unchanged for all pre-integration scenarios | Full existing Module 5-8 test suites + live smoke test against the deployed chat widget | 100% pass, zero behavioral change outside the 4 new Factories | Any regression to live production behavior | Full existing suite output + manual live-widget verification | **CRITICAL — highest priority, given Module 8 is confirmed live in production today** |
| 16 | Security and Isolation Tests | Verify no new privilege-escalation path; RBAC/Zod/CSRF discipline preserved | Cross-tenant/cross-permission-layer access attempts; malformed input to every new action surface | All attempts rejected; all malformed input rejected by Zod before Prisma | Any successful unauthorized access; any unvalidated input reaching the database | Penetration-style test log; Zod-rejection confirmation per surface | CRITICAL |
| 17 | Hallucination and Unsupported-Claim Tests | Verify Gap Records are never presented as answers; no unauthorized claims; no fabricated commercial facts | Queries targeting known Gap Records across all 4 Factories; queries about commercial fields | System states absence/Founder-Decision-Required status honestly; commercial fields always resolve live | Any fabricated answer to a known gap; any static commercial value presented as current | Full transcript of gap-targeted query set, pass/fail per query | **CRITICAL — violates this ecosystem's master meta-rule (`KO-FD-AG-002`) if failed** |
| 18 | Founder Acceptance Scenarios | Verify end-to-end scenarios the Founder personally cares about behave as expected | To be defined directly by the Founder (not invented here, per Never-Invent discipline) — suggested starters: institutional buyer qualification question; retail safety question with a known Gap Record; staff review of an escalated conflict | Founder confirms each scenario "feels right" | Founder rejects any scenario's behavior | Founder's own direct sign-off per scenario | **CRITICAL — the actual Go-Live gate; all other tests are necessary but not sufficient without this** |

---

# TASK 6 — Freeze Readiness

**A. READY FOR FOUNDER DECISIONS**

The architecture requires no correction. All three open items (Task 1) are genuine, honestly-
disclosed decision points, not defects — none blocks Architecture Freeze itself. Production
Integration and Go Live are blocked only on the Founder decisions requested in Tasks 3 and 4
(privacy boundary, streaming behavior, post-generation failure handling, and the conflict
arbitration cascade), plus the implementation-path choice in OI-001.

---

## STOP

Founder Decision Packet and Engineering Test Plan delivered. No code implemented. No tests
executed. No existing production module modified. Stage 6 not frozen. Waiting for explicit
Founder decisions on: OI-001 (retrieval extension method), OI-002 (pipeline sequencing
acceptance), OI-003/Task 4 (conflict arbitration cascade selection), and Task 3's flagged items
(privacy boundary, streaming, post-generation failure handling).
