# Response Blueprint

`lib/execution/response-composer.ts` — `composeResponseBlueprint(decisionPackage, safety, policy,
escalation, action)`.

## "This module does NOT generate customer language. It builds a Response Blueprint."

Every field below is a structural instruction — an intent label, tone words, a structure outline,
restriction strings — for a future LLM integration (not built) to convert into an actual customer-facing
sentence. No field in `ResponseBlueprint` is itself customer-readable prose.

## Fields

| Field | Source |
|---|---|
| `intent` | Fixed lookup table, one sentence per `ActionType` (`INTENT_BY_ACTION`) |
| `toneGuidance` | Derived from `cqSummary` — `["reassuring"]` if `reassuranceNeeded`, `["empathetic"]` if high/urgent `empathyLevel`, `["transparent"]` if `transparencyNeeded`, `["calm and precise"]` if high/urgent `trustRisk`; `["neutral"]` if none apply |
| `requiredInformation` | Passed through from `decisionPackage.requiredInformation` unchanged |
| `knowledgeReferences` | `decisionPackage.knowledgeReferences`, shown only for `RECOMMEND_KNOWLEDGE`/`ANSWER_CUSTOMER` actions, else `[]` |
| `careReferences` | `decisionPackage.careReferences`, shown only for `RECOMMEND_CARE_WORKFLOW`, else `[]` |
| `suggestedStructure` | Fixed lookup table, one ordered outline per `ActionType` (`STRUCTURE_BY_ACTION`) — empty for `STOP_EXECUTION`/`WAIT` |
| `restrictions` | Built from Safety's `truthfulnessOk`/`transparencyOk` flags, every Policy violation, and a hard restriction when `action === "STOP_EXECUTION"` |
| `transparencyRequirements` | "Disclose basis and confidence" if `cqSummary.transparencyNeeded`; "state this required escalation" if `escalation.required` |
| `escalationNotice` | `escalation.required ? "Escalation to {target} is required: {reason}" : null` |
| `safetyNotes` | `safety.reasons`, passed through directly |

## Why references are gated by action type

Showing `knowledgeReferences` on a blueprint whose action is `STOP_EXECUTION` would be misleading — there
is nothing safe to share. Each reference array is only populated when the action that would use it was
actually selected, so a future LLM integration reading this blueprint can never be handed content it has
no approved action to use.

## `safetyNotes` is Safety's own evidence, verbatim

Rather than re-summarizing why Safety reached its outcome, the blueprint carries Safety's own `reasons`
array forward unchanged — the same "don't re-derive what's already computed" discipline used throughout
this module (Policy deferring to Safety's `permissionLayerOk`, Explainability reading Safety/Policy's own
fields directly).
