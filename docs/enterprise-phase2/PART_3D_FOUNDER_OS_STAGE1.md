# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System, Stage 1

**Status: Stage 1 implemented and tested. Not frozen — no claim of
independent verification or freeze is made anywhere in this document.**
Stage 2+ is explicitly out of scope and not started; this document will be
extended, not silently replaced, when that work begins.

## What Founder OS is (and is not)

Founder OS is the enterprise command center for Founder-level users. It
**orchestrates** the enterprise — it does not replace Finance, Sales, or
any other domain. Every number Founder OS shows comes from an existing,
already-governed calculation somewhere else in this codebase:

- **Revenue, Orders, Customer Growth, RFM, Inventory, Coupons** — the
  frozen Phase 15 Founder Dashboard/BI layer (`lib/analytics.ts`,
  `app/admin/analytics/page.tsx`). Called directly, unmodified. This
  discovery — that a "Founder Operating System" BI layer already existed
  and was already frozen — shaped this entire Stage: Founder OS's own KPI
  Engine is a thin composition layer over it, not a second implementation.
- **Outstanding Receivables/Payables, Cash Position, Expenses** — the
  frozen Part 3C Enterprise Finance Platform's own reporting Business
  Services (`getReceivablesAging`, `getPayablesAging`, `getBankPosition`,
  a direct read-only `FinanceExpenseClaim` aggregate). Every one of these
  still enforces its own permission and `ENTERPRISE_FINANCIAL_REPORTING_
  ENABLED` feature-flag check against whichever real user is calling
  through Founder OS — Founder OS does not, and structurally cannot,
  bypass that gate.
- **Executive Timeline / Activity Feed** — the existing `SalesTimelineEvent`
  model, which every enterprise mutation across Parts 3A/3B/3C already
  writes to via `recordEnterpriseMutation` (frozen shared foundation,
  `lib/enterprise/governance.ts`). No new table.
- **Sales pipeline** — a direct, read-only `Opportunity` aggregate (no
  existing CRM aggregation function exists to call instead — this mirrors
  `lib/analytics.ts`'s own established pattern of a direct Prisma
  aggregate for a BI-style read with no other home).

Four things are genuinely new, because no existing equivalent serves the
same purpose: `FounderAlert`, `FounderNotification`,
`FounderWidgetDefinition`, `FounderWidgetPreference`. See "Why only four
new tables" below.

## Stage 1 scope (all ten items implemented)

1. **Founder Dashboard Framework** — `lib/founder-os/dashboard-service.ts`'s
   `getFounderDashboard()`, the single orchestrator composing every other
   Stage 1 service in parallel.
2. **Enterprise KPI Engine** — `kpi-engine.ts`.
3. **Executive Summary Service** — `executive-summary-service.ts`.
4. **Company Health Service** — `company-health-service.ts`.
5. **Enterprise Alert Engine** — `alert-engine.ts`.
6. **Founder Notification Center** — `notification-center.ts`.
7. **Executive Timeline** — `timeline-feed.ts`'s `getExecutiveTimeline`.
8. **Enterprise Activity Feed** — `timeline-feed.ts`'s `getActivityFeed`.
9. **Global Search Foundation** — `search-foundation.ts` (foundation only,
   no AI, as scoped).
10. **Founder Widget Framework** — `widget-service.ts`.

## Why only four new Prisma models

Mirroring every prior module's own "prefer computation over storage"
discipline: of everything Stage 1 needed, only alerts, notifications, and
per-user widget layout are genuinely stateful in a way nothing else in
the schema already captures.

- **`FounderAlert`** — a detected exception condition (large overdue
  receivable, high receivables balance, large overdue payable, vendor
  payment pending approval, failed background job, and two governance
  signals — see "Alert Engine detectors" below for exactly what each
  really checks). Lifecycle: `ACTIVE → ACKNOWLEDGED`, `ACTIVE → RESOLVED`.
  Deduplicated by `(organizationKey, alertType, sourceEntityType,
  sourceEntityId)` at the application level (an app-level check, like
  AR/AP's own over-allocation guards, not a database constraint — a
  reversed/resolved alert must legitimately allow a fresh one for the
  same entity later, same reasoning Part 3C's reconciliation-match
  double-booking guard used).
- **`FounderNotification`** — a unified, per-recipient, read/unread feed
  with priority, category, and an optional deep link. **Deliberately not
  a reuse of `NotificationLog`** — that model is an outbound delivery log
  for customer-facing channels (SMS/WhatsApp/email, keyed by a raw
  `recipient` string, a `NotificationChannel` enum, no read-state/
  priority/category/deep-link concept at all), a genuinely different
  purpose from an internal Founder read/unread feed. Extending it would
  have polluted a delivery-log table with founder-only fields that every
  other channel's rows would carry as permanently unused columns.
- **`FounderWidgetDefinition`** / **`FounderWidgetPreference`** — the
  widget registry and each user's own visibility/order/settings override.
  A user with no preference row for a widget simply sees that widget's
  own seeded default — this is how "future personalization" is supported
  without needing a row for every user × every widget that ever gets
  added.

## Architecture reused (nothing duplicated)

`lib/founder-os/context.ts`'s `requireFounderOsPrincipal` is
`requireEnterprisePrincipal` (Part 3A, frozen, unchanged) bound to
`ENTERPRISE_FOUNDER_OS_ENABLED` — a feature flag that was **already
registered and seeded** in `PHASE2_FEATURE_FLAGS` before this Stage
existed, reused as-is, not newly invented. The same discovery applied to
permissions: a `founder_os` permission module already existed in the seed
(`founder_os.access`, `founder_os.alerts.manage`, and several more —
`founder_os.financial_intelligence.view`, `.operational_intelligence.view`,
`.network_intelligence.view`, `.decisions.access`, `.decisions.record`,
`.approvals.perform`, `.ai_briefings.access` — reserved, pre-provisioned,
and **still unused by Stage 1**, exactly like `ENTERPRISE_TAX_COMPLIANCE_
ENABLED` stayed reserved-but-unused through Part 3C). Stage 1 reuses
`founder_os.access` (the general viewing gate for dashboard/KPIs/health/
alert listing/timeline/activity feed/search) and `founder_os.alerts.manage`
(alert acknowledge/resolve/detection-trigger) as-is, and adds only the
three genuinely new keys Stage 1's own new capabilities needed:
`founder_os.notifications.view`, `founder_os.notifications.manage`,
`founder_os.widgets.manage`.

Every current caller is the Founder, who bypasses any single permission
check via `isFounder` (`requireEnterprisePrincipal`'s existing,
unmodified behavior) — but real permission keys still gate every
function, matching how every other Enterprise module in this codebase is
structured, so a future non-Founder role could be granted narrow
visibility without a code change.

## Graceful degradation, not a hard dependency chain

Founder OS composes multiple independently-gated subsystems (Finance
reporting behind its own flag, Analytics with no flag at all). Two
deliberate patterns keep one disabled/unavailable subsystem from taking
down the whole dashboard:

- `kpi-engine.ts`'s `safe()` wrapper: every external call
  (`getReceivablesAging`, `getPayablesAging`, `getBankPosition`, the
  expense aggregate, the pipeline aggregate) is individually try/caught,
  producing `{ available: true, data }` or `{ available: false, reason }`
  per section rather than throwing.
- `alert-engine.ts`'s `safeDetect()` wrapper does the same for each of
  the five detectors inside `runAlertDetection` — a disabled Finance
  reporting flag degrades the receivables/payables detectors to an empty
  result (recorded in the returned `failures` array) rather than aborting
  vendor-payment/background-job/governance detection too. Found and fixed
  during this Stage's own test-planning, before it ever shipped without
  the wrapper — see "Errors found and fixed" below.

## Alert Engine detectors — exactly what each one checks

Every detector reuses an existing Finance reporting function or a
narrowly-scoped new read; none recomputes an existing calculation.

- `LARGE_OVERDUE_RECEIVABLE` / `LARGE_OVERDUE_PAYABLE` — from
  `getReceivablesAging`/`getPayablesAging`'s own `rows`, filtered by a
  fixed, documented threshold (`lib/founder-os/domain.ts`'s
  `ALERT_THRESHOLDS` — plain business rules, not a trained model, matching
  `lib/analytics.ts`'s own RFM-threshold precedent).
- `HIGH_RECEIVABLES_BALANCE` — the same aging call's bucket totals summed.
- `VENDOR_PAYMENT_PENDING_APPROVAL` — a direct, read-only query for
  `FinanceVendorPayment` rows in `REQUESTED` status (no existing Business
  Service exposes "list pending payments"; this never writes).
- `BACKGROUND_JOB_FAILED` — a direct, read-only query over
  `Phase2Operation` using the same `JOB:` operationType prefix convention
  Part 3C's own `findStalePhase2Jobs` already establishes.
- `PERMISSION_VIOLATION` / `ORGANIZATION_INCONSISTENCY` — **honest scope
  note, not a complete detector for the general concept either name
  implies.** No existing log records authorization *denials* (only
  successful `SOD_OVERRIDE` events are audited, by `enforceSegregationOfDuties`
  itself). A same-actor SoD override is the closest real, currently
  available governance signal, so that is what surfaces under
  `PERMISSION_VIOLATION`. `ORGANIZATION_INCONSISTENCY` here checks one
  real, narrow condition: a fiscal period reopened into `ADJUSTMENT`
  status for more than 14 days. Neither is a general-purpose
  violation/inconsistency scanner — a future stage should either build
  the missing detectors for real or rename these types to describe what
  they actually check.

Detection is idempotent by construction (dedup check before create, not
an idempotency-key claim) — re-running it repeatedly never creates
duplicate alerts for a still-unresolved condition, verified by a
dedicated test.

**Deferred, disclosed**: no scheduler/cron triggers detection
automatically (Stage 1's own objective scopes background execution out,
matching Part 3C's own two background jobs staying directly-callable
only). `runAlertDetection` notifies only the calling principal, not every
Founder account — correct for a single-Founder deployment today; a future
scheduled trigger should fan out to every active Founder.

## Global Search Foundation — foundation only, as scoped

A fixed fan-out of simple, case-insensitive `contains` queries across
Customer, Order, Product, `FinanceReceivableInvoice`, and
`FinanceVendorBill`, merged into one unified result shape. No ranking, no
embeddings, no AI call of any kind. No new search-index table — the
existing storefront-facing `SearchQuery` model (a log of customer product
searches) is a different concern and is untouched. A future stage can
replace the fan-out with a real index or add ranking; this Stage defines
the result contract and entity coverage only.

**Deferred, disclosed**: the deep links this returns
(`/admin/finance/receivables/:id`, `/admin/finance/payables/:id`) name
routes that do not exist yet — Part 3C itself has no Server Action or API
route, let alone a UI page, for any Finance capability. These are the
intended future route shape, not working links today.

## Security

Every Founder OS function requires a trusted principal
(`requireFounderOsPrincipal`) — verified structurally by the Part 3D
verifier script across every service file. No Founder OS file writes
directly into any `finance_*` table (verified structurally) — every
Finance number flows through the frozen Part 3C Business Services or a
direct, read-only aggregate. No new SoD-governed operation is introduced:
Stage 1 performs no maker-checker-style sensitive mutation of its own
(acknowledging/resolving an alert or marking a notification read are
internal admin actions, not financial transactions requiring two-actor
separation) — it structurally cannot bypass Finance SoD, because it never
calls a posting or approval function at all, only read functions plus its
own new alert/notification/widget CRUD.

## Errors found and fixed during this Stage (self-challenge, not hidden)

1. **A silently dropped column, caught before it became a migration.**
   While generating this Stage's migration diff, `prisma migrate diff`
   proposed `ALTER TABLE "finance_ledger_entries" DROP COLUMN "postedAt"`
   — a column on a **frozen** Part 3C table. Investigation traced this to
   an editing mistake in the audit-repair pass that added `journalType`
   to the same model: the replacement text substituted the new field in
   place of `postedAt` instead of adding it alongside, silently dropping
   the field from `schema.prisma` (the live database column was never
   touched — no migration had been generated from the broken schema yet
   — so no data was ever at risk, but generating a migration from that
   state would have destroyed a real, populated column on a frozen,
   append-only table). Fixed by restoring the field before generating any
   migration; re-ran the diff and confirmed the `DROP COLUMN` disappeared
   and no other unexpected drift existed. This is exactly why a fresh
   `prisma migrate diff` was generated and read in full before hand-
   assembling this Stage's migration, rather than trusting the schema
   file's history.
2. **Alert detection had no graceful degradation, unlike the KPI
   Engine.** Caught during test planning, before any test was written
   against the broken version: `runAlertDetection`'s five detectors ran
   under one `Promise.all` with no individual error handling, so a
   disabled `ENTERPRISE_FINANCIAL_REPORTING_ENABLED` flag (which the
   receivables/payables detectors depend on transitively) would have
   aborted vendor-payment, background-job, and governance detection too.
   Fixed with a `safeDetect()` wrapper mirroring `kpi-engine.ts`'s own
   `safe()` pattern; `runAlertDetection`'s return value now reports which
   sections failed (`failures`) rather than throwing.
3. **A near-collision with pre-existing, pre-provisioned permissions.**
   The first draft of this Stage invented 8 new `founder_os.*` permission
   keys without checking whether anything already existed under that
   namespace. `prisma/seed.ts` already had a `founder_os` permission
   module (9 keys) seeded from earlier work anticipating this exact
   Stage, and one of the 8 invented keys (`founder_os.alerts.manage`)
   collided exactly with a pre-existing one. Reconciled before any test
   was written: `founder_os.access` and `founder_os.alerts.manage` are
   reused as-is; only 3 genuinely new keys (notifications view/manage,
   widgets manage) were added; the remaining 7 pre-provisioned keys stay
   reserved-but-unused, documented the same way
   `ENTERPRISE_TAX_COMPLIANCE_ENABLED` was in Part 3C.

## Testing

One real-database integration test file, no mocked Prisma:
`__tests__/founder-os/stage1.integration.test.ts` — 17 tests (count as
of the Stage 5 hardening pass, which added one test to this file
without this document being revisited at the time; corrected here per
the Independent Audit's finding F4) covering
access control (flag off, missing permission), the KPI Engine's graceful
degradation, Company Health's signal computation, the Executive Summary
composition, the full Alert acknowledge/resolve lifecycle plus
cross-organization not-found handling plus detection idempotency, the
Notification Center's create/list/mark-read/mark-all-read, Timeline and
Activity Feed pagination, Search Foundation (empty-result and a real
match), the Widget Framework's default listing and per-user override, and
the Dashboard orchestrator composing everything. `afterAll` cleans up
every row this suite created directly (`FounderAlert`/
`FounderNotification`/`FounderWidgetPreference` are ordinary, non-immutable
rows — unlike Part 3C's Finance tables, ordinary deletion is correct here,
not a defect to work around).

## Known limitations

- No UI page renders any of this yet — Server Actions
  (`actions/founder-os.ts`) exist and are tested indirectly through their
  underlying Business Services, but no `app/` page calls them.
- No scheduler/cron triggers `runAlertDetection` automatically.
- `PERMISSION_VIOLATION`/`ORGANIZATION_INCONSISTENCY` detectors are
  narrow proxies, not general-purpose scanners — see "Alert Engine
  detectors" above.
- Global Search's deep links name Finance UI routes that don't exist yet.
- `getExecutiveTimeline`'s "founder-significant" event-type allowlist
  (`timeline-feed.ts`) is a fixed, documented list, not configurable.
- Company Health's signals are simple, documented proxies (a receivables-
  to-monthly-revenue ratio, a cash-to-payables coverage ratio), not
  textbook DSO/liquidity ratios — this schema doesn't retain the
  historical balance snapshots a textbook calculation would need, the
  same limitation `lib/analytics.ts` itself already discloses for its own
  `netCashFlow`/`turnoverRatio` proxies.

## Verification commands run for this Stage

```text
npx prisma format · npx prisma validate
npx prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script   (reviewed in full before hand-assembly — this is what caught the postedAt regression)
npx prisma migrate deploy · npx prisma generate · npx prisma migrate status
npm run db:seed   (run twice — idempotency check)
npx tsc --noEmit --pretty false
npx vitest run   (focused Founder OS file, then full suite)
node scripts/verify-enterprise-phase1.cjs
node scripts/verify-enterprise-phase2-part3a.cjs
node scripts/verify-enterprise-phase2-part3b.cjs
node scripts/verify-enterprise-phase2-part3b-db.cjs
node scripts/verify-enterprise-phase2-part3c.cjs
node scripts/verify-enterprise-phase2-part3d.cjs
node scripts/verify-sales-architecture.cjs
npm run build
```

Exact pass/fail numbers are in the accompanying implementation report.

## Next (explicitly not started)

Stage 2+ of Founder OS is not defined here and was not begun. This
document stops cleanly at the end of Stage 1, as instructed.
