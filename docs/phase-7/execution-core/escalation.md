# Escalation Resolver

`lib/execution/escalation-resolver.ts` — `resolveEscalation(decisionPackage, safety, policy)`.

## "Determine whether execution should escalate... Support structured metadata only."

Returns `{ target, required, reason, triggeredBy }` — never a customer-facing escalation message, only
structured routing metadata for whatever team-assignment system a future integration builds.

## The 8 fixed targets

`NONE`, `CUSTOMER_SUPPORT`, `TECHNICAL_TEAM`, `SALES_TEAM`, `INSTITUTIONAL_SALES`, `FOUNDER_REVIEW`,
`SAFETY_REVIEW`, `FUTURE_TEAM` — exactly the 8 named in the module prompt. `FUTURE_TEAM` exists in the
type but is never produced by current logic — it's a reserved value for a team-routing category not yet
defined, matching the module prompt's own "Future Teams" line item.

## Target selection (fixed, first-match-wins cascade)

```
1. priority.category === "SAFETY"                              -> SAFETY_REVIEW
2. safety.outcome === "NEEDS_HUMAN_REVIEW"                      -> FOUNDER_REVIEW
3. priority.category === "BUSINESS_CRITICAL"
     institutionalContext present                               -> INSTITUTIONAL_SALES
     else                                                        -> FOUNDER_REVIEW
4. priority.category === "SALES_OPPORTUNITY"                    -> SALES_TEAM
5. priority.category === "PRODUCT_ISSUE"                        -> TECHNICAL_TEAM
6. priority.category === "COMPLAINT"                            -> CUSTOMER_SUPPORT
7. escalationRecommendation (no more specific category matched) -> CUSTOMER_SUPPORT
8. else                                                          -> NONE
```

`required = target !== "NONE"`.

## `triggeredBy` — the evidence trail

Independent of which target wins, `triggeredBy` accumulates every contributing fact found: a non
-`APPROVED` safety outcome, any policy violations, Care Quotient's own escalation need, and the Decision
Package's own escalation recommendation. This means a founder reviewing an `EscalationResult` can see
*why* escalation was considered even when the specific target-selection branch that fired used a
different, more specific signal (e.g., `SALES_OPPORTUNITY` firing branch 4 doesn't depend on
`triggeredBy` being non-empty — a legitimate sales-opportunity escalation may have no Safety/Policy
concerns at all).

## Escalation Resolver doesn't decide what happens after escalation

Determining *whether* and *to whom* is this stage's entire job. What action results from an escalation
(`ESCALATE` vs. some other type) is the Action Engine's decision, one stage later — see
[actions.md](./actions.md).
