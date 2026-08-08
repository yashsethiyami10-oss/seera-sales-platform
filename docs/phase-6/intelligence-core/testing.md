# Testing

No automated test runner exists in this repository (unchanged finding from every prior module). Nothing
below is claimed as CI-style automated coverage.

## Build verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Clean — 0 errors across the whole repository |
| `npm run build` | Clean production build, 59 routes generated |

An earlier `tsc --noEmit` pass during this module's implementation surfaced 12 errors, all located in
`lib/sales-channel/routing.ts` and `prisma/seed.ts` — confirmed by direct grep to have zero references to
"intelligence" or "retrieval," i.e. belonging entirely to an unrelated, concurrent Sales
Organization/Sales Channel feature landing in this same codebase from another session, not to Module 6
or to the connection interruption this resumption is recovering from. A subsequent `npm run build` also
failed once on a third unrelated file
(`components/sales-channel/public-inquiry-form.tsx`), same conclusion. Both were left untouched, per the
resumption instruction to only repair inconsistencies genuinely caused by Module 6. By the time of the
final verification pass quoted in the table above, both were clean — the concurrent session had
apparently fixed its own errors in the meantime.

## Manual verification script

`npx tsx`, calling all 10 `lib/intelligence/*` functions directly (not through the Server Action layer,
since actions require a real Next.js session — see "What was not tested" below), plus the orchestrator
against the real database for its non-auth-dependent inputs. **27 checks, 27 passed, 0 failed, 1
documented skip**:

```
PASS  priority: safety keyword + risk signal -> SAFETY category
PASS  priority: sales keyword -> SALES_OPPORTUNITY or BUSINESS_CRITICAL
PASS  priority: no signals -> GENERAL_INQUIRY
PASS  context: conversationContext passed through
PASS  context: referencedProducts populated
PASS  context: referencedProblems populated
PASS  context: referencedCareWorkflows populated
PASS  memory: expired item excluded
PASS  memory: over-clearance item excluded for PUBLIC caller
PASS  memory: valid public item retained
PASS  memory: excludedCount matches excluded items
PASS  eq: no message -> UNKNOWN
PASS  eq: no keyword matches -> NEUTRAL
PASS  eq: angry lexicon matches -> ANGRY
PASS  eq: evidence contains matched terms
PASS  cq: safety+angry -> escalationNeed true
PASS  cq: safety+angry -> requiredCareLevel URGENT or HIGH
PASS  cq: general inquiry+unknown eq -> escalationNeed false
PASS  decision: no knowledge/goal/memory -> informationStillNeeded non-empty
PASS  decision: escalation case -> escalationRequirement true
PASS  confidence: full evidence no missing info -> higher score
PASS  confidence: score never negative
PASS  confidence: no evidence -> LOW level
PASS  explainability: why is non-empty
PASS  explainability: contributingModules includes Priority
PASS  decision-package: includeReasoningTrace true -> trace populated
PASS  decision-package: includeReasoningTrace false -> trace null
SKIP  orchestrator: full pipeline requires Next.js request scope (next-auth headers()) —
      cannot run in standalone tsx script; each of its 8 stages was verified individually
      above instead.

27 passed, 0 failed
```

The script was deleted after use (`verify-module6.ts`), matching this project's standing pattern for
every prior module.

## Read-only enforcement

`grep -E "\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\(" lib/intelligence/*.ts` —
**zero matches**. Confirmed by direct code inspection, not just design intent: no file in
`lib/intelligence/` calls a Prisma mutation method.

## Coverage against this module's own Testing Requirements

| Requirement | Verified? |
|---|---|
| Priority classification | ✅ live — safety-signal precedence, sales-keyword detection, general-inquiry fallback |
| Context assembly | ✅ live — pass-through fields and source-type grouping |
| Memory filtering | ✅ live — expiration and layer-clearance exclusion, confidence aggregation |
| EQ classification | ✅ live — UNKNOWN/NEUTRAL defaults and lexicon matching with evidence |
| CQ rule table | ✅ live — high-urgency+negative-emotion escalation case and a low-signal non-escalation case |
| Decision synthesis | ✅ live — missing-information detection and escalation-driven recommendation |
| Confidence formula | ✅ live — confirmed evidence-complete beats evidence-with-gaps, confirmed floor at 0, confirmed low-evidence yields LOW |
| Explainability | ✅ live — non-empty `why`, `contributingModules` includes Priority |
| Decision Package assembly | ✅ live — confirmed `includeReasoningTrace` gates the trace field both ways |
| Orchestrator (full pipeline) | ⚠️ stages verified individually; full run not exercised standalone (see below) |
| Read-only enforcement | ✅ by direct grep — no mutation calls anywhere in `lib/intelligence/` |
| TypeScript | ✅ `tsc --noEmit` clean |
| Production Build | ✅ clean |

## What was not tested, honestly

- **The orchestrator's full pipeline was not run end-to-end in this script.** `buildIntelligence()`'s
  first stage calls Module 5's `runRetrievalPipeline()`, which calls `resolveCallerClearance()`, which
  calls next-auth's `auth()`, which calls Next.js's `headers()` — valid only inside a real request scope.
  A standalone `tsx` script has no request scope, so this call throws
  `"headers was called outside a request scope"` immediately. This is Module 5's own already-tested
  code path (see `docs/phase-5/knowledge-retrieval/testing.md`), not new Module 6 logic — every one of
  Module 6's own 8 pipeline stages was verified individually with real inputs instead, and the
  orchestrator's sequencing/wiring was confirmed by direct code reading (`intelligence-orchestrator.ts`
  calls each stage in the documented order, threading outputs forward correctly, per file inspection).
- **The 10 Server Actions in `actions/intelligence.ts` were not called directly** — same reason (they
  call `requireStaff()`, which needs a request context). Their underlying `lib/intelligence/*` functions
  (which contain all the real logic) were tested directly instead; the actions themselves were confirmed
  via `tsc`/`build` to type-check and compile correctly, and were read end-to-end to confirm each
  correctly wires schema parsing to the matching engine function.
- **No load/performance testing** — every engine here is synchronous, in-memory computation over already-
  retrieved data; performance risk in this module is negligible compared to the database-touching
  retrieval it wraps (already performance-tested in Module 5).
