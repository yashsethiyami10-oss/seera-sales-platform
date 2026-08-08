# MUV AI Runtime Engineering™ — Master Specification

> Authorized via Founder Execution Protocol v1.0 (Runtime Engineering). Transforms the approved
> Intelligence Core architecture (`ENGINE_ARCHITECTURE.md`) into a runtime specification —
> engineering specifications only, no application code, no APIs. Read-only against all five
> frozen repositories plus `FOUNDER_DECISION_PACKET.md` and `ENGINEERING_TEST_REPORT.md`; none
> modified.

## 1. Scope: what this document changes and what it deliberately does not

This task's single highest priority is resolving `ENGINEERING_TEST_REPORT.md`'s six Critical
Findings. Per Reference Before Create / Zero Duplicate Engineering Specifications, **the four
architecture Layers not implicated in a Critical Finding are unchanged and not restated here**:
Layer 2 (Knowledge Graph — MF-02/03, Major only), Layer 7 (Memory Engine — MF-07, Major only),
Layer 10 (Care Engine — MF-09, Major only), Layer 12 (Tool Orchestration Engine — Mn-01, Minor
only). Their existing specification in `ENGINE_ARCHITECTURE.md` remains authoritative and
in force. This document specifies the ten runtime modules that replace or substantially extend
the Critical-Finding-implicated layers.

## 2. Critical Finding → Runtime Module resolution map

| Finding | Resolved by | Resolution shape |
|---|---|---|
| **CF-01** — No confirmed Founder Decisions; no mechanism existed to consult them at runtime | Founder Decision Registry (hosted in Module 4, consumed by Modules 4/5/6) | A live, queryable, append-only Authority Ledger, structurally identical to Product KF's real `FOUNDER_RULES.md` pattern — resolves the *mechanism* gap. The specific content of OI-001/002/003 remains pending actual Founder entries; this is stated honestly, not assumed closed. |
| **CF-02** — Retrieval is deterministic keyword-substring matching only, weak recall on natural-language phrasing | Module 1 — Semantic Retrieval Engine™ | Hybrid retrieval: existing Module 5 keyword matching (unchanged, retained for precision) **plus** a new semantic-similarity pass built on the codebase's own already-existing (currently mocked) `lib/retrieval/embedding-service.ts` infrastructure — additive, not a replacement. |
| **CF-03** — No layer owns intent/domain classification | Module 2 — Intent Intelligence Engine™ | A new, deterministic, fixed-taxonomy classifier — modeled directly on Module 6's own proven EQ/CQ Engine style (fixed lexicons, fixed rule tables), not a probabilistic/LLM classifier, to satisfy this task's explicit determinism requirement. |
| **CF-04** — Layer 5 (Reasoning) made zero runtime change; Founder Intelligence KF content was cited but never applied | Module 4 — Founder Reasoning Runtime™ | Actively selects and *executes* the applicable Founder Intelligence KF reasoning framework (via its 14-field Decision Model) against the live situation, producing a structured reasoning trace — not a citation alone. |
| **CF-05** — Conflict detection had no real mechanism; arbitration was correctly left undecided but nothing let the system act deterministically in its absence | Module 6 — Conflict Resolution Runtime™ | A structural, non-semantic grounding-overlap detector (bounded, explainable) plus a runtime lookup order: Founder Decision Registry → the previously-proposed cascade (`FOUNDER_DECISION_PACKET.md` Task 4, explicitly labeled **proposed default, pending Founder confirmation**, not silently treated as approved) → escalation. |
| **CF-06** — The post-generation safety check had no viable deterministic mechanism | Module 8 — Safety Runtime™ | A structural grounding/citation-completeness check (deterministic, explainable) as the primary gate, paired with an explicit, disclosed statement of residual risk and a mandatory audit-sampling loop (Module 10) as compensating control — not a false claim of perfect hallucination-proofing. |

## 3. Response Pipeline (summary — full detail in `RUNTIME_PIPELINE.md`)

**User Input → Intent Classification → Semantic Retrieval → Knowledge Ranking → Context
Construction → Founder Reasoning → Decision Runtime → Conflict Resolution → Confidence
Evaluation → Safety Runtime → Response Assembly → Learning Runtime**

"Knowledge Ranking" is Module 1's own second phase (merging/re-ranking keyword and semantic
result sets), not an eleventh module — ten modules map onto twelve pipeline stages because two
modules (1, 9) each own two adjacent stages.

## 4. Determinism and explainability — how this document satisfies both requirements uniformly

Every module below produces a structured trace object (inputs consulted, rule/framework applied,
output, and — where applicable — the Founder Decision Registry entry or cascade level used) as
part of its Outputs. No module in this specification calls a probabilistic model as its primary
decision mechanism; where a future generative step exists (Module 9's response text itself), its
output is treated as content to be checked, never as the source of a decision about safety,
conflict, or confidence — those three remain fully deterministic, per this task's explicit
requirement.

## 5. Architecture verification

New files added to the existing `docs/ai-intelligence-core/` repository (Append Before Replace —
no new repository created, per explicit instruction): `RUNTIME_ENGINEERING_MASTER.md`,
`RUNTIME_MODULES.md`, `RUNTIME_PIPELINE.md`, `RUNTIME_VALIDATION.md`, a superseding
`FOUNDER_REVIEW.md` (single current Founder Review — prior review content remains available via
`FOUNDER_DECISION_PACKET.md` and `ENGINEERING_TEST_REPORT.md`, not deleted), `JSON/*`. Zero
files modified in any of the five frozen repositories, `ENGINE_ARCHITECTURE.md`,
`ENGINE_RELATIONSHIPS.md`, `ENGINE_VALIDATION.md`, `FOUNDER_DECISION_PACKET.md`, or
`ENGINEERING_TEST_REPORT.md`. Zero application code written.

**Result: PASS.**
