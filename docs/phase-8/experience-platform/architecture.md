# Architecture

## Position in the platform

```
Module 5  Knowledge Retrieval Core    "What do we know, given a query?"
Module 6  Intelligence Core           "What matters right now?"
Module 7  Execution Core              "Can we act, and how?"
Module 8  Experience Platform         "What does the person actually see?"    <- this module
```

## Inferred scope (the founder's prompt cut off — see README.md)

From the Objective's "must provide" list, eight capabilities were named. Each was mapped to one Server
Action and, where the capability is genuinely stateful (session, feedback), one Prisma model:

| Must-provide item | Server Action | Persisted? |
|---|---|---|
| Conversation session management | `startSession`, `closeSession` | Yes — `ExperienceSession` |
| Experience request orchestration | `orchestrateExperience` | No (computation over the session's own state) |
| Rich response models | (internal — `response-model.ts`, not its own action) | No |
| Website channel adaptation | `adaptForWebsite` | No |
| Human handoff preparation | `prepareHandoff` | No |
| Feedback capture | `captureFeedback` | Yes — `ExperienceFeedback` |
| Analytics event preparation | `prepareAnalyticsEvents` | No |
| Founder/admin review preparation | `prepareReviewPackage` | No |

"Rich response models" was not given its own action because it is not, on inspection, a caller-invoked
capability — it is the internal step between Modules 5–7 finishing and the Channel Adapter running, per
the Frozen Flow diagram itself (`Execution Package → Experience Orchestrator → Channel Adapter →
Experience Response`). `orchestrateExperience()` builds it and passes it straight to `adaptForWebsite()`
internally.

## Why only two new Prisma models

Every prior module (5–7) treated "prefer computation over storage" as a hard default, adding schema only
when a capability was genuinely impossible without it (Module 5's `KnowledgeRetrievalLog`). The Module 8
prompt was cut off before restating this guidance explicitly, but nothing in the Objective suggested
abandoning it, so the same discipline was applied: of the 8 named capabilities, exactly two — "session
management" and "feedback capture" — are stateful by their own definition (a session is meaningless
without persisting *something* across requests; a captured feedback submission is meaningless if not
stored). The other six stay pure computation, mirroring Module 6/7's own "prepare, don't persist" pattern
for Decision/Execution Packages themselves.

`ExperienceSession.memoryItems` (a single `Json` column, not a normalized child table) is also where
Module 6's own explicitly-deferred requirement finally lands: `lib/intelligence/memory-resolver.ts`'s
own comment says "Do NOT implement long-term storage... a future Module 7/8 owns real memory
persistence." Module 7 stayed fully computation-only (no session concept exists there). Module 8, being
the first module with real session continuity, is the correct place for that deferred capability to
finally be implemented — not a scope violation, a resolution of an already-flagged gap.

## Why Module 8 calls Module 6/7's *library* functions, never their Server Actions

Module 6's and Module 7's own 10 and 8 actions, respectively, are all `requireStaff()`-gated — internal
reasoning/policy infrastructure, by their own explicit design (see their own `architecture.md` files).
Module 8's own `orchestrateExperience()` must be callable by anonymous website visitors — there is no way
to reconcile that with routing through actions that reject anyone who isn't staff. So
`lib/experience/experience-orchestrator.ts` calls `buildIntelligence()` (from
`lib/intelligence/intelligence-orchestrator.ts`) and `executePipeline()` (from
`lib/execution/execution-orchestrator.ts`) directly — the same library functions those modules' own
actions call internally, unmodified, mirroring exactly how Module 6 itself called Module 5's
`runRetrievalPipeline()` directly rather than through `retrieveKnowledge()`.

This also resolves clearance correctly: `buildIntelligence()`'s first stage calls Module 5's
`resolveCallerClearance()`, which reads the real (or absent) session via `auth()` — an anonymous website
visitor naturally resolves to `ANONYMOUS`/`PUBLIC` clearance, exactly the scope a customer-facing surface
should have.

## Why `clearanceLayer` is hardcoded to `"PUBLIC"` for `executePipeline()`

Module 7's Safety Engine gates several checks on the caller-supplied `clearanceLayer` (e.g.
`permissionLayerOk`). `experience-orchestrator.ts` never passes anything other than the literal string
`"PUBLIC"` into `executePipeline()`, regardless of who the customer is or what they typed — there is no
code path in this module where a customer's own request can request or receive elevated clearance. This
is a deliberate, non-configurable safety choice specific to the customer-facing orchestration path, not
an oversight — a staff-facing surface built on top of `prepareHandoff`/`prepareAnalyticsEvents`/
`prepareReviewPackage` is where elevated visibility legitimately belongs, and those three are
`requireStaff()`-gated instead.

## A split RBAC shape — synthesizing Module 5's and Module 6/7's precedents

This is the first module that is genuinely both customer-facing and staff-facing:

- **Customer-facing, ungated** (mirrors Module 5): `startSession`, `closeSession`,
  `orchestrateExperience`, `adaptForWebsite`, `captureFeedback`. A session's `id` acts as a
  bearer-token-like credential — the same trust model guest checkout already uses for cart state
  (`actions/orders.ts`) — rather than requiring a logged-in identity. `startSession`,
  `orchestrateExperience`, and `captureFeedback` are IP-rate-limited via `lib/rate-limit.ts`'s
  `checkRateLimit()`, the same pattern `actions/coupons.ts`'s `validateCoupon()` established for
  anonymous, abuse-prone endpoints — these three are the ones that are either compute-heavy
  (`orchestrateExperience` runs the full Modules 5–7 chain) or write to the database.
- **Staff-facing, `requireStaff()`-gated** (mirrors Module 6/7): `prepareHandoff`,
  `prepareAnalyticsEvents`, `prepareReviewPackage`. Each of these exposes Module 6/7's internal fields
  (safety reasons, policy violations, escalation targets, the full `DecisionPackage`/`ExecutionPackage`)
  that must never reach a customer.

## The safety boundary: `response-model.ts`

`buildExperienceResponse()` is the single point where a customer-safe `ExperienceResponse` is built from
a staff-facing `ExecutionPackage`. It deliberately never reads `safety.reasons`, `policy.violations`,
`responseBlueprint.safetyNotes`, `.restrictions`, or `.escalationNotice` — every one of those is
internal-facing text by Module 7's own design (see Module 7's `response-blueprint.md`). Instead, it uses
a small fixed lookup table (`CUSTOMER_MESSAGE_BY_ACTION`) keyed on `action.action`, plus
`action.targetReferences` for reference cards (already correctly scoped per action type by Module 7's
own Action Engine) and a single generic escalation notice string. This is tested directly by constructing
a `BLOCKED`/`ESCALATE` `ExecutionPackage` and asserting none of the internal strings leak into the
resulting blocks — see [testing.md](./testing.md).

## Two incomplete Module 7 validation schemas were completed (additive only)

`lib/validations/execution.ts`'s `executionPackageSchema` was originally missing
`executionMetadata`/`audit`/`explainability`/`executionHints`/`generatedAt` — Module 7's own 8 actions
never needed a *complete* schema for the whole `ExecutionPackage` (only as internally-produced output,
never as Server Action input), so it was left partial. Module 8's staff-facing `prepareHandoff`/
`prepareAnalyticsEvents`/`prepareReviewPackage` actions genuinely need to validate a caller-supplied
`ExecutionPackage`, so it was completed — two new schemas (`auditMetadataSchema`,
`executionExplainabilitySchema`) added, the existing schema extended with the missing fields. No existing
field's validation behavior changed. This is exactly the "strictly additive exports required for Module 8
integration" exception the Module 8 prompt itself grants to the "do not redesign frozen modules" rule.

## File structure

`lib/experience/` (9 files, no monolithic file): `types.ts`, `session-manager.ts`, `response-model.ts`,
`website-channel-adapter.ts`, `handoff-preparer.ts`, `analytics-preparer.ts`, `review-preparer.ts`,
`feedback-capture.ts`, `experience-orchestrator.ts`. Plus `lib/validations/experience.ts` and
`actions/experience.ts`.
