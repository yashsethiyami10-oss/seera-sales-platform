# Architecture

## Position in the platform

```
Module 1  Knowledge Foundation        "What do we know, at the base level?"
Module 2  Product Intelligence (PIF)  "What do we know about products?"
Module 3  Problem Intelligence (PrIF) "What do we know about problems?"
Module 4  Care Intelligence (CIF)     "What do we know about care workflows?"
Module 5  Knowledge Retrieval Core    "What do we know, given a query?"
Module 6  Intelligence Core           "What matters right now?"          <- this module
Module 7  Execution Core (not built)  "What do we say / do?"
```

## Core principle

Knowledge answers "what do we know?". Intelligence answers "what matters right now?". Module 6 never
generates a customer-facing sentence — it produces a structured `DecisionPackage` for Module 7 to
consume. This distinction is enforced structurally: no engine in `lib/intelligence/` builds free-text
customer copy; every output field is an enum, a number, a boolean, or a short internal-facing string
("reasoning", "why") documented as staff-facing explainability text, not customer-facing response text.

## Why zero new Prisma models

The module prompt's Database guidance was explicit: "Prefer computation over storage. Only persist what
is truly necessary. Avoid unnecessary schema changes." Every one of Module 6's 10 engines is a pure
function of its inputs — Priority, Context, EQ, CQ, Decision, Confidence, and Explainability all
recompute from what Module 5 already retrieved (plus the live request) on every call. There is nothing
to persist: no engine has state that outlives a single `buildIntelligence()` call. Confirmed on disk:
`grep -i "intelligence core|module 6|reasoningtrace|decisionpackage" prisma/schema.prisma` returns zero
matches. This is the intended outcome, not an oversight.

## Reuse over rewrite: Module 5's retrieval pipeline

`intelligence-orchestrator.ts`'s first stage calls Module 5's `runRetrievalPipeline()` unmodified — the
same function, same file, same signature Module 5 shipped. Two things fall out of that reuse for free:

1. **Retrieved knowledge** — the `RetrievalResult[]` every other engine in this module consumes.
2. **Caller clearance** — `runRetrievalPipeline()` internally calls `resolveCallerClearance()` (also
   Module 5's, unmodified) and returns it alongside the results. The Memory Resolver uses this same
   clearance object to filter memory items by layer, rather than re-deriving clearance a second time.

No content-fetching, ranking, or permission logic was reimplemented. If Module 5's retrieval behavior
changes in a future module, Module 6 inherits the change automatically rather than drifting out of sync.

## Why Module 6's RBAC shape deliberately differs from Module 5's

Module 5 had to support a not-yet-built customer-facing AI calling `retrieveKnowledge()` directly and
anonymously, with results filtered down to what that caller is allowed to see — so its 8 actions are
callable by anyone. Module 6 is a different kind of surface: it is internal reasoning infrastructure
consumed by a not-yet-built Module 7 (Execution Core), which itself will decide what, if anything, ever
reaches a customer. There is no currently-approved path by which an anonymous or customer caller should
be able to invoke `buildIntelligence()` and receive back a structured `DecisionPackage` containing
internal fields (risk signals, escalation flags, confidence scores, reasoning traces) — those are staff-
and-system-facing by design. All 10 actions in `actions/intelligence.ts` therefore call `requireStaff()`
before doing anything else, a straightforward function-level gate rather than Module 5's result-level
filtering.

This is a **documented departure**, not an oversight or an inconsistency to "fix." It is expected that
Module 7 will introduce its own, likely different, RBAC shape when it defines how (if at all) intelligence
reaches a customer-facing surface — that decision belongs to Module 7's own founder-reviewed prompt, not
to this module.

## A consequence of the RBAC choice: `internalMetadata` is reliably populated

Module 5's `internalMetadata` field on each `RetrievalResult` is `null` for non-staff callers and
populated (risk level, escalation flags, etc.) for STAFF/ADMIN callers. Because every Module 6 action
requires staff clearance before it ever calls `runRetrievalPipeline()`, the resolved clearance passed
into that pipeline is always STAFF-or-higher — so `internalMetadata` is reliably non-null by the time the
Priority Engine and CQ Engine read `riskLevel`/`escalationRequired` off it. No special-casing or
clearance-bypassing was needed to get this; it falls out of the RBAC decision above.

## File structure

Exactly the suggested 10-file structure under `lib/intelligence/`, no monolithic file:

| File | Responsibility |
|---|---|
| `types.ts` | Shared types for every engine and the Decision Package |
| `priority-engine.ts` | `evaluatePriority()` |
| `context-engine.ts` | `buildContext()` |
| `memory-resolver.ts` | `resolveMemory()` |
| `eq-engine.ts` | `evaluateEmotion()` |
| `cq-engine.ts` | `evaluateCare()` |
| `decision-engine.ts` | `buildDecision()` |
| `confidence-engine.ts` | `evaluateConfidence()` |
| `explainability.ts` | `explainDecision()` |
| `decision-package.ts` | `buildDecisionPackage()` |
| `intelligence-orchestrator.ts` | `buildIntelligence()` — runs all of the above in the frozen order |

Plus `lib/validations/intelligence.ts` (Zod schemas for all 10 actions) and `actions/intelligence.ts`
(the 10 required Server Actions).

## Vocabulary reuse

`IntelligenceLevel` (`LOW`/`MEDIUM`/`HIGH`/`URGENT`) mirrors the `CarePriority`-shaped vocabulary already
established in Module 4. `ConfidenceLevel` (`LOW`/`MODERATE`/`HIGH`) is the exact same three-value
vocabulary as Module 3's `ProblemConfidenceLevel` — deliberately no "certain" value, for the same reason
Module 3 chose it: confidence should never claim certainty. Neither enum was redefined from scratch;
both are new local types in `lib/intelligence/types.ts` that intentionally match prior modules' shape
for consistency, since Prisma has no enum in this module to import them from.

## What was deliberately not built (Module 7's territory)

Per the module prompt's Constraints: no LLM, no chat UI, no prompt assembly, no response generation, no
Safety Engine, no Action Engine, no embeddings, no vector search. Nothing in `lib/intelligence/` imports
an LLM client, builds a prompt string for a model, or writes to any customer-facing surface.
