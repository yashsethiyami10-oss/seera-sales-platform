# MUV AI Foundation Stabilization — Phase 5.2.1

Founder-approved final stabilization pass before freezing the MUV AI Foundation
as v1.0. Resolves the four issues raised in the Foundation Audit
(Phase 5.2, post-Module 3 + Knowledge Publisher).

## Task 1 — Dual AI Stack Resolution

Two independent, fully-built infrastructure stacks existed for the same
eventual goal (giving the storefront widget a real, LLM-backed,
knowledge-grounded answer):

| | Legacy (Stage 6C-6E/8) | Canonical (Phase 5.2) |
|---|---|---|
| Gateway | none — direct branch inside `experience-orchestrator.ts` | `lib/gateway/ai-gateway.ts` |
| Provider Adapter | `lib/ai/providers/{anthropic,openai,mock}.ts` | `lib/gateway/providers/{anthropic,openai,gemini}-adapter.ts` |
| Knowledge retrieval | `lib/runtime/knowledge-factory-retrieval.ts` + Module 5 | `lib/gateway/knowledge/*` (wraps the same two + live catalog) |
| Runtime knowledge DB | none | `PublishedKnowledgeRecord` |
| Activation | 2 feature flags, both default `false`, unset everywhere | Nothing wired to the live turn path yet |

**Decision: `lib/gateway/*` is the ONE canonical AI request path.** All new
AI capability work (Commerce Intelligence, Customer Intelligence,
Conversation Runtime, Observability, Security & Production, and any future
provider/knowledge/streaming work) must be built on `lib/gateway/*`, never
on `lib/runtime/*` or `lib/ai/*`.

**Intentional coexistence, not retirement**: `lib/runtime/*` and `lib/ai/*`
are NOT deleted. They remain the only implementation behind
`actions/runtime.ts` (a real, if narrow, `requireStaff()`-gated staff
diagnostics surface) and behind `lib/experience/runtime-channel-adapter.ts`
(reached only when both `RUNTIME_PIPELINE_ENABLED` and
`WEBSITE_RUNTIME_INTEGRATION_ENABLED` are `true` — both default `false`,
neither is set in any `.env` in this repository). Deleting either would
break that existing staff surface with no replacement built yet, which is
a bigger, unauthorized change than this stabilization pass is scoped for.

Instead, each entry point of the legacy stack now carries an explicit
`DEPRECATED` header pointing back to this document:
- `lib/runtime/runtime-orchestrator.ts`
- `lib/ai/index.ts`
- `lib/experience/runtime-channel-adapter.ts`

**Verification that this is a real, not just declared, separation**:
`grep -rl "from \"@/lib/gateway\|from \"@/lib/knowledge-publisher"` across
the repo returns exactly three files (`actions/experience.ts`,
`actions/knowledge-publisher.ts`, `lib/gateway/ai-gateway.ts` itself) —
nothing under `lib/runtime/*` or `lib/ai/*` imports anything from
`lib/gateway/*`, and nothing under `lib/gateway/*` imports
`lib/runtime/runtime-orchestrator.ts` or `lib/ai/index.ts`. The two stacks
share no code and cannot execute simultaneously for the same request.

**Follow-up, not done here** (would be a real redesign, out of this
pass's scope): a future decision to either port `actions/runtime.ts`'s
diagnostics onto `lib/gateway/*` and then delete `lib/runtime/*`/`lib/ai/*`
outright, or to formally freeze them as permanent staff-only tooling.

## Task 2/3 — Knowledge Access Layer + Approval Enforcement

`lib/gateway/knowledge/authorization.ts` (new) is now the single
authorization + approval gate every Knowledge-Factory-sourced result
passes through inside `knowledge-api.ts` before it can appear in any
response. Reuses Module 5's existing `PermissionLayer`/`CallerClearance`/
`resolveCallerClearance()`/`layerAllowed()` — no new tier system invented.

Domain -> layer mapping (deliberately conservative — see the file's own
comment for why no domain is `PUBLIC` today):
- `FOUNDER_INTELLIGENCE_KF` -> `CONFIDENTIAL`
- `PRODUCT_KF`, `MARKETING_KF`, `CUSTOMER_CARE_KF`, `INSTITUTIONAL_SALES_KF` -> `INTERNAL`

Approval enforcement: only KOs whose Knowledge-Factory status text
classifies as `APPROVED` may ever be returned. `REVIEW_READY`, `DRAFT`,
`OPEN_PENDING_FOUNDER_INPUT`, and unclassifiable (`UNKNOWN`) statuses are
excluded identically — never down-ranked only, always excluded outright.

This has zero effect on current live behavior: nothing customer-facing
calls the Knowledge API yet (confirmed unchanged this pass).

**Real follow-up flagged, not invented here**: the `INTERNAL`-by-default
mapping means no anonymous/customer caller can retrieve ANY Knowledge
Factory content today, even genuinely customer-safe FAQs/safety
guidance — because no per-KO field reliably distinguishes customer-safe
content from internal-only content (Manufacturing SOP, Batch
Reconciliation, Quality Control) within the same domain. A real,
Founder-reviewed per-category classification pass is needed before any
customer-facing wiring happens; guessing at that classification now would
violate "never guess."

## Task 4 — Publisher Test Suite

Promoted from one-off scratchpad scripts into `scripts/verify-knowledge-publisher.ts`
(run via `npm run verify:knowledge-publisher`) — a permanent, committed,
repeatable test covering: dry-run against all real Knowledge Objects,
duplicate-ID rejection, approval-status mapping, malformed-object
rejection, a real live publish, idempotency, changed-content updates,
deleted-source archive + revive, transaction-rollback safety, and
embedding-hook generation in deterministic/mock mode. See that script's
own header for what each section proves and how synthetic vs. real data
is used.

`scripts/verify-knowledge-access.ts` (`npm run verify:knowledge-access`) is
a second, new permanent test covering the Task 2/3 authorization gate
directly (`authorizeKfResults()`), independent of request context.

**A real bug was found and fixed while building this suite**: an earlier
version of the "revive from archive" test scenario called
`computePublishPlan()` with a deliberately narrow, single-item synthetic
candidate list (correct, to isolate that one scenario) but then applied
the entire resulting plan unfiltered. `computePublishPlan()` itself
behaved exactly as designed — with only one candidate in scope, every
other existing row (all 1,043 real published records) correctly appears
in that plan's own `toArchive` list, since none of them were in the tiny
candidate set. Applying that plan unfiltered archived all 1,043 real
rows as an unintended side effect of testing one synthetic row's revival.
This was **a bug in the test script, not in the Publisher** — `diff.ts`
and `write.ts` were not changed. Fixed by scoping every plan computed
from a narrow candidate list down to synthetic rows only before applying
it (`scopeToSynthetic()` in `verify-knowledge-publisher.ts`), and by
adding a permanent real-row regression guard that re-checks a real
record's status after every synthetic-isolated write — catching this
exact class of bug even if row-count-only checks would miss it (archiving
doesn't change how many rows exist). The corrupted real data was fully
repaired via a normal, real publish run (all 1,043 rows revive correctly
from ARCHIVED, since their real source files never actually disappeared)
— `TRANSACTION_TIMEOUT_MS` in `write.ts` was raised from 120s to 300s to
let that repair's large `toUpdate` batch complete (an operational
parameter only, not a change to what the Publisher decides or computes).
