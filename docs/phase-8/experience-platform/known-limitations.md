# Known Limitations

## Scope itself was inferred, not given

The founder's Module 8 prompt cut off before stating Module Scope, exact action names, file structure,
documentation list, or testing requirements. Everything in this module reflects a good-faith,
precedent-based inference (see [architecture.md](./architecture.md) for every judgment call made
explicit) — founder review may want different action names, a different file split, or additional/fewer
capabilities than what was inferred here.

## `orchestrateExperience()`'s end-to-end flow inherits Module 6's request-scope limitation

Cannot be exercised in a standalone script — see [testing.md](./testing.md). Every function it calls was
tested individually instead.

## No per-turn execution history — `prepareHandoff`/`prepareAnalyticsEvents`/`prepareReviewPackage` need a caller-supplied `ExecutionPackage`

Only session identity and accumulated conversation memory are persisted (`ExperienceSession`). There is
no way to look up a *past* `DecisionPackage`/`ExecutionPackage` by session ID alone — a caller must
already have the `ExecutionPackage` object (e.g., from having called `orchestrateExperience()` or Module
7's own `executePipeline()` action). A future module could add per-turn execution history persistence if
founder review determines this is needed for a real admin/support tool — not added here, to keep this
module's own footprint minimal.

## Only one channel implemented

"Website channel adaptation" is the only capability named in the Objective's "must provide" list; no
WhatsApp/Email adapter exists, consistent with Module 7's own framing of those as "later integrations."
`WebsiteExperienceSegment`'s flat, ordered shape was designed to generalize to a future channel adapter
without requiring `response-model.ts` or the orchestrator to change, but that is a design intention, not
a built or tested capability.

## Session memory is capped, not summarized

`touchSession()` keeps only the most recent 20 `MemoryItem`s per session (`MAX_SESSION_MEMORY_ITEMS` in
`experience-orchestrator.ts`) — older turns are dropped outright, not summarized or compressed. For a
long-running conversation, this means Module 6's Memory Resolver only ever sees a recent window, never
the full history. A future module could add summarization if this proves limiting.

## No admin/founder review UI

`prepareReviewPackage()` returns a structured object; nothing in this module renders it. A future admin
surface (not built) would consume this action's output.

## Rate limiting is in-process, single-instance

Same limitation already documented for every rate-limited action in this codebase (`lib/rate-limit.ts`'s
own header comment) — counters live in process memory, reset on deploy, and don't share state across
multiple server instances. Applies here to `startSession`/`orchestrateExperience`/`captureFeedback` the
same way it already applies to `validateCoupon()`.

## No content moderation on customer input

`orchestrateExperience()`'s `customerMessage` is passed straight into Module 6's EQ Engine and Priority
Engine, both of which already have their own fixed keyword-based safety signals (see Module 6's
`eq.md`/`priority.md`), but Module 8 itself performs no independent input sanitization or moderation
beyond Zod's length limit (2000 chars). This is consistent with Modules 5–7's own scope boundaries — input
moderation was never named as any prior module's responsibility either — but is worth flagging now that
this is the first module with a genuinely open customer text field.
