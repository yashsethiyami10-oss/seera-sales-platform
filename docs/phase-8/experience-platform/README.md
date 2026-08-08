# Experience Platform

**Module 8 of the MUV Intelligence Platform.** Implemented, code- and script-verified, awaiting founder
review.

**Note on scope:** the founder's Module 8 prompt cut off after the Frozen Flow diagram — no Module Scope
(implement/do-not list), exact Server Action names, file structure, documentation list, testing
requirements, or Required Output format were given (every prior module included these). Per explicit
founder direction, this module's scope, file structure, exact action names, and documentation set were
**inferred** from the Objective, "must provide" list, "must not" list, and the Frozen Flow diagram, using
the same design discipline established in Modules 1–7. Every non-obvious judgment call is called out
explicitly in [architecture.md](./architecture.md) rather than presented as if it were dictated.

## What Experience Platform is

Converts Module 7's `ExecutionPackage` into structured, channel-neutral, customer-safe experiences —
session continuity across turns, safe rendering, website-specific adaptation, and staff-facing
preparation (handoff, analytics, review). Think of Modules 5–7 as the reasoning brain; Module 8 is the
face — it decides how (and whether) what the brain decided actually reaches a person, and it never
second-guesses what the brain decided.

## What Experience Platform is not

- **Not knowledge retrieval or reasoning.** Never calls Module 5 directly; Module 6's own
  `buildIntelligence()` already reuses Module 5 internally — see [architecture.md](./architecture.md).
- **Not a decision-maker.** Never inspects `DecisionPackage`/`ExecutionPackage` fields to make its own
  safety/policy/escalation judgment — it renders what Module 7 already decided, nothing more.
- **Not an LLM.** All customer-facing copy comes from a small, fixed lookup table
  (`CUSTOMER_MESSAGE_BY_ACTION` in `response-model.ts`) — deterministic, not generated.
- **Not multi-channel yet.** Only "Website channel adaptation" is implemented, per the module's own
  "must provide" list — WhatsApp/Email are Module 7's own named "later integrations," still not built.

## The one genuinely new thing this module does: persist state

Modules 5–7 were all pure, stateless computation. Module 8 is the first module whose own "must provide"
list explicitly names stateful capabilities — "Conversation session management" and "Feedback capture" —
so it is also the first module to add real, intentional persistence beyond a single telemetry table:
`ExperienceSession` (session identity + accumulated conversation memory) and `ExperienceFeedback` (one
row per submission). See [architecture.md](./architecture.md) for why these two and nothing else.

## The safety boundary this module exists to enforce

`response-model.ts` is the one file in this module that decides what a customer actually sees, and it
deliberately never reads Module 7's internal-facing fields (`safety.reasons`, `policy.violations`,
`responseBlueprint.safetyNotes`/`.restrictions`/`.escalationNotice`). It trusts
`executionPackage.action.action` alone — which Module 7 already guarantees is conservative
(`STOP_EXECUTION`/`ESCALATE`/`COLLECT_INFORMATION`/`WAIT`) for any non-`APPROVED` safety outcome. This is
tested directly: constructing a `BLOCKED` `ExecutionPackage` and asserting none of its internal reasoning
strings appear anywhere in the resulting customer-facing blocks. See [testing.md](./testing.md).

## Where to go next

- [architecture.md](./architecture.md) — every inferred design decision, explicitly justified
- [session-and-orchestration.md](./session-and-orchestration.md) — session lifecycle + the Frozen Flow implementation
- [safe-rendering.md](./safe-rendering.md) — the Response Model and Website Channel Adapter, and the safety boundary
- [staff-preparation.md](./staff-preparation.md) — Handoff, Analytics, and Review preparation
- [api-reference.md](./api-reference.md) — every server action: auth, request, response
- [testing.md](./testing.md) — exact commands run and exact results
- [known-limitations.md](./known-limitations.md) — what this module does not (yet) do
- [implementation-report.md](./implementation-report.md) — the 12-section founder report
