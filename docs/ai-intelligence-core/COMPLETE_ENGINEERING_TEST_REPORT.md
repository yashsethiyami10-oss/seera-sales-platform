# Stage 6C — Complete Engineering Test Report

**No automated test runner exists in this repository** (unchanged finding from every prior module's own
testing docs). Nothing below is CI-style automated coverage — it is a manual `npx tsx` verification
script (`scripts/verify-stage6c-runtime.ts`) run once against the real local dev database, plus
`tsc`/`npm run build`, plus code inspection where a script genuinely could not reach.

## Headline result

```
RESULT 54 passed, 0 failed
```

One real test-construction bug was caught and fixed during this run (not a code bug): the first version
of the Learning Runtime test passed a `GENERAL_QUESTION`-classified fixture where the test's own comment
claimed `UNKNOWN` — the test's expectation was wrong, not `detectLearningSignals()`. Corrected to use the
genuinely `UNKNOWN`-classified fixture, then re-run clean. Recorded here rather than silently rewritten,
per this project's own transparency standard (same practice `docs/phase-5/knowledge-retrieval/testing.md`
established).

**A second, real CODE bug was caught — this time by the 24-scenario Founder Acceptance simulation, not by
this unit script.** `verifyPostGenerationSafety()` matched escalation compliance against an English-only
keyword list; the actual deterministic escalation template ("I'm connecting you with our team...") never
matched it, and the check could never have matched the Hindi/Hinglish templates regardless of wording.
This means a *correct* safety-sensitive/complaint response was being wrongly reported as failing safety
verification. Fixed with a structural `escalationNoticeIncluded` flag (see
`RUNTIME_IMPLEMENTATION_REPORT.md` for the full fix). This is exactly why the Founder's authorization
required scenario simulation in addition to unit-level module tests — the unit test for this exact check
(row 17 below) was passing throughout because its own fixture happened to avoid the mismatch; only a
realistic end-to-end scenario surfaced it.

## The one structural blocker, upfront

`resolveCallerClearance()` (Module 5) and `requireStaff()` (`lib/rbac.ts`) both call NextAuth's `auth()`,
which throws `` `headers` was called outside a request scope `` outside a real Next.js request — confirmed
by direct probe before writing any test code. This means:

- `runSemanticRetrieval()` (calls Module 5's `runRetrievalPipeline` → `resolveCallerClearance()`)
- `runRuntimePipeline()` (the full orchestrator)
- all 5 functions in `actions/runtime.ts` (call `requireStaff()`)

**could not be exercised end-to-end by script.** This is the exact same limitation
`docs/phase-5/knowledge-retrieval/testing.md` recorded for its own 8 Server Actions — verified there, and
here, by `tsc --noEmit` + `npm run build` instead (both clean), plus code inspection.

Everything else — 8 of the 10 runtime modules, and the full downstream half of the pipeline (Context
Construction through Delivery) — was exercised with a manually-constructed `CallerClearance` and a
fixture `RuntimeKnowledgeResult[]` standing in for a real retrieval result set, matching Module 5's own
"construct the clearance object directly" precedent.

## Coverage against the 25 required test categories

| # | Category | Status | Evidence / honest gap |
|---|---|---|---|
| 1 | Unit / Module | **Tested** (8 of 10 modules) | `intent-engine`, `context-builder`, `founder-reasoning-runtime`, `decision-runtime`, `conflict-resolution-runtime`, `confidence-runtime`, `privacy-engine`, `safety-runtime`, `response-assembly-runtime`, `learning-runtime` all directly exercised. `semantic-retrieval.ts` and `runtime-orchestrator.ts` verified by `tsc`/`build` + code inspection only (auth blocker). |
| 2 | Cross-module Integration | **Partial** | Steps 3→10 of the pipeline (Context Construction through Delivery) genuinely chained together in the script with real DB calls. Intent Classification → Semantic Retrieval → Context Construction was NOT integration-tested (fixture data substituted for real retrieval). |
| 3 | Repository Retrieval | **Reused, already tested** | `runSemanticRetrieval` calls Module 5's `runRetrievalPipeline` unmodified — Module 5's own suite (34/34 passed, see `docs/phase-5/knowledge-retrieval/testing.md`) already covers this function. Not re-tested here. |
| 4 | Hybrid / Semantic Retrieval | **Not tested (auth blocker)** | KOID lookup regex, domain→source-type mapping, and authority-weight ranking logic in `semantic-retrieval.ts` were reviewed by code inspection and pass `tsc`/`build`, but never executed against live data. |
| 5 | Knowledge Graph | **Reused, already tested** | Relationship expansion (`resolveRelationshipsForTop`) is Module 5's own, already-tested function. |
| 6 | Intent Classification | **Tested** | 5 checks: safety question, price/availability question, complaint+escalation, gibberish, empty message. |
| 7 | Context Construction | **Tested** | 2 checks: result assembly, live-operational-data passthrough. |
| 8 | Founder Reasoning Runtime | **Tested** | 3 checks, including a real Founder Decision Registry query against the seeded FD-AIC-001..004 rows. |
| 9 | Decision Runtime | **Tested (narrow)** | 1 check confirms `requiresHumanApproval` computes; the merge logic itself is simple enough that deeper coverage was judged lower priority — flagged here rather than overstated. |
| 10 | Conflict Detection | **Tested (2 of 5 types)** | `STATUS_VERSION_AUTHORITY_CONFLICT` and `LIVE_DATA_VS_REPOSITORY_MISMATCH` verified. `EXACT_FACTUAL_CONTRADICTION`, `DIFFERENT_VALUE_SAME_FIELD`, `UNSUPPORTED_CROSS_DOMAIN_DRIFT` are **not implemented** (require semantic comparison this deterministic pass cannot do) — stated in every result's `detectionLimitationNotice`. |
| 11 | Conflict Arbitration | **Tested (3 of 6 levels)** | Level 3 (authority weight), level 4 both branches (allowed field wins / disallowed field escalates), level 6 (unresolved). Levels 1–2 are structurally unreachable today (see `RUNTIME_IMPLEMENTATION_REPORT.md` §2.5); level 5 (recency/confidence tiebreaker) has code but was not hit by any test fixture — untested gap, noted honestly. |
| 12 | Confidence Calibration | **Tested** | 2 checks: conflict lowers score vs. agreement; zero-source forces `NO_SOURCE` + `belowThreshold`. |
| 13 | Care Behaviour | **Partial** | CQ engine itself is Module 6's own (already tested there). `CARE_LANGUAGE_COMPLIANCE` is one of the 12 always-evaluated safety checks but no test crafted a dismissive-phrase response to confirm it actually catches one — gap. |
| 14 | PII Detection / Redaction | **Tested** | 8 checks: phone, email, safe-proceed for non-blocking categories, redaction correctness, exact round-trip restoration, `PAYMENT_INFO` hard-block, `CREDENTIAL` hard-block, empty-input safety. |
| 15 | Prompt / Context Leakage | **Partial** | `INTERNAL_INFO_LEAKAGE` is one of the 12 always-evaluated checks, but (unlike `PII_LEAKAGE`, which was explicitly triggered and confirmed to fail) no test crafted a response containing an internal marker to confirm actual detection — gap. |
| 16 | Response Assembly | **Tested** | Grounded path, privacy-blocked path, unresolved-conflict disclosure, HI template, HINGLISH template, and a throwing-provider fallback — 6+ checks. |
| 17 | Post-generation Safety | **Tested** | All 12 check areas confirmed to run every time; 4 targeted failure triggers confirmed (overconfident language, false action claim, PII leak, missing required escalation). |
| 18 | Tool Orchestration | **Not implemented** | Intent Engine reports `toolsRequired`/`requiresTool` as structured hints only (e.g. `ORDER_LOOKUP`). No tool-execution layer exists anywhere in `lib/runtime/*` — confirmed by code inspection. This is honestly "not built," not "built and untested." |
| 19 | Learning Boundary | **Tested** | 3 checks: all 4 detectable signal types fire on a maximally-degraded turn; `persistLearningSignals` writes exactly one row per signal; every written row defaults to `OPEN` (never self-approved). |
| 20 | Existing Production Regression | **Tested** — see `PRODUCTION_REGRESSION_REPORT.md` | Full `npm run build` compiled the entire pre-existing route tree unchanged; `lib/experience/experience-orchestrator.ts` confirmed (by direct grep) to contain zero references to `lib/runtime`. |
| 21 | Performance / Scalability | **Not load-tested** | The 54-check script (including real Prisma reads/writes) completed in low single-digit seconds on local dev hardware — not a benchmark, no concurrency/load test performed. |
| 22 | Failure / Fallback | **Tested** | Privacy-block fallback, provider-failure fallback, no-knowledge-found fallback all confirmed. Module 5's own source-fetch-failure handling (`Promise.allSettled`) is reused unmodified. |
| 23 | Hallucination / Unsupported-Claim | **Partial** | `UNSUPPORTED_CLAIMS` pattern check confirmed to fail an overconfident response. This is fixed-phrase pattern matching, not true hallucination detection — cannot catch a confidently-worded but factually wrong claim outside the phrase list. No real LLM is wired, so no actual free-form hallucination scenario exists to test yet. |
| 24 | Security / Repository-Isolation | **Partial** | Layer filtering (`layerAllowed`) is Module 5's own, already-tested function. Every one of the 5 new Server Actions confirmed by code inspection to call `requireStaff()` as its first statement. Not independently re-tested against a real anonymous session (same auth blocker). |
| 25 | Founder Acceptance Simulations | See `FOUNDER_ACCEPTANCE_REPORT.md` | Separate document, per the Founder's own requested output list. |

## Totals

- **Script-executed checks:** 54 passed, 0 failed, across categories 1, 2 (partial), 6, 7, 8, 9, 10
  (partial), 11 (partial), 12, 14, 16, 17, 19.
- **Reused-and-already-tested (no re-test needed):** categories 3, 5.
- **Not implemented (honestly reported, not silently skipped):** category 18 (Tool Orchestration).
- **Structurally blocked from script execution (auth context):** category 4, part of 1, part of 24.
- **Not load-tested:** category 21.
- **Genuine partial gaps worth closing before go-live:** categories 13, 15, 23, 24 (dedicated
  care-language-leak / internal-info-leak / recency-tiebreaker / anonymous-session test cases were not
  written this pass).

## Critical / Major / Minor findings from this pass

No new Critical findings. Two findings carried forward as **Major** (must close before production
consideration):

- **MAJOR:** No real LLM provider is configured — Response Assembly is 100% deterministic-template
  fallback today. Founder Decision required before this can be considered "response generation working."
- **MAJOR:** Conflict Detection covers 2 of 5 named types; arbitration levels 1–2 of FD-AIC-002's cascade
  are structurally unreachable given the current Founder Decision Registry contents and the Founder
  Constitution's non-database-backed format.

**Minor** (should close, non-blocking):
- Levels 5 arbitration, dedicated care-language-leak, and internal-info-leak detection paths have code
  but no dedicated passing test case yet.
- No load/concurrency testing performed.
