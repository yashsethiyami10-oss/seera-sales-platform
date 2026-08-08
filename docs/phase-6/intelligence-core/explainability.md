# Explainability

`lib/intelligence/explainability.ts` — `explainDecision(priority, eq, cq, decision, trace)`.

## "No black-box decisions."

This engine answers the four questions the module prompt requires, directly from already-computed stage
outputs — it re-derives nothing and guesses nothing, it summarizes what the pipeline already knows about
itself.

| Required question | Answered by |
|---|---|
| Why this recommendation? | `why` — one composed sentence referencing priority category/level, EQ state, and CQ escalation flag |
| What evidence supported it? | `evidence` — concatenated, source-prefixed evidence from Priority, EQ, and CQ (`"Priority: ..."`, `"EQ: ..."`, `"CQ: ..."`) |
| What information is missing? | `missingInformation` — taken directly from `decision.informationStillNeeded` |
| Which modules contributed? | `contributingModules` — built conditionally (see below) |

## Contributing Modules logic

Always included: `"Priority Engine"`, `"Context Engine"`, `"CQ Engine"`, `"Decision Intelligence
Engine"`. Conditionally included: `"EQ Engine"` only if `eq.state !== "UNKNOWN"` (an unknown emotional
read didn't meaningfully contribute), and `"Knowledge Retrieval Core (Module 5)"` only if
`decision.recommendedKnowledge.length > 0` — this is the one place Module 5 is explicitly named as a
contributing source in the output, acknowledging retrieval's role in the decision rather than treating it
as invisible plumbing.

## What is deliberately excluded

No chain-of-thought, no model-internal reasoning, no raw request payloads. `evidence` is a curated list
of the same short evidence strings each engine already produced for its own explainability — never a
dump of every input field. This satisfies "never expose internal reasoning" from the Reasoning Trace
requirement, applied here too since Explainability is the other half of the same transparency
requirement.
