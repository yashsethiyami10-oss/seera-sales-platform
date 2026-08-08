# Execution Package

`lib/execution/execution-package.ts` — `buildExecutionPackage(params)`.

## Pure assembly

Every field was already computed by an earlier stage; this file combines them, with one derived field:
`executionStatus`.

## Fields

`{ decisionPackage, safety, policy, escalation, action, responseBlueprint, executionStatus,
executionConfidence, executionMetadata, audit, explainability, executionHints, generatedAt }` — exactly
the module prompt's required Execution Package contents, no customer text anywhere.

`executionConfidence` is taken directly from `action.confidence` (already the most conservative reading
by the time Action Engine produced it — see [actions.md](./actions.md)) rather than recomputed.
`executionMetadata` carries only `{ clearanceLayer }` — the one piece of caller context this module needs
to remember about how the run was authorized.

## Execution Status — 7 fixed values, near-mirror of Safety Outcome

```
1. safety.outcome === "BLOCKED"                -> BLOCKED
2. safety.outcome === "RESTRICTED"              -> RESTRICTED
3. safety.outcome === "NEEDS_MORE_INFORMATION"  -> NEEDS_MORE_INFORMATION
4. safety.outcome === "NEEDS_HUMAN_REVIEW"      -> NEEDS_HUMAN_REVIEW
5. safety.outcome === "DEFERRED"                -> DEFERRED
6. escalation.required or safety.outcome
   === "ESCALATED"                              -> ESCALATED
7. safety.outcome === "APPROVED"                -> EXECUTED
8. else (safety.outcome === "UNKNOWN")          -> BLOCKED  (never leave status ambiguous)
```

`ExecutionStatus` deliberately mirrors `SafetyOutcome` for every named Safety outcome — branches 1–5 map
1:1. The one addition is branch 6: `escalation.required` can independently produce `ESCALATED` even from
an otherwise-`APPROVED` safety read (e.g. a legitimate sales-opportunity routing to the sales team is not
a safety concern, but is still an escalation). Named Safety outcomes are checked *before* the generic
escalation check, so a `NEEDS_HUMAN_REVIEW` safety outcome that also happens to have
`escalation.required === true` still reports `NEEDS_HUMAN_REVIEW`, not `ESCALATED` — the more specific
signal wins. Verified directly by test (see [testing.md](./testing.md)).

## `executionHints`

`{ suggestedAction, escalationTarget, executionStatus, requiresHumanReview }` — the Execution Core
counterpart to Module 6's own `executionHints` field on `DecisionPackage`, giving a future integration
layer a flat, easy-to-branch-on summary without having to walk the full nested package.

## Short-circuited packages (corrected post-founder-review)

For `BLOCKED`/`RESTRICTED` Safety Outcomes, `buildExecutionPackage()` is still the function that produces
the final `ExecutionPackage` — the type itself was not redesigned — but it is called from
`execution-orchestrator.ts`'s `buildSafetyShortCircuitPackage()` helper with minimal, explicitly-labeled
`policy`/`escalation`/`action`/`responseBlueprint` values instead of the real output of those stages
(which were never invoked). Concretely: `policy.checks` is `[]` and `policy.violations` contains the
literal marker `"POLICY_VALIDATION_NOT_RUN_SAFETY_SHORT_CIRCUIT"`; `action.action` is `"STOP_EXECUTION"`;
`escalation.required` is `true` with a target of `SAFETY_REVIEW` (`BLOCKED`) or `FOUNDER_REVIEW`
(`RESTRICTED`); `responseBlueprint` carries only restriction/safety-note content, no knowledge or care
references. `deriveExecutionStatus()` itself is unchanged and still correctly resolves these to `BLOCKED`
/`RESTRICTED` respectively — see [safety.md](./safety.md) and [testing.md](./testing.md).
