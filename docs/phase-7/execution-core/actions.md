# Action Engine

`lib/execution/action-engine.ts` — `buildAction(decisionPackage, safety, policy, escalation)`.

## "Determine the next executable action... Do not actually execute. Return structured action objects."

Nothing in this file calls an external system, sends a message, or mutates anything — it returns an
`ActionResult` (`{ action, targetReferences, reason, confidence }`) for a future integration layer to
carry out.

## The 9 fixed action types

`ANSWER_CUSTOMER`, `ASK_FOLLOW_UP_QUESTION`, `RECOMMEND_PRODUCT`, `RECOMMEND_CARE_WORKFLOW`,
`RECOMMEND_KNOWLEDGE`, `ESCALATE`, `STOP_EXECUTION`, `COLLECT_INFORMATION`, `WAIT` — exactly the 9 named
in the module prompt.

## This is where "if Safety blocks, no further execution occurs" is enforced

The cascade checks Safety's outcome first, and only a fully `APPROVED` safety outcome with a compliant
policy result reaches the branch that can select a customer-facing recommendation action:

```
1. safety.outcome === "BLOCKED"                 -> STOP_EXECUTION
2. escalation.required
   or safety.outcome in {NEEDS_HUMAN_REVIEW,
                          RESTRICTED, ESCALATED} -> ESCALATE
3. safety.outcome === "NEEDS_MORE_INFORMATION"   -> COLLECT_INFORMATION
4. safety.outcome === "DEFERRED"                 -> WAIT
5. safety.outcome === "UNKNOWN"                  -> STOP_EXECUTION  (never act on an unresolved safety read)
6. !policy.compliant (despite safety approval)   -> STOP_EXECUTION
7. safety.outcome === "APPROVED" && policy.compliant:
   a. decision.requiredCareWorkflow exists       -> RECOMMEND_CARE_WORKFLOW
   b. PRODUCT_ISSUE priority + product refs      -> RECOMMEND_PRODUCT
   c. knowledgeReferences non-empty              -> RECOMMEND_KNOWLEDGE
   d. requiredInformation non-empty              -> ASK_FOLLOW_UP_QUESTION
   e. else                                       -> ANSWER_CUSTOMER
```

Every one of branches 1–6 resolves to a conservative, non-committal action (`STOP_EXECUTION`, `ESCALATE`,
`COLLECT_INFORMATION`, or `WAIT`) — none of them can ever produce `ANSWER_CUSTOMER`,
`RECOMMEND_PRODUCT`, `RECOMMEND_CARE_WORKFLOW`, or `RECOMMEND_KNOWLEDGE`. Those four "act" actions are
reachable only through branch 7, which requires both Safety approval and Policy compliance
simultaneously.

## `targetReferences`

Only populated for the actions that name something specific to recommend: `RECOMMEND_CARE_WORKFLOW`
carries the one required care workflow reference; `RECOMMEND_PRODUCT` carries `productReferences`;
`RECOMMEND_KNOWLEDGE` carries `knowledgeReferences`. Every other action type returns an empty array —
there is nothing concrete to reference when stopping, escalating, waiting, or asking a question.

## Confidence

`ActionResult.confidence` is `"LOW"` for every non-branch-7 outcome (stage 1–6) — an action taken under
anything short of full Safety approval cannot claim more than low confidence, regardless of what Module
6's own `DecisionPackage.confidence` said. Only branch 7 (`APPROVED` + compliant) passes through Module
6's own `confidence.level` directly — Execution Core never manufactures a *higher* confidence than
Intelligence Core already computed, only a more conservative one when its own gates aren't satisfied.
