# Audit Metadata & Explainability

## Audit Metadata

`lib/execution/execution-package.ts` — `buildAuditMetadata(decisionPackage, policy, pipelineStages)`,
shared by both `executePipeline()` (the orchestrator) and the `buildExecutionPackage` Server Action, so
both build audit metadata identically rather than duplicating the shape.

| Field | Content |
|---|---|
| `executionTime` | ISO timestamp of assembly |
| `pipelineStages` | The ordered list of stage names that ran (`["safety-engine", "policy-validator", "escalation-resolver", "action-engine", "response-composer"]`) |
| `policyChecks` | `policy.checks.length` — always 7 |
| `safetyChecks` | Fixed `11` — the 11 dimensions Safety Engine always evaluates |
| `versionReferences` | IDs of every knowledge/care reference in the Decision Package |
| `decisionReferences` | `[decisionPackage.decision.decisionReason]` |
| `moduleReferences` | `["Module 5 - Knowledge Retrieval Core", "Module 6 - Intelligence Core", "Module 7 - Execution Core"]` |
| `timestamp` | Same as `executionTime` |
| `actor` | Fixed `"system"` — every call in this module is system/staff-initiated, never a customer action |

## "No customer-sensitive logging."

No field in `AuditMetadata` contains message content, customer identifiers, or free-text customer input —
every field is structural (counts, IDs, stage names, timestamps). This was a deliberate exclusion, not an
oversight: `decisionReferences` carries the *decision reason* (a Module 6-generated internal sentence
about the classification), never the customer's own message text.

## Explainability

`lib/execution/execution-explainability.ts` — `explainExecution(safety, policy, escalation, action,
decisionPackage)`.

| Required question | Answered by |
|---|---|
| Why executed? | `whyExecuted` — populated only when Safety approved, Policy is compliant, no escalation is required, and the action isn't `STOP_EXECUTION`; `null` otherwise |
| Why blocked? | `whyBlocked` — populated when Safety outcome is `BLOCKED` or the resulting action is `STOP_EXECUTION`; `null` otherwise |
| Why escalated? | `whyEscalated` — populated whenever `escalation.required`; `null` otherwise |
| Which policy triggered? | `policyTriggered` — `policy.violations`, passed through directly |
| Which safety rule triggered? | `safetyRuleTriggered` — `safety.reasons`, passed through directly |
| Which modules contributed? | `contributingModules` — fixed list: Intelligence Core (Module 6), Safety Engine, Policy Validator, Escalation Resolver, Action Engine, Response Composer |

`whyExecuted`/`whyBlocked`/`whyEscalated` are not mutually exclusive by type (a request could in
principle be both escalated and have a `whyBlocked` reason if `action === "STOP_EXECUTION"` for a
non-`BLOCKED` safety reason) — each is computed independently against its own specific condition, exactly
as the module prompt lists them as four separate questions, not a single status enum.

## "Never expose internal reasoning. No chain-of-thought."

Every string surfaced here is a short, composed summary sentence built from already-computed structured
fields (`safety.reasons`, `policy.violations`, `escalation.reason`) — never a dump of the full evaluation
process, and never anything resembling a model's internal reasoning (there is no model in this module to
begin with).
