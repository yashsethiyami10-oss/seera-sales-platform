# MUV AI Runtime Engineering™ — Response Pipeline

## The complete runtime pipeline

```
User Input
    ↓
Intent Classification .......... Module 2 (Intent Intelligence Engine™)
    ↓
Semantic Retrieval .............. Module 1, phase 1 (keyword + semantic passes, in parallel)
    ↓
Knowledge Ranking ............... Module 1, phase 2 (merge, dedupe, re-rank)
    ↓
Context Construction ............ Module 3 (Context Builder™)
    ↓
Founder Reasoning ............... Module 4 (Founder Reasoning Runtime™)
    ↓
Decision Runtime ................ Module 5 (Decision Runtime™)
    ↓
Conflict Resolution ............. Module 6 (Conflict Resolution Runtime™) — only if Module 1
    │                              returned ≥2 same-subject results; otherwise passthrough
    ↓
Confidence Evaluation ........... Module 7 (Confidence Runtime™)
    ↓
Response Assembly (draft) ....... Module 9, phase 1 (draft + citation tagging)
    ↓
Safety Runtime ................... Module 8 (mandatory gate — BLOCKED loops back to Module 9)
    ↓
Response Assembly (final) ....... Module 9, phase 2 (delivery)
    ↓
Learning Runtime ................ Module 10 (asynchronous, does not block delivery)
```

**Note on stage/module count:** twelve pipeline stages map onto ten modules because Module 1
(Semantic Retrieval Engine™) owns both "Semantic Retrieval" and "Knowledge Ranking," and
Module 9 (Response Assembly Runtime™) owns both the pre-Safety draft phase and the post-Safety
delivery phase. This is disclosed explicitly rather than silently presented as an inconsistency
between the requested pipeline diagram and the requested module count.

**Note on layers not re-specified here:** Memory (feeds Module 3 and Module 5, unchanged, see
`ENGINE_ARCHITECTURE.md` Layer 7), Care (feeds Module 5, unchanged, Layer 10), and Tool
Orchestration (invoked from Module 9/5 when an action requires it, unchanged, Layer 12) continue
to operate exactly as previously specified — they are cross-cutting dependencies of this
pipeline, not additional stages within it, and are referenced here rather than restated per
Reference Before Create.

## Stage-by-stage data flow

| Stage | Consumes | Produces | Blocking? |
|---|---|---|---|
| Intent Classification | Raw input, session memory | `IntentClassification` | Yes — must complete before Semantic Retrieval (it scopes the query) |
| Semantic Retrieval | `IntentClassification` | Raw `RetrievalResult[]` (keyword ∪ semantic) | Yes |
| Knowledge Ranking | Raw `RetrievalResult[]` | Ranked `RetrievalResult[]` with `retrievalMethod` | Yes |
| Context Construction | Ranked results, `IntentClassification`, session memory | `IntelligenceContext` | Yes |
| Founder Reasoning | `IntelligenceContext`, `IntentClassification`, Founder Decision Registry | `ReasoningTrace` | No — degrades gracefully if no framework applies (Module 4 Edge Cases) |
| Decision Runtime | `IntelligenceContext`, `ReasoningTrace`, Priority/EQ/CQ/Memory (unchanged) | `DecisionPackage` | Yes |
| Conflict Resolution | Ranked results (≥2 same-subject) | Resolved answer or `UNRESOLVED_CONFLICT` | Conditional — only runs when triggered |
| Confidence Evaluation | Evidence, conflict-resolution result | Confidence score + `confidenceBasis` | Yes |
| Response Assembly (draft) | `DecisionPackage`, confidence, conflict status, retrieved knowledge | Draft response + citation metadata | Yes |
| Safety Runtime | Draft response + citations | `SAFE_TO_DELIVER` or `BLOCKED` | Yes — hard gate, no bypass |
| Response Assembly (final) | Safety verdict | Delivered response | Yes |
| Learning Runtime | Completed turn, Safety log, Conflict log | Learning records | No — asynchronous, never blocks delivery |

## Decision points and fallback paths

1. **`IntentClassification` = `UNKNOWN`** → Semantic Retrieval still runs (unscoped, full-corpus)
   → if no strong results, Decision Runtime's cascade resolves to "ask clarifying question,"
   never a guess.
2. **`IntentClassification` = `CREATIVE_REVIEW_REQUEST`** → routes directly toward the existing,
   correctly-reserved Founder Original IP Gap Record (Image/Video Analysis Engine™) — this path
   short-circuits most of the pipeline deliberately, since no analysis capability exists to feed
   downstream stages meaningfully.
3. **Conflict Resolution triggers `UNRESOLVED_CONFLICT`** → Confidence Evaluation caps the score
   below the "answerable without hedging" threshold → Decision Runtime's cascade escalates,
   regardless of what Founder Reasoning's `preferredDirection` suggested.
4. **Safety Runtime returns `BLOCKED`** → loops back to Response Assembly, which defaults
   conservatively to the fixed deterministic lookup-table response (per Module 9's stated
   default, pending the Founder's eventual reject-vs-correct decision from `FOUNDER_DECISION_
   PACKET.md` Task 3) → the block event is logged for Learning Runtime regardless of outcome.
5. **Founder Reasoning finds no applicable framework** → Decision Runtime proceeds using only
   its original five inputs (pre-Module-4 architecture), never blocking on Module 4's absence.

## Auditability

Every stage produces a structured trace object (per `RUNTIME_MODULES.md`'s Outputs field for
each module). A single completed turn's full trace — Intent → Retrieval method mix → Context →
Reasoning KOID(s) → Decision cascade branch taken → Conflict resolution level (if any) →
Confidence basis → Safety verdict — is fully reconstructible after the fact, satisfying this
task's explicit "every runtime step shall be auditable" requirement without requiring any
additional logging infrastructure beyond what each module already outputs.

## Determinism confirmation

Every decision point in this pipeline (intent classification, retrieval ranking weights,
conflict detection/resolution, confidence scoring, safety verdict) is a fixed rule, fixed
lookup table, or fixed formula — never a probabilistic model output. The one place a
probabilistic model could eventually sit (Module 9's future generative text) is treated as
*content to be checked* by Module 8, never as the source of a *decision* — this is the
architectural boundary that lets this entire pipeline satisfy "every runtime decision shall be
deterministic and explainable" even in a future state where a real LLM exists.
