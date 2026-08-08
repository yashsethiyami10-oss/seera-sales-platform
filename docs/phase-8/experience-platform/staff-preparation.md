# Staff-Facing Preparation: Handoff, Analytics, Review

All three are `requireStaff()`-gated (see [architecture.md](./architecture.md)) — unlike
`response-model.ts`, these deliberately DO surface Module 6/7's internal fields, since their audience is
staff, not the customer.

## Human Handoff Preparation — `lib/experience/handoff-preparer.ts`

`buildHandoffPackage(sessionId, executionPackage)` returns `{ sessionId, required, target, reason,
priorityLevel, safetyOutcome, customerContextSummary, generatedAt }` — `target`/`reason` come straight
from Module 7's `EscalationResult`, `safetyOutcome` from Module 7's `SafetyResult`, `priorityLevel` from
Module 6's `PriorityResult`. A support agent or review team needs the real reason a request escalated,
not the generic customer-facing notice `response-model.ts` shows instead.

## Analytics Event Preparation — `lib/experience/analytics-preparer.ts`

`prepareAnalyticsEvents(sessionId, executionPackage)` returns structured `AnalyticsEvent[]` —
computation-only, no persistence (see [architecture.md](./architecture.md) for why this differs from
Feedback Capture). Always includes one `MESSAGE_PROCESSED` event carrying internal classification
(priority category/level, emotional state, safety outcome, execution status, action type, confidence
level) as `properties`; adds an `ESCALATION_TRIGGERED` event when `escalation.required`. For a future
analytics ingestion pipeline (not built) to consume — nothing in this module writes to an events table.

## Founder/Admin Review Preparation — `lib/experience/review-preparer.ts`

`buildReviewPackage(sessionId, executionPackage, experienceResponse)` bundles the full, unredacted
`DecisionPackage` and `ExecutionPackage` alongside the `ExperienceResponse` the customer actually
received — letting a reviewer compare "what the system knew and decided" against "what the customer was
shown" in one place. `flaggedForReview` is `true` when `escalation.required` or `executionStatus` is
`BLOCKED`/`RESTRICTED`/`NEEDS_HUMAN_REVIEW` — a fixed, deterministic flag, not a judgment call this
function makes itself.

## A known gap: no lookup by session ID alone

None of these three actions can be called with only a `sessionId` — each requires the caller to also
supply the `ExecutionPackage` directly, because Module 8 does not persist per-turn `ExecutionPackage`/
`DecisionPackage` history (only session identity and accumulated conversation memory are persisted). See
[known-limitations.md](./known-limitations.md).
