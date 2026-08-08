# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System, Stage 3

**Status: Stage 3 implemented and tested. Not frozen — no claim of
independent verification or freeze is made anywhere in this document.**
Builds directly on `PART_3D_FOUNDER_OS_STAGE1.md` and
`PART_3D_FOUNDER_OS_STAGE2.md` (read both first — this document assumes
them). Stage 4+ is explicitly out of scope and not started; per the
governing instruction for this Part, work stops at the end of each stage
and waits for explicit authorization before continuing.

**Correction of record:** a prior prompt in this engagement asserted
Stage 3 was already "the validated Enterprise Control Center baseline."
That was false — verified directly against the repository (no
`PART_3D_FOUNDER_OS_STAGE3*` doc existed, no Approval/Exception/
Monitoring service existed anywhere in `lib/founder-os/`) before any code
was written. The user explicitly chose to stop and have Stage 3 built for
real first. This document is that real implementation.

## Objective

Provide centralized operational control: a unified Approval Center,
Enterprise Monitoring, an Exception Center, cross-module Activity
Supervision, and rule-based Notification escalation. No AI, no
prediction — every "escalated" or "exception" designation here is a
fixed, documented business rule over real, already-existing data.

## What's genuinely new vs. reused

Stage 3 introduces **zero new Prisma models**. Every deliverable reads
`FinanceVendorPayment`, `FinanceExpenseClaim`, `Phase2Operation`,
`FounderAlert`, or `SalesTimelineEvent` — all pre-existing — or mutates
the existing `FounderNotification.priority` column in place.

- **Approval Center** (`approval-center-service.ts`) — Pending,
  Escalated, Completed, and Rejected sections over vendor payments and
  expense claims. Pending/Completed queries were factored out of
  `decision-queue-service.ts` (Stage 2) into a new shared module,
  `approval-store.ts`, so the Decision Queue and Approval Center read
  the exact same query rather than two implementations (see "Errors
  found and fixed"). Escalated is a real rule: pending longer than
  `ESCALATION_PENDING_HOURS` (48h), computed from each record's own
  timestamp. Rejected is honestly real only for expense claims — the
  frozen Part 3C `FinanceVendorPayment` model has no rejection status
  (`REQUESTED → APPROVED` is its only transition); nothing is fabricated
  to fill that gap, and the response says so explicitly via a `note`
  field.
- **Enterprise Monitoring** (`monitoring-service.ts`) — Background Jobs,
  Queues, Health, and Failures all reuse a new shared module,
  `job-store.ts`, factored out of the Alert Engine's own
  `detectFailedBackgroundJobs` query (Stage 1) so both read the same
  `Phase2Operation` query surface. Health is a real, documented ratio
  (completed vs. completed+failed over a 7-day window), not a fabricated
  score. **Scheduled Tasks is honestly reported as unsupported** — this
  codebase has no scheduler/cron anywhere (every background job and every
  Founder OS detector is directly-callable only); rather than show a
  fake "0 tasks configured" as if scheduling exists and is unused, the
  response says `supported: false` with an explanatory note.
- **Exception Center** (`exception-center-service.ts`) — groups the same
  `FounderAlert` rows the Alert Engine, Risk Engine, and Decision Queue
  already read, by their real `sourceModule` via a real `groupBy` query —
  not a hardcoded module list. Today only `FINANCE`, `SYSTEM`,
  `GOVERNANCE`, and `RISK_ENGINE` values are ever actually written
  anywhere in this codebase (confirmed by reading every
  `founderAlert.create`/`upsertAlert` call site); CRM/Sales/Orders
  modules correctly show zero because no detector for those domains
  exists yet, not because of a query bug.
- **Enterprise Activity Supervision** (`activity-supervision-service.ts`)
  — deliberately thin: "recent enterprise actions" is Stage 1's own
  `getActivityFeed()` output re-presented (same `SalesTimelineEvent`
  query, not a second one), and "priority events" is a CRITICAL-severity
  active-alert read, the same shape the Exception Center and Decision
  Queue already use.
- **Notification Rules** (`notification-rules.ts`) — deliberately no new
  Prisma model. `isEscalationDue(notification, now)` is a pure,
  independently-unit-testable function (unread + priority `HIGH` + age
  ≥ 24h). `getEscalationCandidates()` is a real DB query applying that
  same rule. `escalateNotification(id)` is a permission-gated mutation
  that re-checks the rule server-side before bumping `priority` to
  `CRITICAL` — "escalating" a notification is an in-place update to the
  same column `listMyNotifications`/`markNotificationRead` already read,
  not a parallel state machine.

## Errors found and fixed during this Stage (self-challenge, not hidden)

1. **Proactive extraction, not a near-miss this time.** Having twice
   already hit near-duplication mid-Stage (Stage 2's `alert-store.ts`
   extraction happened *after* a draft risk-engine.ts had already started
   reimplementing dedupe logic), this Stage's shared modules —
   `approval-store.ts` and `job-store.ts` — were written *before* the
   services that need them, specifically to avoid writing the duplicate
   first. `decision-queue-service.ts` was refactored to import from
   `approval-store.ts` rather than keep its original inline
   `tx.financeVendorPayment.findMany`/`tx.financeExpenseClaim.findMany`
   calls, verified with a full Founder OS test run (31/31 passing)
   immediately after the refactor, before `approval-center-service.ts`
   was written against the same module. Same pattern for
   `alert-engine.ts`'s `detectFailedBackgroundJobs`, refactored to call
   `job-store.ts`'s `listFailedJobs` before `monitoring-service.ts` was
   written.
2. **`ValidationError` does not exist in `lib/errors.ts`.** First draft
   of `notification-rules.ts` imported a `ValidationError` class by
   analogy with other domains' error naming; `lib/errors.ts` only exports
   `AppError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, and
   `ConflictError`. Caught by `tsc --noEmit` immediately (import didn't
   resolve) — confirmed the correct convention by grepping existing
   Business Service files (`lib/enterprise/warehouse-service.ts` throws
   `new AppError(message)` for business-rule violations) and fixed
   `escalateNotification`'s rule-violation throw to use `AppError`.
3. **The verifier's assumed `founder_os.*` permission count was wrong on
   first write.** Initially asserted "exactly 5" (the keys actually
   referenced by code today); the live database has 12 — Stage 1's own
   audit found a pre-provisioned 9-key `founder_os` module and added 3
   genuinely new keys (9 + 3 = 12), and several of the 9 pre-provisioned
   keys (e.g. `founder_os.approvals.perform`) are reserved for a future
   stage and not yet referenced by any code path. Caught by running the
   verifier itself and reading its own failure output rather than trusting
   the assumption; fixed to assert 12 (the real, unchanged total) with an
   explanation of why it's not the same as the 5 keys code uses today.

## Security, organization isolation, SoD — unchanged from Stage 1/2

Every Stage 3 entry point requires `requireFounderOsPrincipal` (verified
structurally — `approval-store.ts` and `job-store.ts` are internal
helpers like `alert-store.ts`, exempted from the check the same way, since
their callers already hold a checked principal). No Stage 3 file writes
directly into any `finance_*` table (verified structurally). No new SoD
rule is introduced: `escalateNotification` requires
`founder_os.notifications.manage`, the same permission
`markNotificationRead`/`markAllNotificationsRead` already require, and
its own rule-check (`isEscalationDue`) is re-verified server-side, not
trusted from the caller. No Founder bypass beyond the one already
documented (`isFounder` bypasses the permission check only, never the
`ENTERPRISE_FOUNDER_OS_ENABLED` feature-flag check).

## Testing

One real-database integration test file, no mocked Prisma:
`__tests__/founder-os/stage3.integration.test.ts` — 8 tests covering
access control (the general `founder_os.access` gate across all five
Stage 3 entry points, plus the stricter `founder_os.notifications.manage`
gate for escalation), the Approval Center's four sections (including the
honest vendor-payment-has-no-rejection-status note), Enterprise
Monitoring's background-job/queue/health reporting and its honest
`scheduledTasks.supported: false` disclosure, the Exception Center's real
`groupBy`-based module grouping (verified against a deliberately-inserted
`TEST`-module alert, cleaned up in the same test), Activity Supervision's
composition of the activity feed with CRITICAL-only priority events, the
`isEscalationDue` pure function across all four boundary cases (aged +
unread + HIGH → true; not yet aged → false; already read → false;
already CRITICAL → false), and the full escalation path against a
deliberately backdated real notification (found by
`getEscalationCandidates`, escalated to CRITICAL, a second escalation
attempt correctly rejected).

## Known limitations

- Escalation's age threshold (24h) and the Approval Center's escalation
  threshold (48h) are independent, fixed constants — not yet
  configurable per organization, same posture as every other Founder OS
  threshold since Stage 1.
- Enterprise Monitoring's "Scheduled Tasks" section is honestly
  unsupported, not a stub with fake data — see "What's genuinely new" above.
- Exception Center will show zero exceptions for CRM/Sales/Orders
  indefinitely until a detector for one of those domains is written
  somewhere in this codebase — this is accurate, not a bug.
- Vendor payments have no rejection status anywhere in Part 3C — the
  Approval Center's "Rejected" section can never show a vendor payment,
  by design, not by omission.

## Verification commands run for this Stage

```text
npx tsc --noEmit --pretty false
npx vitest run   (focused: __tests__/founder-os/stage3.integration.test.ts, then full __tests__/founder-os, then full suite)
node scripts/verify-enterprise-phase1.cjs
node scripts/verify-enterprise-phase2-part3a.cjs
node scripts/verify-enterprise-phase2-part3b.cjs
node scripts/verify-enterprise-phase2-part3b-db.cjs
node scripts/verify-enterprise-phase2-part3c.cjs
node scripts/verify-enterprise-phase2-part3d.cjs
node scripts/verify-sales-architecture.cjs
npm run build
```

No `prisma migrate`/seed step was needed this Stage — no schema change.
Exact pass/fail numbers are in the accompanying implementation report.

## Next

Stage 4 (Founder Workspace) is not started and was not begun, per the
explicit "complete one stage, stop, wait for authorization" instruction
governing this Part, and per the user's explicit choice to build Stage 3
for real before Stage 4 is even discussed again.
