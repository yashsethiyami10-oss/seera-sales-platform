# Execution Core

**Module 7 of the MUV Intelligence Platform.** Implemented, code- and script-verified, awaiting founder review.

## What Execution Core is

A read-only, fully synchronous policy layer that consumes the Decision Package Module 6 produces and
determines: can this be executed, what action should occur, and what response structure should be
prepared. Think of Module 6 as the analyst who writes a structured briefing, and Module 7 as the
compliance officer who reads that briefing and decides what's actually allowed to happen next — the
compliance officer never rewrites the analyst's findings, only validates, protects, and prepares them
for whoever acts on them next.

## What Execution Core is not

- **Not the AI/LLM.** No prompt assembly, no response generation. `composeResponseBlueprint()` builds a
  structural instruction set for a future LLM to follow — never a customer-facing sentence.
- **Not knowledge retrieval or reasoning.** This module never calls Module 5 or Module 6 — it only
  consumes their already-produced `DecisionPackage` type. See [architecture.md](./architecture.md).
- **Not a database-touching module at all.** Unlike every prior module, `lib/execution/` has zero Prisma
  imports and zero mutation calls — confirmed by direct grep, not just design intent (see
  [testing.md](./testing.md)).
- **Not the integration layer.** No WhatsApp, no email, no order system, no chat UI, no tool calling.
  Those are explicitly named as belonging to later integrations this module does not build.

## Core principle

"Execution never changes the decision. Execution validates, protects and prepares it." Nothing in this
module can alter a `PriorityResult`, `EQResult`, `CQResult`, or `DecisionResult` from Module 6 — those
are only ever read, never written.

## The frozen pipeline

Decision Package → Safety Engine → Policy Validation → Escalation Resolution → Action Engine → Response
Composer → Execution Package. See [execution-pipeline.md](./execution-pipeline.md) for the stage-by-stage
implementation, including how "if Safety blocks execution, no further execution occurs" is actually
enforced (at the Action Engine's conclusion, not by skipping pipeline stages).

## Same RBAC shape as Module 6, for the same reason

All 8 actions are `requireStaff()`-gated — this is internal policy/safety infrastructure for a
not-yet-built integration layer (WhatsApp/Email/Website/Admin), not a direct customer-facing surface
itself. See [architecture.md](./architecture.md).

## Where to go next

- [architecture.md](./architecture.md) — design decisions, including why this module never touches a database
- [execution-pipeline.md](./execution-pipeline.md) — the frozen 6-stage flow, implemented stage-by-stage
- [safety.md](./safety.md) — the highest-authority Safety Engine, its 11 dimensions and 8 outcomes
- [policy.md](./policy.md) — the 7-area Policy Validator
- [escalation.md](./escalation.md) — the 8-target Escalation Resolver
- [actions.md](./actions.md) — the 9-type Action Engine
- [response-blueprint.md](./response-blueprint.md) — the Response Composer's structural blueprint
- [execution-package.md](./execution-package.md) — the final assembled package and its Execution Status
- [audit.md](./audit.md) — audit metadata and explainability
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the required 12-section founder report
