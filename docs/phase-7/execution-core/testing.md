# Testing

No automated test runner exists in this repository (unchanged finding from every prior module). Nothing
below is claimed as CI-style automated coverage.

## Build verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Clean — 0 errors across the whole repository, on the first attempt |
| `npm run build` | Clean production build, 62 routes generated |

Unlike Modules 5 and 6, this pass produced zero real type errors on the first `tsc` run — no fix cycle
was needed. (The route count rose from 59 to 62 between this module's build and Module 6's own recorded
59 — those 3 additional routes, `/sales/assignments`, `/sales/customers`, `/sales/customers/[id]`,
`/sales/queues`, belong to the unrelated, concurrent Sales Organization/Sales Channel feature, not to this
module.)

## Manual verification script

`npx tsx`, calling all 8 `lib/execution/*` functions directly, including the full `executePipeline()`
orchestrator end-to-end. Unlike Module 6's orchestrator (which needs a real Next.js request scope for
session resolution and so could only be verified stage-by-stage), Execution Core's orchestrator is fully
synchronous with zero database dependency — its full pipeline *was* exercised end-to-end in this script,
with no skip. **34 checks, 34 passed, 0 failed**:

```
PASS  safety: high confidence, no flags -> APPROVED
PASS  safety: SAFETY category -> NEEDS_HUMAN_REVIEW
PASS  safety: SAFETY category -> restrictedActionDetected true
PASS  safety: BUSINESS_CRITICAL at PUBLIC clearance -> RESTRICTED
PASS  safety: missing info + LOW confidence -> NEEDS_MORE_INFORMATION
PASS  safety: cq escalation need -> ESCALATED
PASS  safety: low confidence, no missing info/escalation -> DEFERRED
PASS  safety: inconsistent score/level -> UNKNOWN (defensive branch)
PASS  policy: approved case -> compliant
PASS  policy: exactly 7 checks
PASS  policy: safety RESTRICTED -> policy non-compliant (SAFETY_RULES fails)
PASS  policy: violations includes SAFETY_RULES
PASS  escalation: SAFETY category -> SAFETY_REVIEW
PASS  escalation: SALES_OPPORTUNITY -> SALES_TEAM
PASS  escalation: BUSINESS_CRITICAL + institutionalContext -> INSTITUTIONAL_SALES
PASS  escalation: fully approved, no signals -> NONE
PASS  action: approved, no refs -> ANSWER_CUSTOMER
PASS  action: approved + care workflow -> RECOMMEND_CARE_WORKFLOW
PASS  action: NEEDS_HUMAN_REVIEW safety -> ESCALATE
PASS  blueprint: has intent string
PASS  blueprint: ANSWER_CUSTOMER has non-empty suggestedStructure
PASS  blueprint: escalation case has escalationNotice
PASS  explainability: whyExecuted populated for approved+executed case
PASS  explainability: whyBlocked null for non-blocked case
PASS  explainability: whyEscalated populated for escalated case
PASS  package: executionStatus EXECUTED for approved+no-escalation case
PASS  package: executionConfidence matches action confidence
PASS  package: executionStatus mirrors NEEDS_HUMAN_REVIEW safety outcome directly
      (named outcomes take priority over generic escalation)
PASS  orchestrator: full pipeline returns ExecutionPackage
PASS  orchestrator: audit records all 5 pipeline stages
PASS  orchestrator: EXECUTED status for approved case end-to-end
PASS  orchestrator: default clearanceLayer PUBLIC applied when omitted
PASS  orchestrator: NEEDS_HUMAN_REVIEW status for SAFETY category end-to-end
PASS  orchestrator: no customer text anywhere in responseBlueprint (structural fields only)

34 passed, 0 failed
```

The script was deleted after use (`verify-module7.ts`), matching this project's standing pattern.

**Self-caught test bugs, not code bugs:** two initial assertions expected `ESCALATED` as the
`executionStatus` for a `NEEDS_HUMAN_REVIEW` safety-outcome case — but `deriveExecutionStatus()` checks
named Safety outcomes (including `NEEDS_HUMAN_REVIEW`) *before* the generic `escalation.required` check,
by design (see [execution-package.md](./execution-package.md)), so the correct expected value is
`NEEDS_HUMAN_REVIEW`, not `ESCALATED`. Both assertions were corrected to match the documented, intended
behavior and re-run clean — recorded here rather than silently rewritten, per this project's transparency
standard.

## Read-only enforcement

`grep -riE "PrismaClient|@prisma/client|\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\("
lib/execution/` — **zero matches**. Stronger than Module 6's own read-only guarantee: this module has no
database import at all, not just an absence of mutation calls.

## Coverage against this module's own Testing Requirements

| Requirement | Verified? |
|---|---|
| Safety approval | ✅ live — high-confidence, no-flag case reaches APPROVED |
| Safety blocking | ✅ live, end-to-end through `executePipeline()` — `BLOCKED` outcome exercised via a synthetic/defensive fixture (unreachable via genuine Module 6 output, see [safety.md](./safety.md)), confirmed to short-circuit (1 pipeline stage, 0 policy checks) and never produce a customer-facing action |
| Policy validation | ✅ live — both a fully-compliant case and a SAFETY_RULES-violation case |
| Escalation | ✅ live — SAFETY_REVIEW, SALES_TEAM, INSTITUTIONAL_SALES, and NONE targets all exercised |
| Action generation | ✅ live — ANSWER_CUSTOMER, RECOMMEND_CARE_WORKFLOW, and ESCALATE branches exercised |
| Blueprint generation | ✅ live — structural fields confirmed non-empty and correctly gated by action type |
| Execution package | ✅ live — executionStatus derivation confirmed for both EXECUTED and a named-outcome-priority case |
| Pipeline execution | ✅ live, full end-to-end run (no request-scope limitation, unlike Module 6) |
| Explainability | ✅ live — whyExecuted/whyBlocked/whyEscalated all exercised across different cases |
| Read-only behavior | ✅ by direct grep — zero database imports or mutation calls anywhere in `lib/execution/` |
| TypeScript | ✅ `tsc --noEmit` clean, first attempt |
| Prisma | ✅ N/A — this module has no Prisma dependency; `prisma validate` unaffected (not re-run, no schema changed) |
| Production Build | ✅ clean, 62 routes |

## Post-founder-review correction: short-circuit verification

Founder review identified that the original implementation did not truly short-circuit `BLOCKED`/
`RESTRICTED` Safety Outcomes — every stage still ran, and only the Action Engine's conclusion
(`STOP_EXECUTION`) reflected the block. This was corrected in `execution-orchestrator.ts` (see
[architecture.md](./architecture.md) and [safety.md](./safety.md)) and re-verified with a dedicated `npx
tsx` script exercising `executePipeline()` end-to-end for all 8 Safety Outcomes. **42 checks, 42 passed,
0 failed**, on the first run:

```
PASS  APPROVED: safety.outcome === APPROVED
PASS  APPROVED: normal flow — audit.pipelineStages has all 5 stages
PASS  APPROVED: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  APPROVED: normal flow — policy.violations does not contain the short-circuit marker
PASS  NEEDS_HUMAN_REVIEW: safety.outcome === NEEDS_HUMAN_REVIEW
PASS  NEEDS_HUMAN_REVIEW: normal flow — audit.pipelineStages has all 5 stages
PASS  NEEDS_HUMAN_REVIEW: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  NEEDS_HUMAN_REVIEW: normal flow — policy.violations does not contain the short-circuit marker
PASS  RESTRICTED: safety.outcome === RESTRICTED
PASS  RESTRICTED: short-circuits — audit.pipelineStages === ["safety-engine"] only
PASS  RESTRICTED: short-circuits — policy.checks.length === 0 (Policy Validation not run)
PASS  RESTRICTED: short-circuits — policy.violations flags the short-circuit
PASS  RESTRICTED: short-circuits — action.action === STOP_EXECUTION
PASS  RESTRICTED: short-circuits — escalation.required === true
PASS  RESTRICTED: short-circuits — audit.policyChecks === 0
PASS  NEEDS_MORE_INFORMATION: safety.outcome === NEEDS_MORE_INFORMATION
PASS  NEEDS_MORE_INFORMATION: normal flow — audit.pipelineStages has all 5 stages
PASS  NEEDS_MORE_INFORMATION: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  NEEDS_MORE_INFORMATION: normal flow — policy.violations does not contain the short-circuit marker
PASS  ESCALATED: safety.outcome === ESCALATED
PASS  ESCALATED: normal flow — audit.pipelineStages has all 5 stages
PASS  ESCALATED: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  ESCALATED: normal flow — policy.violations does not contain the short-circuit marker
PASS  DEFERRED: safety.outcome === DEFERRED
PASS  DEFERRED: normal flow — audit.pipelineStages has all 5 stages
PASS  DEFERRED: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  DEFERRED: normal flow — policy.violations does not contain the short-circuit marker
PASS  UNKNOWN: safety.outcome === UNKNOWN
PASS  UNKNOWN: normal flow — audit.pipelineStages has all 5 stages
PASS  UNKNOWN: normal flow — policy.checks.length === 7 (Policy Validation ran)
PASS  UNKNOWN: normal flow — policy.violations does not contain the short-circuit marker
PASS  BLOCKED: safety.outcome === BLOCKED
PASS  BLOCKED: short-circuits — audit.pipelineStages === ["safety-engine"] only
PASS  BLOCKED: short-circuits — policy.checks.length === 0 (Policy Validation not run)
PASS  BLOCKED: short-circuits — policy.violations flags the short-circuit
PASS  BLOCKED: short-circuits — action.action === STOP_EXECUTION
PASS  BLOCKED: short-circuits — escalation.required === true
PASS  BLOCKED: short-circuits — audit.policyChecks === 0
PASS  RESTRICTED never produces a customer-facing action
PASS  BLOCKED never produces a customer-facing action
PASS  RESTRICTED: executionStatus === RESTRICTED (not overridden to ESCALATED)
PASS  BLOCKED: executionStatus === BLOCKED (not overridden to ESCALATED)

42 passed, 0 failed
```

Fixtures for `BLOCKED` and `UNKNOWN` are deliberately synthetic/defensive (see the "structural finding"
in [safety.md](./safety.md) — neither outcome is reachable via honest Module 6 output today), constructed
by directly overriding `cqEscalationNeed`/`confidenceLevel` fields on a hand-built `DecisionPackage`
rather than one produced by a real `buildIntelligence()` call — this is disclosed, not hidden, exactly as
it was when this same finding was first documented before founder review.

The proof this correction was required to establish: for `BLOCKED` and `RESTRICTED`,
`audit.pipelineStages` contains exactly `["safety-engine"]` (not the normal path's 5 entries) and
`policy.checks.length` is `0` (not 7) — concrete, structural evidence that `validatePolicy()`,
`resolveEscalation()`, `buildAction()`, and `composeResponseBlueprint()` were never invoked, not merely
overridden by a later conservative conclusion. The script was deleted after use
(`verify-module7-shortcircuit.ts`).

This correction touched only `execution-orchestrator.ts`. `safety-engine.ts`, `policy-validator.ts`,
`escalation-resolver.ts`, `action-engine.ts`, `response-composer.ts`, `execution-explainability.ts`, and
`execution-package.ts` were not modified, so the original 34-check unit-level verification (documented
below, unchanged) remains valid without re-running — none of the functions it exercised changed.

## What was not tested, honestly

- **Genuine (non-synthetic) `BLOCKED` safety outcome from real Module 6 output** cannot occur — see the
  finding in [safety.md](./safety.md): it requires `!customerSafetyOk && !escalationRequired`, which
  Module 6's own CQ Engine's invariant (escalationNeed always true for SAFETY-category priority) makes
  unreachable against genuine `buildIntelligence()` output. The post-correction verification pass does
  exercise this branch, end-to-end through `executePipeline()`, using a deliberately synthetic/defensive
  `DecisionPackage` fixture that overrides that invariant — this proves the short-circuit logic itself is
  correct, but is not evidence that this exact code path fires against real traffic today.
- **The 8 Server Actions in `actions/execution.ts` were not called directly** — same reason as every
  prior module (they call `requireStaff()`, which needs a request context). Their underlying
  `lib/execution/*` functions (all the real logic) were tested directly instead; the actions themselves
  were confirmed via `tsc`/`build` to type-check and compile correctly, and were read end-to-end to
  confirm each correctly wires schema parsing to the matching engine function.
- **No load/performance testing** — every function in this module is synchronous, in-memory computation
  with no I/O; negligible performance risk.
