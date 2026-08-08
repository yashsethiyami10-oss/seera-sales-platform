# Architecture

## Position in the platform

```
Module 5  Knowledge Retrieval Core    "What do we know, given a query?"
Module 6  Intelligence Core           "What matters right now?"
Module 7  Execution Core              "Can we act, and how?"              <- this module
Future    Integration layer (not built) WhatsApp / Email / Website / Admin / Orders
```

## Core principle: validate, protect, prepare — never decide

"Execution never changes the decision. Execution validates, protects and prepares it." Every function in
`lib/execution/` takes a `DecisionPackage` (or a prior Execution Core stage's output) as read-only input
and returns a new, separate structured result. No function anywhere in this module writes back into a
`PriorityResult`, `EQResult`, `CQResult`, `DecisionResult`, or any other Module 6 type — enforced simply
by never importing a mutable reference to one; every parameter is read via destructuring or property
access, never reassigned.

## Why this module never touches a database

Modules 1–6 all had at least one real data dependency (content tables, or — for Module 6 — a reused call
into Module 5's retrieval, which itself touches `KnowledgeRetrievalLog`). Execution Core has none: its
only input is a `DecisionPackage`, a plain object already fully computed by the time it reaches this
module. There is nothing here to look up and nothing here to log automatically — "prefer computation
over storage" is true by construction, not by discipline. Confirmed by direct grep:
`grep -riE "PrismaClient|@prisma/client|\.(create|update|delete|upsert)\(" lib/execution/` returns zero
matches (see [testing.md](./testing.md)).

## Why this module is fully synchronous

Module 6's orchestrator (`buildIntelligence`) had to be `async` because its first stage calls Module 5's
`runRetrievalPipeline()`, which awaits a database query and a session resolution. Execution Core's
orchestrator (`executePipeline`) has no such dependency — every stage is pure, synchronous computation
over already-in-memory data. This is a genuine, structural simplification, not just a style choice: it
also means (unlike Module 6) this module's full pipeline *could* be exercised end-to-end in a standalone
verification script, without hitting Next.js's request-scope requirement — see
[testing.md](./testing.md).

## "If Safety blocks execution, no further execution occurs" — a true short-circuit for BLOCKED/RESTRICTED

**Corrected post-founder-review.** The original implementation ran every stage unconditionally and let a
non-`APPROVED` Safety outcome shape each downstream stage's *conclusion* (a conservative action, a
restricted blueprint) rather than stopping the pipeline outright. Founder review correctly identified
this as not equivalent to "no further execution occurs": Policy Validation, Escalation Resolution, the
Action Engine, and the Response Composer were still being fully evaluated — including business/response
policy checks — against a request Safety had already disqualified, which contradicts Safety's own status
as "the highest authority."

The corrected design in `execution-orchestrator.ts` is a **true short-circuit**, scoped exactly to the
two outcomes the module prompt's correction named:

- When `safety.outcome` is `BLOCKED` or `RESTRICTED`, `executePipeline()` returns immediately after the
  Safety Engine via `buildSafetyShortCircuitPackage()` — it **never calls** `validatePolicy()`,
  `resolveEscalation()`, `buildAction()`, or `composeResponseBlueprint()`. Not run-and-overridden;
  literally not invoked. `audit.pipelineStages` for these two outcomes contains only `["safety-engine"]`,
  and `policy.checks` is `[]` (so `audit.policyChecks` is `0`) — both are concrete, tested proof that no
  downstream stage ran (see [testing.md](./testing.md)).
- The other 6 outcomes (`APPROVED`, `NEEDS_HUMAN_REVIEW`, `NEEDS_MORE_INFORMATION`, `ESCALATED`,
  `DEFERRED`, `UNKNOWN`) are **unaffected** — they still run the full 5-stage pipeline exactly as before,
  relying on the Action Engine's own existing conservative-action cascade (e.g. `STOP_EXECUTION` for
  `UNKNOWN`, `ESCALATE` for `NEEDS_HUMAN_REVIEW`) rather than a structural short-circuit. This is a
  deliberate, narrow scope match to the founder's correction, which named exactly `BLOCKED` and
  `RESTRICTED` — not a blanket "any non-APPROVED outcome short-circuits" rule.

The short-circuit path still returns a fully-shaped `ExecutionPackage` (the type itself was not
redesigned) — every field the type requires is populated with a minimal, explicitly-labeled "not
evaluated" structure (e.g. `policy.violations` includes the literal marker
`"POLICY_VALIDATION_NOT_RUN_SAFETY_SHORT_CIRCUIT"`) instead of the output of actually running that stage.
This keeps Audit Metadata and Explainability meaningful for a blocked request without pretending
downstream evaluation happened. See [safety.md](./safety.md) and
[execution-pipeline.md](./execution-pipeline.md) for the full mechanics.

## Why Safety Engine's own "Policy Compliance" check doesn't call Policy Validator

The module prompt lists "Policy Compliance" as one of Safety's 11 evaluated dimensions, but Safety Engine
runs *before* Policy Validation in the frozen pipeline order — it cannot call a stage that hasn't run
yet. Safety Engine's `policyCompliant` field is therefore its own coarse, independent consistency check
(a restricted/SAFETY-category action is only "compliant" at Safety's own level if it's already flagged
for escalation), computed directly from the Decision Package. The later, more detailed Policy Validator
stage performs its own separate 7-area validation, one of which (`SAFETY_RULES`) explicitly defers to
Safety's already-computed outcome. Both checks are real and independently meaningful; they are not the
same check running twice.

## A different RBAC shape from Module 5, same as Module 6, and for the same reason

All 8 of this module's actions are `requireStaff()`-gated. There is no currently-approved path by which
an anonymous or customer caller should invoke `executePipeline()` and receive back an `ExecutionPackage`
containing internal fields (safety reasons, policy violations, escalation targets, audit metadata) —
those are staff/system-facing by design, consumed by a not-yet-built integration layer that will define
its own RBAC shape when built. This is a documented departure from Module 5's "anyone can call, results
filtered by clearance" pattern, inherited unchanged from Module 6's own reasoning (see
`docs/phase-6/intelligence-core/architecture.md`).

## Reuse over rewrite: extending Module 6's validation file

`lib/validations/execution.ts` needs to validate a whole `DecisionPackage` as Server Action input — a
shape Module 6 itself never needed to validate as *input* (only ever assembled internally as *output*).
Rather than duplicating Module 6's sub-schemas (`priorityResultSchema`, `eqResultSchema`, etc.), this
module made a minimal, additive change to `lib/validations/intelligence.ts`: exporting several
previously-file-local schema constants (visibility change only, zero behavior change) and adding one new
exported schema, `decisionPackageSchema`, that Module 6 itself had no occasion to need. This is disclosed
honestly in Files Modified in `implementation-report.md` — it is not a redesign of Module 6's validation
logic, and no existing exported schema's behavior changed.

## File structure

Exactly the suggested 9-file structure under `lib/execution/`, no monolithic file:

| File | Responsibility |
|---|---|
| `types.ts` | Shared types for every stage and the Execution Package |
| `safety-engine.ts` | `validateSafety()` |
| `policy-validator.ts` | `validatePolicy()` |
| `escalation-resolver.ts` | `resolveEscalation()` |
| `action-engine.ts` | `buildAction()` |
| `response-composer.ts` | `composeResponseBlueprint()` |
| `execution-explainability.ts` | `explainExecution()` |
| `execution-package.ts` | `buildExecutionPackage()` + shared `buildAuditMetadata()` helper |
| `execution-orchestrator.ts` | `executePipeline()` — runs all of the above in the frozen order |

Plus `lib/validations/execution.ts` (Zod schemas for all 8 actions) and `actions/execution.ts` (the 8
required Server Actions).

## What was deliberately not built (later integrations' territory)

Per the module prompt's Constraints: no LLM, no chat responses, no prompt engineering, no tool calling,
no WhatsApp, no email, no payments, no orders, no CRM, no website, no admin UI. Nothing in
`lib/execution/` imports an LLM client, an external API client, or writes to any customer-facing surface.
