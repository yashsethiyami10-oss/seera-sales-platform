# Execution Pipeline

The frozen stage order, exactly as specified in the Module 7 prompt, implemented in
`lib/execution/execution-orchestrator.ts`'s `executePipeline()` as six sequential, individually commented
steps. No stage was reordered, merged, or skipped.

```
Decision Package
     |
1. Safety Engine            (highest authority)
     |
2. Policy Validation
     |
3. Escalation Resolution
     |
4. Action Engine
     |
5. Response Composer
     |
6. Execution Package
```

## Stage 1 — Safety Engine

`validateSafety(decisionPackage, clearanceLayer)`. The first and highest-authority stage — every
downstream stage reads its `SafetyResult`, but Safety itself reads nothing produced downstream. Evaluates
11 fixed dimensions and returns one of 8 fixed outcomes. See [safety.md](./safety.md).

**Short-circuit checkpoint (corrected post-founder-review).** Immediately after this stage,
`executePipeline()` checks whether `safety.outcome` is `BLOCKED` or `RESTRICTED`. If so, it returns
immediately via `buildSafetyShortCircuitPackage()` — stages 2–5 below are never invoked for these two
outcomes. Everything below this point in this document (stages 2–5) applies only to the other 6 Safety
Outcomes (`APPROVED`, `NEEDS_HUMAN_REVIEW`, `NEEDS_MORE_INFORMATION`, `ESCALATED`, `DEFERRED`,
`UNKNOWN`).

## Stage 2 — Policy Validation

`validatePolicy(decisionPackage, safety, clearanceLayer)`. Reads the Decision Package and Safety's
already-computed result; validates 7 fixed policy areas independently. Never modifies Safety's outcome or
the Decision Package — returns its own structured `PolicyResult`. See [policy.md](./policy.md).

## Stage 3 — Escalation Resolution

`resolveEscalation(decisionPackage, safety, policy)`. Determines whether execution should escalate and to
which of 8 fixed targets, informed by both Safety and Policy's results plus the Decision Package's own
escalation-flavored fields (`escalationRecommendation`, `cqSummary.escalationNeed`). See
[escalation.md](./escalation.md).

## Stage 4 — Action Engine

`buildAction(decisionPackage, safety, policy, escalation)`. Determines the next executable action from 9
fixed types. Only reached for the 6 non-`BLOCKED`/`RESTRICTED` outcomes (see Stage 1's short-circuit
checkpoint above) — within those 6, Safety's outcome still dominates the cascade, and only a fully
`APPROVED` + policy-compliant + non-escalating case reaches the branch that can select a customer-facing
recommendation action. See [actions.md](./actions.md).

## Stage 5 — Response Composer

`composeResponseBlueprint(decisionPackage, safety, policy, escalation, action)`. Builds a structural
Response Blueprint — never customer language — shaped by the action determined in stage 4 and the
restrictions/notices carried forward from Safety and Escalation. See
[response-blueprint.md](./response-blueprint.md).

## Stage 6 — Execution Package

Two steps happen here, both in the orchestrator, before the package itself is assembled:
`explainExecution(safety, policy, escalation, action, decisionPackage)` builds the Explainability
Metadata, `buildAuditMetadata(decisionPackage, policy, stages)` builds the Audit Metadata, then
`buildExecutionPackage({...})` bundles every stage's output into the one object a future integration
layer will consume. See [execution-package.md](./execution-package.md) and [audit.md](./audit.md).

## What is NOT in the pipeline

No stage calls an LLM, builds a customer-facing sentence, writes to any database table, or performs an
external integration call. The pipeline has zero side effects anywhere — a genuine improvement in
isolation over Module 6, whose first stage still touched Module 5's retrieval telemetry indirectly.

## Two execution paths through this pipeline

| Safety Outcome | Path | Stages actually invoked |
|---|---|---|
| `BLOCKED`, `RESTRICTED` | Short-circuit | Safety Engine only (1 of 6) |
| `APPROVED`, `NEEDS_HUMAN_REVIEW`, `NEEDS_MORE_INFORMATION`, `ESCALATED`, `DEFERRED`, `UNKNOWN` | Normal | All 6 stages |

`audit.pipelineStages` on the returned `ExecutionPackage` is the ground truth for which path a given call
actually took — see [audit.md](./audit.md) and [testing.md](./testing.md).
