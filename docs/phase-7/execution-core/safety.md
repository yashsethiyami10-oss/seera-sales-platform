# Safety Engine

`lib/execution/safety-engine.ts` — `validateSafety(decisionPackage, clearanceLayer)`.

## "This is the highest authority."

Every other stage in this module reads Safety's `SafetyResult`; Safety itself reads only the Decision
Package and the caller's clearance layer — nothing produced by a later stage. `SAFETY_MIN_CONFIDENCE_SCORE
= 35` is the one tunable constant in this file, deliberately set to match Module 6's own
`confidence-engine.ts` LOW/MODERATE boundary (also 35) — see "A structural finding" below for why this
choice matters.

## The 11 evaluated dimensions

| Dimension | Field | Rule |
|---|---|---|
| Confidence Threshold | `confidenceThresholdMet` | `decisionPackage.confidence.score >= 35` |
| Missing Information | `missingInformationBlocking` | `requiredInformation.length > 0 && confidence.level === "LOW"` |
| Restricted Actions | `restrictedActionDetected` | `priority.category === "SAFETY"` |
| Permission Layer | `permissionLayerOk` | not `(BUSINESS_CRITICAL or SAFETY category) && clearanceLayer === "PUBLIC"` |
| Required Escalation | `escalationRequired` | `escalationRecommendation \|\| cqSummary.escalationNeed` |
| Human Review Requirement | `humanReviewRequired` | SAFETY category, or `trustRisk === "URGENT"`, or (URGENT priority + LOW confidence) |
| Customer Safety | `customerSafetyOk` | `priority.category !== "SAFETY"` |
| Business Safety | `businessSafetyOk` | not `(BUSINESS_CRITICAL && confidence.level === "LOW")` |
| Truthfulness | `truthfulnessOk` | `confidence.level !== "LOW"` |
| Transparency | `transparencyOk` | not `(cqSummary.transparencyNeeded && confidence.level === "LOW")` |
| Policy Compliance | `policyCompliant` | `!restrictedActionDetected \|\| escalationRequired` (Safety's own coarse read — see [architecture.md](./architecture.md) for why this doesn't call the later Policy Validator) |

Every flagged (false/true-in-the-blocking-direction) dimension appends a human-readable entry to `reasons`
— nothing here is a silent boolean with no trace.

## The 8 outcomes (fixed, first-match-wins cascade)

```
1. !customerSafetyOk && !escalationRequired  -> BLOCKED              (defensive — see below)
2. !customerSafetyOk || restrictedActionDetected -> NEEDS_HUMAN_REVIEW
3. !permissionLayerOk                        -> RESTRICTED
4. missingInformationBlocking                -> NEEDS_MORE_INFORMATION
5. escalationRequired                        -> ESCALATED
6. !confidenceThresholdMet                   -> DEFERRED
7. policyCompliant && businessSafetyOk
   && truthfulnessOk && transparencyOk       -> APPROVED
8. else                                      -> UNKNOWN
```

## A structural finding: two branches are defensive, not reachable via honest Module 6 output

- **Branch 1 (`BLOCKED`)** requires `!customerSafetyOk && !escalationRequired` — but Module 6's own
  `cq-engine.ts` always sets `escalationNeed: true` whenever `priority.category === "SAFETY"` (its first
  disjunct). Since `customerSafetyOk` is false exactly when `priority.category === "SAFETY"`, and that
  always implies `cqSummary.escalationNeed === true` in genuine Module 6 output, `escalationRequired` is
  always true whenever `customerSafetyOk` is false — branch 1 cannot fire against a real
  `buildIntelligence()` result. It is retained as a defensive fallback in case that Module 6 invariant
  ever changes, verified directly by test (see [testing.md](./testing.md)).
- **Branch 8 (`UNKNOWN`)** requires `confidenceThresholdMet` (score ≥ 35) to be true while simultaneously
  `businessSafetyOk`/`truthfulnessOk`/`transparencyOk` are false — but all three of those depend on
  `confidence.level === "LOW"`, and Module 6's `confidence-engine.ts` sets `level: "LOW"` exactly when
  `score < 35` — the identical threshold. So a genuinely Module-6-produced `DecisionPackage` can never
  have `score >= 35` and `level === "LOW"` at once, meaning `UNKNOWN` cannot fire against real Module 6
  output either. It is retained for a `DecisionPackage` with an internally inconsistent `confidence`
  object (e.g., hand-constructed or corrupted input) — verified directly by test with a deliberately
  inconsistent fixture.

Both findings are disclosed here rather than silently removing the "unreachable" branches — a defensive
branch that can never fire against *today's* upstream code is still the correct, conservative choice for
input this module cannot fully control the provenance of.

## "If Safety blocks execution, no further execution occurs"

**Corrected post-founder-review.** This is now a true short-circuit at the orchestrator level, scoped
exactly to the `BLOCKED` and `RESTRICTED` outcomes: `executePipeline()` returns immediately after this
stage for those two outcomes, via `buildSafetyShortCircuitPackage()` in `execution-orchestrator.ts` —
`validatePolicy()`, `resolveEscalation()`, `buildAction()`, and `composeResponseBlueprint()` are never
called. The other 6 outcomes still run the full pipeline and rely on the Action Engine's own conservative
-action cascade (see [actions.md](./actions.md)). See
[execution-pipeline.md](./execution-pipeline.md#two-execution-paths-through-this-pipeline) for the full
mechanics and [testing.md](./testing.md) for the proof that no downstream stage is invoked for these two
outcomes.
