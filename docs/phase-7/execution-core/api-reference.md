# API Reference

All 8 actions live in `actions/execution.ts`, all `"use server"`, all call `await requireStaff();` as
their first line, all validate input through the matching schema in `lib/validations/execution.ts`, and
all return either `{ success: true, data: {...} }` or the standard `toErrorResponse(err)` shape.

## `validateSafety(input)`

Input: `{ decisionPackage: DecisionPackage, clearanceLayer?: PermissionLayer }` (defaults to `"PUBLIC"`).
Output: `{ safety: SafetyResult }`.

## `validatePolicy(input)`

Input: `{ decisionPackage, safety: SafetyResult, clearanceLayer? }`. Output: `{ policy: PolicyResult }`.

## `resolveEscalation(input)`

Input: `{ decisionPackage, safety: SafetyResult, policy: PolicyResult }`. Output: `{ escalation:
EscalationResult }`.

## `buildAction(input)`

Input: `{ decisionPackage, safety, policy, escalation: EscalationResult }`. Output: `{ action:
ActionResult }`.

## `composeResponseBlueprint(input)`

Input: `{ decisionPackage, safety, policy, escalation, action: ActionResult }`. Output: `{
responseBlueprint: ResponseBlueprint }`.

## `buildExecutionPackage(input)`

Input: `{ decisionPackage, safety, policy, escalation, action, clearanceLayer? }`. Internally recomputes
`responseBlueprint` (via `composeResponseBlueprint`), `explainability` (via `explainExecution`), and
`audit` (via `buildAuditMetadata`) from the supplied inputs before assembling — the caller only needs to
have the first 5 stage results ready, matching Module 6's `buildDecisionPackage` action's own "recompute
what's cheap, accept what's already done" pattern. Output: `{ executionPackage: ExecutionPackage }`.

## `executePipeline(input)`

Input: `{ decisionPackage: DecisionPackage, clearanceLayer?: PermissionLayer }`. Runs the full 6-stage
pipeline via `lib/execution/execution-orchestrator.ts`. Output: `{ executionPackage: ExecutionPackage }`.
This is the one action most future integrations are expected to call directly — the other 7 exist for
inspecting or re-running an individual stage.

## `explainExecution(input)`

Input: `{ decisionPackage, safety, policy, escalation, action }`. Output: `{ explainability:
ExecutionExplainability }`.

## Auth summary

| Action | Auth | Notes |
|---|---|---|
| `validateSafety` | `requireStaff()` | Highest-authority stage |
| `validatePolicy` | `requireStaff()` | |
| `resolveEscalation` | `requireStaff()` | |
| `buildAction` | `requireStaff()` | |
| `composeResponseBlueprint` | `requireStaff()` | |
| `buildExecutionPackage` | `requireStaff()` | Recomputes blueprint, audit, and explainability internally |
| `executePipeline` | `requireStaff()` | Runs the full 6-stage pipeline synchronously |
| `explainExecution` | `requireStaff()` | |

Every action independently calls `requireStaff()` — none relies on being called from within another
already-authorized action, per this codebase's standing rule that every exported Server Action is
independently callable as its own RPC endpoint (see `CLAUDE.md`).
