# MUV AI Intelligence Core™ — Engine Relationships

## Layer dependency chain (linear backbone)

Layer 1 (Knowledge Integration) → Layer 2 (Knowledge Graph) → Layer 3 (Retrieval Engine) →
Layer 4 (Context Engine) → Layer 5 (Reasoning Engine) → Layer 6 (Decision Engine) → Layer 9
(Confidence Engine, computed alongside Layer 6) → Layer 11 (Response Assembly Engine) → Layer 12
(Tool Orchestration Engine, invoked when Layer 11 requires it) → Layer 13 (Continuous Learning
Architecture).

## Branching relationships (not strictly linear)

| From | Type | To | Why |
|---|---|---|---|
| Layer 4 | feeds | Layer 10 (Care Engine) | Care Engine consumes `IntelligenceContext` directly, in parallel with Layer 5 |
| Layer 3 | feeds | Layer 8 (Conflict Resolution) | Conflict detection runs on retrieval results before reasoning proceeds |
| Layer 2 | feeds | Layer 8 | Conflict Resolution needs the graph to know which KOs are even comparable |
| Layer 8 | feeds | Layer 6 | An unresolved conflict forces the escalation branch of Layer 6's cascade |
| Layer 8 | feeds | Layer 9 | An unresolved conflict caps confidence, per Layer 9's own rule |
| Layer 6 | feeds | Layer 7 (Memory Engine) | The decision outcome is recorded into session memory |
| Layer 10 | feeds | Layer 6 | Care signal (CQResult) is one of Decision Engine's five existing inputs |
| Layer 9 | feeds | Layer 11 | Confidence shapes how hedged/direct the assembled response is |
| Layer 12 | feeds back | Layer 7 | A tool-call result becomes part of session memory once known |
| Layer 12 | feeds back | Layer 11 | A tool-call result is woven into the final response |
| Layer 13 | feeds back | Layer 1 | A Founder-approved learning becomes a new ingestible Knowledge Object (external governance gate in between — never automatic) |
| Layer 13 | feeds back | Layer 8 | A resolved conflict (once a Founder Decision exists) updates the conflict log |

## Mapping to the real 9-module platform (cross-reference)

| Layer | Module(s) reused | New work required |
|---|---|---|
| 1 | Module 1, V4 governance layer | Ingestion adapters, `sourceFactory` enum |
| 2 | *(none directly — `lib/retrieval/relationships.ts` is the closest precedent)* | New graph representation |
| 3 | Module 5 | Extend `sourceType` coverage (recommended: additive `relationship` values) |
| 4 | Module 6 (Context Engine) | Populate existing opaque fields |
| 5 | Module 6 (Priority/EQ/CQ Engines) | Documentation-level grounding in Founder Intelligence KF |
| 6 | Module 6 (Decision Engine) | One new cascade outcome (institutional-sales handoff) |
| 7 | Module 6 (Memory Resolver), Module 8 (`ExperienceSession`) | None required; one open question logged |
| 8 | V4's `KnowledgeConflict` (partial precedent only) | New design — blocked on a Founder Decision for the arbitration rule itself |
| 9 | Module 6 (Confidence Engine) | Two new inputs (source diversity, conflict penalty) |
| 10 | Module 4 (CIF), Module 6 (CQ Engine) | New institutional-care fields (already disclosed as needed by Module 4's own docs) |
| 11 | Module 7 (Response Composer), Module 8 (Response Model) | The no-LLM gap — largest new-architecture need, contract-only per this protocol's "do not implement models" instruction |
| 12 | Module 7 (Action Engine), Module 8 (Orchestrator) | Tool-call classification + contract, reusing the existing Server Action convention |
| 13 | Module 8 (`ExperienceFeedback`, review prep) | Structured learning-record loop, gated by external Factory governance |

## Founder Thinking Pipeline cross-reference

See `INTELLIGENCE_CORE_MASTER.md` §3 for the full stage-by-stage mapping. Summary: 10 of 11
pipeline stages map cleanly onto an existing or newly-specified layer; the "Care" stage's
position (pipeline places it second, the real implementation computes it as part of Module 6,
after retrieval) is the one disclosed, non-blocking sequencing note — see `ENGINE_VALIDATION.md`
§ Pipeline Validation.

## Integrity check

All 13 layers have ≥1 relationship (both to their real-module mapping and to at least one other
layer). No layer is an orphan. No circular dependency in the backbone chain — feedback loops
(Layer 12→7/11, Layer 13→1/8) are explicit, gated, and asynchronous (never same-request cycles),
not same-pass circular dependencies.
