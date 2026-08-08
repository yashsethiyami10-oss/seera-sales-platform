# Policy Validator

`lib/execution/policy-validator.ts` — `validatePolicy(decisionPackage, safety, clearanceLayer)`.

## "Policy Validator never modifies decisions. It only validates."

Structurally enforced: the function's return type is a brand-new `PolicyResult` object; nothing in this
file writes back into the `DecisionPackage` or the `SafetyResult` parameters it receives.

## The 7 fixed check areas

| Area | Rule | Reason string |
|---|---|---|
| `COMPANY_POLICY` | not `(priority.category === "SAFETY" && !safety.escalationRequired)` | A SAFETY-category priority must be flagged for escalation under company policy |
| `CARE_POLICY` | not `cqSummary.escalationNeed` or `escalationRecommendation` matches it | If Care Quotient flags an escalation need, the Decision Package's own recommendation must agree |
| `KNOWLEDGE_POLICY` | `outstandingQuestions.length === requiredInformation.length` | These two Module 6 fields must stay consistent with each other |
| `PERMISSION_LAYER` | `safety.permissionLayerOk` | Reflects Safety's own already-computed determination rather than re-deriving it |
| `BUSINESS_RULES` | not `(BUSINESS_CRITICAL && clearanceLayer === "PUBLIC")` | Business-critical situations require at least INTERNAL clearance |
| `RESPONSE_RULES` | not `cqSummary.transparencyNeeded` or a `decisionReason` exists | Transparency requires a documented reason to be transparent about |
| `SAFETY_RULES` | `safety.outcome !== "BLOCKED" && safety.outcome !== "RESTRICTED"` | Policy cannot certify a request Safety has already blocked or restricted |

`compliant = violations.length === 0`. `violations` lists the failed areas by name.

## Why `KNOWLEDGE_POLICY` and `RESPONSE_RULES` are structural consistency checks, not independent judgments

Looking at `lib/intelligence/decision-package.ts` (Module 6), `outstandingQuestions` and
`requiredInformation` are both assigned from the exact same source array
(`decision.informationStillNeeded`) — so `KNOWLEDGE_POLICY` is, by construction, always true against
genuine Module 6 output; it exists as a defensive consistency guard, not a check expected to ever fail in
practice, the same honest-disclosure spirit as the two defensive Safety Engine branches (see
[safety.md](./safety.md)). Similarly, `decisionReason` is never empty in genuine Module 6 output (it's
always a composed sentence — see `lib/intelligence/decision-engine.ts`), so `RESPONSE_RULES` is expected
to always pass against real input too. Both checks were kept anyway because they validate a real
invariant a hand-constructed or corrupted `DecisionPackage` could violate, and Policy Validator's job is
to validate, not to assume the input is well-formed.

## Why `PERMISSION_LAYER` and `SAFETY_RULES` defer to Safety instead of re-deriving

Policy Validator runs *after* Safety in the frozen pipeline order and has full access to Safety's already
-computed result. Re-deriving permission-layer or safety-blocking logic independently here would risk the
two stages silently disagreeing with each other over time as either file changes. Deferring to Safety's
own fields for these two specific checks is a deliberate design choice to keep Safety as the single source
of truth for permission and blocking decisions, while still giving Policy Validator its own named check
area to report against (per the module prompt's required 7 areas) — this is "reflecting," not
"modifying," Safety's authority.
