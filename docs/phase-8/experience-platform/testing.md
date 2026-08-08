# Testing

No automated test runner exists in this repository (unchanged finding from every prior module).

## Build verification

| Command | Result |
|---|---|
| `npx prisma validate` | Valid |
| `npx prisma db push --skip-generate` | "Your database is now in sync with your Prisma schema." No data-loss warning. |
| `npx prisma generate` | Clean |
| `npx tsc --noEmit` | Clean, 0 errors |
| `npm run build` | Clean production build, 67 routes |

Two intermediate `tsc`/`build` attempts failed on files with zero relation to Module 8
(`prisma/seed.ts`, `lib/quotation/repository.ts`, `lib/quotation/workflow.ts` — an unrelated, actively
-being-developed Quotation feature from a concurrent session, referencing Prisma models not yet present
in the generated client). Confirmed unrelated by direct grep (`experience`/`Experience` — zero matches in
any of those files) before retrying; a subsequent retry built cleanly once the concurrent session's own
work stabilized — the same transient-interference pattern already documented in Modules 6 and 7's own
testing.md files.

## Manual verification script

`npx tsx`, calling `lib/experience/*` functions directly against the real database (session manager,
feedback capture) and with hand-built fixtures (response model, channel adapter, handoff/analytics/review
preparers). **32 checks, 32 passed, 0 failed**, first run:

```
PASS  session: created with ACTIVE status
PASS  session: channel defaults correctly
PASS  session: memoryItems starts empty
PASS  session: getSession returns the same session
PASS  session: touchSession persists memory
PASS  session: closeSession sets CLOSED
PASS  session: lazy expiry flips stale ACTIVE session to EXPIRED
PASS  response: ANSWER_CUSTOMER produces a MESSAGE block
PASS  response: requiresHandoff false when no escalation
PASS  response: RECOMMEND_KNOWLEDGE produces a REFERENCE_CARD block
PASS  response: ESCALATE produces an ESCALATION_NOTICE block
PASS  response: requiresHandoff true for escalation
PASS  SAFETY: escalation response never leaks safety.reasons content
PASS  SAFETY: escalation response never leaks raw escalation target name in message text
PASS  SAFETY: BLOCKED response has zero REFERENCE_CARD blocks
PASS  SAFETY: BLOCKED response never leaks policy violation marker
PASS  SAFETY: BLOCKED response never leaks safety.reasons content
PASS  response: STOP_EXECUTION disallows follow-up
PASS  response: toneHint passes through blueprint.toneGuidance
PASS  adapter: segment count matches block count
PASS  adapter: REFERENCE_CARD segment carries label as content
PASS  handoff: required matches escalation.required
PASS  handoff: target matches escalation.target
PASS  handoff: safetyOutcome exposed for staff
PASS  analytics: MESSAGE_PROCESSED always present
PASS  analytics: no ESCALATION_TRIGGERED when not escalated
PASS  analytics: ESCALATION_TRIGGERED present when escalated
PASS  review: not flagged when approved and no escalation
PASS  review: flagged for BLOCKED execution status
PASS  feedback: persisted with correct rating/comment
PASS  persistence: ExperienceSession row exists in DB
PASS  persistence: ExperienceFeedback row exists in DB

32 passed, 0 failed
```

Script deleted after use (`verify-module8.ts`).

## The most important checks: the safety boundary

Five of the 32 checks directly prove "must not bypass Module 7 safety": constructing `ESCALATE`- and
`BLOCKED`-shaped `ExecutionPackage` fixtures carrying real internal content (a literal safety reason
string, the `POLICY_VALIDATION_NOT_RUN_SAFETY_SHORT_CIRCUIT` marker from Module 7's own short-circuit
correction, a raw escalation target name) and confirming via `JSON.stringify(response).includes(...)`
that none of it appears anywhere in the resulting customer-facing `ExperienceResponse`. This is the
concrete, adversarial test this module's core safety claim needed.

## Mutation scope confirmed by grep

`grep -E "\.(create|update|delete|upsert)\(" lib/experience/*.ts` — matches only
`prisma.experienceSession.create/update` (×3) and `prisma.experienceFeedback.create` (×1). Unlike Modules
6/7 (fully read-only), Module 8 legitimately mutates — but only its own two new tables, never any
Module 5/6/7 content, decision, or execution data.

## Coverage against inferred Testing requirements

| Area | Verified? |
|---|---|
| Session lifecycle (create/read/update/close/lazy-expire) | ✅ live, real DB |
| Safe rendering across action types (answer/recommend/escalate/stop) | ✅ live |
| Safety boundary (no internal leakage) | ✅ live, adversarial fixtures |
| Website channel adaptation | ✅ live |
| Handoff/Analytics/Review preparation | ✅ live |
| Feedback capture | ✅ live, real DB |
| Mutation scope (own tables only) | ✅ by direct grep |
| TypeScript | ✅ clean |
| Prisma | ✅ `validate`/`db push`/`generate` all clean |
| Production Build | ✅ clean, 67 routes |

## What was not tested, honestly

- **`orchestrateExperience()`'s full end-to-end flow was not exercised in this script.** It calls Module
  6's `buildIntelligence()`, whose first stage calls Module 5's `resolveCallerClearance()` →
  next-auth's `auth()` → `headers()` — valid only inside a real Next.js request scope. This is the exact
  same inherited limitation Module 6's own orchestrator has (see Module 6's `testing.md`), not new to
  this module. Every function `orchestrateExperience()` itself calls or depends on
  (`getSession`/`touchSession`, `buildExperienceResponse`, `adaptForWebsite`) was tested directly instead,
  and the orchestrator's own wiring was confirmed correct by direct code reading.
- **The 8 Server Actions in `actions/experience.ts` were not called directly** — the staff-gated three
  need a request context for `requireStaff()`; the customer-facing five that call `auth()`
  (`startSession`) or `headers()` (the rate-limited ones) have the same request-scope dependency. Their
  underlying library functions were tested directly instead; the actions were confirmed via `tsc`/`build`
  to type-check and compile, and read end-to-end to confirm correct wiring.
- **No load/performance testing.**
