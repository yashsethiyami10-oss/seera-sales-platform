# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System — Consolidated Reference

**Status: Stages 1–4 implemented, tested, and hardened by a Stage 5
architecture/security/performance review. Not frozen — no claim of
independent verification or freeze is made anywhere in this document.**
This is a cross-stage reference, not a replacement for the four
per-stage documents — read those for full narrative detail on each
stage's own design decisions and self-challenge history:

- `PART_3D_FOUNDER_OS_STAGE1.md` — Dashboard Foundation
- `PART_3D_FOUNDER_OS_STAGE2.md` — Executive Intelligence
- `PART_3D_FOUNDER_OS_STAGE3.md` — Enterprise Control Center
- `PART_3D_FOUNDER_OS_STAGE4.md` — Founder Workspace
- This document — Stage 5, Founder OS Completion (review/hardening, no new capability)

## 1. What Founder OS is

A read-mostly executive intelligence and productivity layer over the
frozen Part 3C Enterprise Finance Platform and the frozen Phase 15
`lib/analytics.ts` BI layer. No AI, no prediction anywhere in Founder
OS — every number is either a direct real query or a fixed, documented
business rule. Zero Founder OS Prisma model has ever been written to by
anything outside `lib/founder-os/*.ts`.

## 2. Layered architecture (confirmed acyclic — Stage 5 review)

```
domain.ts, context.ts            (leaves — vocabulary, principal helper)
        |
schemas.ts                       (Zod, depends on domain.ts + explainability-service.ts's SUPPORTED_REPORT_METRICS)
        |
alert-store.ts, approval-store.ts, job-store.ts, widget-catalogue.ts
        (internal store helpers — take `tx`/`principal`, no principal check of their own,
         exempted from the verifier's per-file principal check, same convention as
         Part 3C's postSystemGeneratedJournalInTx)
        |
kpi-engine.ts, notification-center.ts, timeline-feed.ts, search-foundation.ts,
alert-engine.ts, risk-engine.ts, company-health-service.ts, trend-engine.ts,
comparison-engine.ts, decision-queue-service.ts, drilldown-service.ts,
explainability-service.ts, approval-center-service.ts, monitoring-service.ts,
exception-center-service.ts, activity-supervision-service.ts, notification-rules.ts,
widget-service.ts, saved-view-service.ts, dashboard-layout-service.ts,
report-workspace-service.ts, workspace-preference-service.ts
        (services — each requires a principal itself, each calls one layer down only)
        |
executive-summary-service.ts, dashboard-service.ts, brief-engine.ts
        (composition services — call multiple services above, never a store directly)
        |
actions/founder-os.ts            (thin toErrorResponse wrappers, zero business logic)
```

Verified acyclic by direct inspection during the Stage 5 review: no
service imports a composition service, no store imports a service, no
file imports something that (transitively) imports it back.

## 3. Every table and its single owner

| Table | Owner file(s) | Written by |
|---|---|---|
| `FounderAlert` | `alert-store.ts` (create/dedupe), `alert-engine.ts` (lifecycle: acknowledge/resolve) | Alert Engine, Risk Engine (via shared `upsertAlert`) |
| `FounderNotification` | `notification-center.ts` (create/read-state), `notification-rules.ts` (escalation) | Alert Engine (via `createNotificationInTx`), direct calls, escalation |
| `FounderWidgetDefinition` | seed only (registry) | — |
| `FounderWidgetPreference` | `widget-service.ts` (visibility/order + Stage 4 pin columns) | Widget Framework, Pinned Widgets |
| `FounderSavedView` | `saved-view-service.ts` | Saved Views only |
| `FounderDashboardLayout` | `dashboard-layout-service.ts` | Dashboard Layouts only |
| `FounderSavedReport` | `report-workspace-service.ts` | Executive Report Workspace only |
| `FounderWorkspacePreference` | `workspace-preference-service.ts` | Workspace Preferences only |

No table has more than two owning files, and every case of two owners
is a deliberate split between "creation" and a distinct "state
transition" concern (e.g., notification creation vs. escalation) — never
two competing implementations of the same write.

## 4. Reuse map (what calls what, real vs. duplicated)

Every KPI number traces to exactly one of: `lib/analytics.ts` (frozen
Phase 15), `lib/enterprise-finance/*.ts` (frozen Part 3C — AR/AP/Banking
reporting), or a documented new read-only aggregate where no existing
function covers the need (`kpi-engine.ts`'s `getExpenseTotals`/
`getSalesPipelineSummary`, `risk-engine.ts`'s month-over-month expense
comparison). No Founder OS file ever recomputes a KPI another Founder OS
file already computed — confirmed structurally by the verifier and
manually during the Stage 5 review (see §7).

Shared internal "store" modules exist specifically to prevent
duplicate query logic between two or more callers:

- `alert-store.ts` — `upsertAlert` (Alert Engine + Risk Engine),
  `listCriticalActiveAlerts` (Brief Engine + Activity Supervision — added
  during the Stage 5 review after finding both had independently written
  the identical inline query)
- `approval-store.ts` — pending/recently-decided vendor-payment/expense-claim
  queries (Decision Queue + Approval Center)
- `job-store.ts` — failed/active/recently-completed background-job queries
  (Alert Engine + Enterprise Monitoring)
- `widget-catalogue.ts` — authorized-widget-set (Widget Framework, Pinned
  Widgets, Dashboard Layouts)

## 5. Security model (confirmed — Stage 5 review)

- **RBAC**: every top-level entry point calls `requireFounderOsPrincipal(permission)`
  → `requireEnterprisePrincipal(permission, "ENTERPRISE_FOUNDER_OS_ENABLED")`.
  Verified for every service file except the internal store helpers
  (which take an already-checked principal from their caller). One gap
  found and fixed this Stage: `listBusinessAreas()` had no check at all
  — see §8.
- **Founder bypass, precisely scoped**: `isFounder` bypasses the
  *permission* check only, never the `ENTERPRISE_FOUNDER_OS_ENABLED`
  feature-flag check (tested since Stage 1), and never the *ownership*
  scope Stage 4 introduced (tested with two distinct Founder-role
  accounts in Stage 4's suite — a Founder cannot read another Founder's
  saved views/layouts/reports/preferences).
- **Ownership** (Stage 4 resources only — Stages 1-3 have no
  per-user-owned resources): every query filters by `ownerId: principal.id`
  / `userId: principal.id`; verified structurally that none of the four
  owner-scoped services ever reference `principal.isFounder`.
- **Organization isolation**: every query filters by
  `organizationKey: principal.organizationKey`, always `"MUV"` in this
  single-organization deployment (`ENTERPRISE_ORGANIZATION` constant,
  frozen Part 3A foundation).
- **Transaction safety**: every mutation runs inside
  `enterpriseTransaction` (Prisma Serializable isolation). Default/active
  uniqueness (Stage 4) is additionally backed by hand-added partial
  unique indexes — proven at the database level, not only trusted from
  application sequencing, **provided the environment was provisioned via
  `prisma migrate deploy`/`migrate dev`**. Independent Audit finding F2:
  these indexes exist only in hand-written migration SQL (Prisma's
  schema language has no partial-index syntax), so `prisma db push` — a
  documented, legitimate dev-only command per `CLAUDE.md` — will not
  recreate them on a database it provisions from scratch. See
  `PART_3D_FOUNDER_OS_STAGE4.md`'s "Data model" section for the full
  disclosure.
- **Validation**: every mutating entry point parses input through a
  Zod schema before touching Prisma; Stage 4 schemas are `.strict()`
  (reject unknown keys) with bounded array sizes and a closed
  field/operator/value shape for structured filters — no raw SQL, no
  code, no arbitrary JSON execution is representable.
- **Safe error handling**: every Server Action wraps its service call in
  try/catch → `toErrorResponse` (`lib/errors.ts`), never leaking a raw
  Prisma/stack trace to the client.
- **No privilege escalation found**: confirmed by direct review — no
  entry point grants itself a wider scope than its caller, no stored
  configuration (filter, saved view, preference) can expand what a
  request is authorized to read/write beyond what the live permission
  check already allows.

## 6. Performance findings and fixes (Stage 5)

1. **`getFounderDashboard()` ran the KPI Engine's ~8-way parallel query
   set three times** for one dashboard load (once directly, once inside
   its own `getExecutiveSummary()` call, once inside that call's nested
   `getCompanyHealth()` call) — because `getExecutiveSummary` and
   `getCompanyHealth` each independently called `getEnterpriseKpis()`.
   Fixed: `getCompanyHealth(precomputedKpis?)` and
   `getExecutiveSummary(precomputed?: {kpis, health})` now accept
   already-fetched values; `getFounderDashboard` fetches once and threads
   the same objects through. Standalone callers (tests, Stage 4's
   `generateReport`) are unaffected — omitting the parameter self-fetches
   exactly as before.
2. **`monitoring-service.ts` and `decision-queue-service.ts`** each
   opened a separate Postgres transaction per independent read (3 and 4
   respectively) inside one `Promise.all` — batched into a single
   transaction each (decision queue's `getReceivablesAging` call stays
   outside the transaction, since it manages its own connection and runs
   in parallel with the batch).
3. **Not fixed, documented as reviewed-and-acceptable**: the same
   "one-transaction-per-independent-read" pattern exists in
   `approval-center-service.ts` and `exception-center-service.ts` too.
   Not changed this Stage — the fix was scoped to the two surfaces this
   Stage's review explicitly named ("monitoring," "decision queue"); a
   blanket rewrite of every composition file's transaction shape is a
   larger, higher-risk change than a hardening pass should make
   unprompted. Flagged here as a known, real, deliberately-deferred
   optimization opportunity, not a silently-missed one.
4. **Reviewed and confirmed acceptable, not a defect**: the sequential
   `for`-loop + `await upsertAlert(...)` pattern inside each Alert
   Engine/Risk Engine detector. This looks like N+1 but is the correct,
   required shape for writes inside a single Prisma interactive
   transaction (parallelizing writes on one `tx` client is unsafe); each
   entity has a distinct `sourceEntityId` so there's no cross-iteration
   dedupe race to worry about either way.

## 7. Architecture review — explicit confirmations

- **No duplicate KPI calculations**: confirmed — every KPI traces to
  exactly one real source (see §4); the one accidental *re-run* found
  (not a duplicate *implementation*, a duplicate *invocation*) is fixed
  in §6.
- **No duplicate approval logic**: confirmed — `approval-store.ts` is
  the single implementation, reused by Decision Queue and Approval
  Center.
- **No duplicate monitoring logic**: confirmed — `job-store.ts` is the
  single implementation, reused by Alert Engine and Enterprise
  Monitoring.
- **No duplicate exception logic**: confirmed — Exception Center's
  `groupBy` and Decision Queue's filtered `findMany` calls read the same
  `FounderAlert` table with different, purpose-specific shapes (a
  cross-module summary vs. a queue-relevant list) — different read
  shapes over one source of truth, not two implementations of the same
  concern.
- **No duplicated report generation**: confirmed — `generateReport`
  dispatches to exactly one existing Stage 1/2 composition per report
  type, never a second calculation path.
- **Correct dependency flow / clean layering / no circular
  dependencies**: confirmed, see §2.
- **Consistent service ownership**: confirmed, see §3.

## 8. Self-challenge findings and repairs (Stage 5)

1. **`listBusinessAreas()` had no principal check** — the only top-level
   Founder OS entry point without one, inconsistent with every other
   read and directly reachable via `fetchBusinessAreas`. Fixed: made
   async, added `requireFounderOsPrincipal(FOUNDER_OS_ACCESS)`. Two call
   sites (the action, one Stage 2 test) updated to `await` it; a new
   access-control test added.
2. **`brief-engine.ts` and `activity-supervision-service.ts` had
   independently written the identical CRITICAL-active-alert query** —
   found while auditing every `founderAlert.findMany` call site across
   the codebase for this review. Factored into `alert-store.ts`'s new
   `listCriticalActiveAlerts`.
3. **`getExecutiveSummary()`/`getCompanyHealth()` silently duplicated the
   KPI Engine's real query set** — see §6, item 1.
4. **`monitoring-service.ts`/`decision-queue-service.ts` opened more
   transactions than necessary** — see §6, item 2.
5. **`createNotification` (notification-center.ts) had zero production
   callers** — a fully-built, permission-gated, already-tested capability
   invoked only from test files. Wired to a new Server Action,
   `createFounderNotification`, completing the integration (no new
   business logic — the function already existed).
6. **A brittle bare permission-count check in the verifier** — Stage 4's
   own `founderOsPermissionCountAfterStage4 === 13` assertion is exactly
   the fragile pattern this Stage was asked to remove (the same class of
   check had already broken twice earlier in this engagement, in Part 3A's
   verifier and in Stage 3's own check, each time a later stage
   legitimately added a new permission key). Replaced with a named-list
   subset check that stays correct regardless of future additions.

No other duplicate implementation, permission leak, ownership leak,
transaction inconsistency, stale documentation claim, incorrect
assumption, integration gap, or mocked/hardcoded behavior was found
during this review beyond what's listed above.

## 9. Documentation consistency

All four per-stage documents were re-read during this review. No
factual inconsistency was found between them beyond the count drift
already addressed in §8, item 6 (the permission-count assertions in
Stage 3's and Stage 4's own text describe counts that were accurate at
the time each was written — historical accuracy preserved; only the
*verifier's* forward-looking assertions needed to become durable). Every
stage document's own "Known limitations" and "Deferred items" sections
remain accurate as of this Stage — none were resolved or invalidated by
this review (Stage 5 is a hardening pass, not a feature stage).

## 10. Test coverage

63 Founder OS tests across four stage files (Stage 1: 17, Stage 2: 15,
Stage 3: 8, Stage 4: 23). Two `it()` blocks were added during this
Stage's self-challenge — a precomputed-KPI `getExecutiveSummary`
equivalence test, and one new access-control assertion for
`listBusinessAreas` folded into Stage 2's existing access-control test —
plus one new assertion inside an existing Stage 1 test (dashboard
summary/health consistency). No test was added to inflate coverage
without a genuine gap behind it.

## 11. Known limitations (carried forward, unchanged by this Stage)

See each stage document's own section for full detail. Summarized:

- Stage 2: no authoritative Profit calculation exists anywhere in this
  codebase (Trend/KPI/Report metrics all structurally exclude it).
- Stage 3: Enterprise Monitoring's "Scheduled Tasks" is honestly
  unsupported (no scheduler exists).
- Stage 4: no file export exists; no scheduler exists (Report
  Scheduling is preferences-only); Workspace Preferences are stored but
  not yet consulted by Stage 1-3 services as actual defaults;
  auditability for Stage 4's own mutations is deferred (not wired to
  `SalesAuditLog`).
- Stage 5 (new, disclosed in §6 item 3): the "one transaction per
  independent read" pattern remains unoptimized in
  `approval-center-service.ts` and `exception-center-service.ts`.

## 12. Audit readiness

Founder OS (Stages 1-4, hardened by Stage 5) has: a verified-acyclic
layered architecture; a single confirmed owner per table; zero found
duplicate business/KPI/approval/monitoring/exception/report-generation
logic (one accidental re-invocation found and fixed, not a duplicate
implementation); RBAC + ownership + organization isolation verified
structurally and behaviorally on every entry point (one real gap found
and fixed); every mutation transactional, with two invariants also
backed by database-level partial unique indexes; every write validated
through `.strict()` Zod schemas with bounded sizes and closed filter
shapes; three confirmed performance inefficiencies found, two fixed, one
explicitly deferred and disclosed (not hidden); one dead integration
found and wired up; 127/127 Part 3D verifier checks passing, including
new structural checks that guard every fix made in this Stage against
silent regression; full test suite green; clean production build.

**This document does not itself constitute the Independent Audit.** Per
the explicit instruction governing this Stage, the Independent Audit is
a separate, subsequent activity requiring its own fresh authorization.
