# Decision Intelligence Engine

`lib/intelligence/decision-engine.ts` — `buildDecision(priority, context, memory, eq, cq)`.

## "The engine recommends. It never executes."

`recommendedNextStep` is always a short, plain-language *instruction label* meant for a future Execution
Core (Module 7) to act on — e.g. `"Escalate to human support"`, `"Guide customer through care workflow:
Patch Test Protocol"` — never a sentence written for a customer to read, and nothing in this file calls
an LLM, assembles a prompt, or drafts a reply.

## Recommendation cascade (fixed, first match wins)

```
1. escalationRequirement (= cq.escalationNeed)  -> "Escalate to human support"
2. requiredCareWorkflow exists                  -> "Guide customer through care workflow: {label}"
3. recommendedKnowledge is non-empty            -> "Share relevant knowledge: {top result label}"
4. none of the above                            -> "Ask a clarifying question to gather more information before proceeding"
```

`escalationRequirement` is taken directly from `cq.escalationNeed` — Decision does not re-derive
escalation itself, it trusts CQ's already-computed value, keeping escalation logic in exactly one place.

## Recommended Knowledge and Care Workflow

- `recommendedKnowledge` — the top 3 items from `context.retrievedKnowledge` (already ranked by Module
  5), mapped to `SourceReference`.
- `requiredCareWorkflow` — the first referenced care workflow from Context (`referencedCareWorkflows[0]`
  ?? null), i.e. whichever the Context Engine already grouped from retrieval; Decision does not do its
  own workflow selection.

## Information Still Needed (4 fixed heuristic checks)

| Check | Triggers when |
|---|---|
| No matching knowledge | `context.retrievedKnowledge.length === 0` |
| No customer goal | `!context.customerGoal` |
| No product reference | `priority.category === "PRODUCT_ISSUE" && context.referencedProducts.length === 0` |
| No memory | `memory.items.length === 0` |

Each triggered check both feeds `informationStillNeeded` (surfaced to the caller) and reduces confidence
(see below) — missing information always has a measurable cost, never just a cosmetic note.

## Alternative Options

Built conditionally: if escalating, offers "try self-service first, then escalate" as the alternative;
if not escalating, offers "escalate if the customer indicates dissatisfaction" as the alternative. A
second `recommendedKnowledge` item (if present) and a high `followUpImportance` from CQ each add their
own alternative line.

## Confidence

`evidenceCount = priority.evidence.length + eq.evidence.length + cq.evidence.length +
context.retrievedKnowledge.length`, evaluated against `MAX_EXPECTED_EVIDENCE = 8` via the shared
Confidence Engine ([confidence.md](./confidence.md)), penalized by `informationStillNeeded.length`. This
is the same formula used everywhere else in the module — Decision does not have its own separate
confidence logic, it's a consumer of the shared one.

## Decision Reason

A single composed sentence summarizing every input that fed the decision (`Priority=...; EQ=...; CQ
requiredCareLevel=..., escalationNeed=...; N knowledge result(s) retrieved.`) — the human-readable
counterpart to the structured `DecisionResult` fields, one required field short of full Explainability
Metadata (which the Explainability Engine builds separately, stage 8).
