# Safe Rendering: Response Model & Website Channel Adapter

## Response Model — `lib/experience/response-model.ts`

`buildExperienceResponse(sessionId, executionPackage)` is the single point where a customer-safe
`ExperienceResponse` is derived from Module 7's staff-facing `ExecutionPackage`.

### What it reads

Only `executionPackage.action.action`, `.action.targetReferences`, `.escalation.required`,
`.executionStatus`, and `.responseBlueprint.toneGuidance` (tone *words* only — "empathetic",
"reassuring" — never the reasoning text alongside them).

### What it deliberately never reads

`safety.reasons`, `policy.violations`, `responseBlueprint.safetyNotes`, `.restrictions`,
`.escalationNotice`, `.intent` (Module 7's `intent` field is itself an *instruction for a future LLM*,
e.g. `"Directly answer the customer's request using retrieved knowledge."` — not customer copy). None of
these strings are internal-reasoning-free; all are explicitly staff-facing by Module 7's own design.

### How customer-visible text is produced

A fixed lookup table, `CUSTOMER_MESSAGE_BY_ACTION: Record<ActionType, string>` — one hand-written, safe,
generic sentence per one of Module 7's 9 action types (e.g. `ESCALATE` → `"Thanks for reaching out —
we're connecting you with our team, who will follow up shortly."`). This is deterministic template
selection, not generation — no LLM, per the module's own constraint.

### Blocks

`MESSAGE` (always one, from the lookup table) → `REFERENCE_CARD` (one per `action.targetReferences`
entry — already scoped correctly per action type by Module 7's Action Engine, e.g. only populated for
`RECOMMEND_PRODUCT`/`RECOMMEND_CARE_WORKFLOW`/`RECOMMEND_KNOWLEDGE`) → `FOLLOW_UP_QUESTION` (only for
`ASK_FOLLOW_UP_QUESTION`/`COLLECT_INFORMATION`) → `ESCALATION_NOTICE` (only when
`escalation.required` — always the single fixed generic string, never `responseBlueprint.escalationNotice`
which contains the raw target name and internal reason).

### Why trusting `action.action` alone is sufficient

Module 7's Action Engine already guarantees: any non-`APPROVED` Safety outcome resolves to one of
`STOP_EXECUTION`/`ESCALATE`/`COLLECT_INFORMATION`/`WAIT` — never a customer-facing recommendation action
(see Module 7's `actions.md`). So this file does not need to separately re-check `safety.outcome` or
`executionStatus` to decide whether it's safe to show content; trusting `action.action` is equivalent to
trusting Safety's own verdict, one level removed, without duplicating Safety's own logic.

## Website Channel Adapter — `lib/experience/website-channel-adapter.ts`

`adaptForWebsite(response)` converts the channel-neutral `ExperienceResponse` (typed blocks) into a flat,
ordered array of `WebsiteExperienceSegment` (`{ kind, content, meta? }`) — the shape a website chat widget
would actually render. Purely structural; introduces no new safety logic (there's nothing left to filter
by the time a response reaches this stage). The only channel implemented — see
[known-limitations.md](./known-limitations.md).

## Proof this boundary holds

Tested directly: constructing `BLOCKED`/`ESCALATE` `ExecutionPackage` fixtures carrying real internal
strings (`safety.reasons`, a `POLICY_VALIDATION_NOT_RUN_SAFETY_SHORT_CIRCUIT` marker,
`responseBlueprint.escalationNotice` containing the raw target name) and asserting via
`JSON.stringify(response).includes(...)` that none of those strings appear anywhere in the resulting
`ExperienceResponse`. See [testing.md](./testing.md).
