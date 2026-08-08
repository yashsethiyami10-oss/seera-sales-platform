# Stage 8 — Website AI Integration Report (Phase 4)

**This is the highest-risk change in this entire stage** — the first time any Stage 6/8 work has
modified `lib/experience/experience-orchestrator.ts`, the live customer-facing entry point every
prior stage was explicitly told never to touch. Read this report before trusting the change.

## What the live path actually was, before this stage — a real, load-bearing finding

Before writing any code, the live path was read in full (`experience-orchestrator.ts`,
`response-model.ts`, `website-channel-adapter.ts`). **The live MUV AI chat widget today produces
zero real generated content.** `buildExperienceResponse()` (Module 8) renders customer-visible text
from a small, fixed 9-entry lookup table keyed by `action.action` (e.g. "Here's what we found for
you:", "Happy to help with that.") — never from Module 6/7's own reasoning text, and the underlying
Module 1/2 database tables (`KnowledgeItem`, `ProductIntelligence`) are confirmed empty (per Stage
6A's own architecture research). This materially de-risks this stage's work: the "existing customer
experience" this report must not regress is already a generic, template-only experience with no
real grounding — the new pipeline, when active, is a strict improvement in groundedness, not a
gamble against a rich existing feature.

## The integration design

`orchestrateExperience()`'s public signature (`(request: ExperienceRequest) =>
Promise<WebsiteExperienceView>`) is **completely unchanged**. Every caller —
`actions/experience.ts`'s `orchestrateExperience` Server Action, and through it
`components/muv-ai/use-muv-ai-chat.ts`'s `send()` — required **zero changes**, confirmed by reading
both files in full before writing any code.

Inside the function:

1. The **entire original function body was extracted, unmodified, into a new private function**
   `orchestrateExperienceLegacy()`. Not one line of its logic changed — confirmed by direct
   side-by-side comparison during the edit.
2. A new branch checks **two** feature flags, both required: `RUNTIME_PIPELINE_ENABLED` (existing,
   Stage 6C) AND `WEBSITE_RUNTIME_INTEGRATION_ENABLED` (new this stage). **Both default `false`.**
3. When both are true, `orchestrateExperienceViaRuntime()` (new file,
   `lib/experience/runtime-channel-adapter.ts`) runs the Stage 6C-6E-8 `lib/runtime/*` pipeline
   instead, via the same `runRuntimePipeline()` every staff-only `actions/runtime.ts` call already
   uses.
4. If the runtime path throws **for any reason** — including its own internal Safety Runtime
   explicitly refusing the turn (the adapter re-checks `result.safety.overallPassed` independently
   and throws if it did not pass, belt-and-suspenders on top of the pipeline's own check) — the
   error is logged and the code falls through to `orchestrateExperienceLegacy()`. A customer can
   never see a broken experience because the new path had a problem; at worst, they get the exact
   same generic experience as before this stage.
5. Session/memory persistence (`getSession`/`touchSession`, the `MemoryItem` construction) was
   moved to run **once**, after whichever path produced a `view`, so both paths touch the session
   record identically — they cannot diverge in this behavior.

## The concrete "no regression" guarantee

With `WEBSITE_RUNTIME_INTEGRATION_ENABLED` at its default `false` (true in every environment today
— nothing set it to `true` anywhere in this codebase or any `.env` file), `orchestrateExperience()`
executes: check session status → call `orchestrateExperienceLegacy()` → touch session → return.
This is **the exact same sequence of function calls, with the exact same arguments**, as the
pre-Stage-8 code. Verified: `npx tsc --noEmit` and `npm run build` both clean; `getFeatureFlags()`
confirmed at both keys `false` by default via direct test.

## What was and wasn't verified, precisely — read this before trusting "it works when enabled"

**Verified (real, direct):**
- Type-correctness of the entire new/modified code (`tsc --noEmit`, `npm run build`, both clean).
- `orchestrateExperienceViaRuntime()`'s output-shape construction logic reviewed line-by-line
  against the real `WebsiteExperienceView`/`WebsiteExperienceSegment` types Module 8 already
  defines — no new type was invented for the client to handle.
- The feature-flag default state (`false`/`false`) is real and directly tested.
- Every downstream runtime module this path calls (`runRuntimePipeline` and everything it calls)
  has its own extensive, already-passing test coverage from Stages 6C-6E and this stage's Phase 2
  work.

**NOT verified (honest, not hidden):**
- `orchestrateExperience()` and `orchestrateExperienceViaRuntime()` were **never actually called**
  by any script in this stage. Both require a real `ExperienceSession` database row and a real
  Next.js request scope for `auth()` (via `resolveCallerClearance()`, several calls deep) — the
  exact same structural limitation documented in every prior stage for anything touching `auth()`.
  There is no dev server or browser available in this environment to click-test the chat widget
  with the flags flipped on.
- The runtime-path-failure-falls-back-to-legacy behavior was verified by **code review and type
  -checking only** — it was not exercised by deliberately forcing `orchestrateExperienceViaRuntime`
  to throw and confirming the catch block actually runs at runtime.
- No live LLM provider exists to test what a genuinely AI-generated (not template) response would
  look like end-to-end through this path.

## Recommendation before enabling in any real environment

1. A real, human-run smoke test: flip both flags on in a local dev environment with a real running
   Next.js server and a real `ExperienceSession` row, send a message through the actual chat
   widget, and confirm the response renders correctly — this specific verification step could not
   be performed in this environment and should not be skipped before any production consideration.
2. Deliberately break the runtime path in that same local test (e.g. temporarily throw inside
   `orchestrateExperienceViaRuntime`) and confirm the widget still shows a working, non-broken
   response via the legacy fallback.
3. Only then consider enabling `WEBSITE_RUNTIME_INTEGRATION_ENABLED` anywhere beyond local testing
   — and even then, per the Stop Rule, not without explicit Founder Production Authorization.
