# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System, Stage 4

**Status: Stage 4 implemented and tested. Not frozen — no claim of
independent verification or freeze is made anywhere in this document.**
Builds directly on `PART_3D_FOUNDER_OS_STAGE1.md`, `STAGE2.md`, and
`STAGE3.md` (read all three first — this document assumes them). Stage
5+ is explicitly out of scope and not started; per the governing
instruction for this Part, work stops at the end of each stage and waits
for explicit authorization before continuing.

## Objective

Founder Workspace — a personalization and executive-productivity layer
over the real Founder OS surfaces built in Stages 1-3. Saved Views,
Dashboard Layouts, Pinned Widgets, Saved Filters, an Executive Report
Workspace with deterministic on-demand generation, a scheduling
*preferences* foundation (no execution), Workspace Preferences, and
ownership-scoped Search integration. No AI, no prediction, no
speculative automation, no automatic continuation to Stage 5.

## What's genuinely new vs. reused

Four new Prisma models (`FounderSavedView`, `FounderDashboardLayout`,
`FounderSavedReport`, `FounderWorkspacePreference`) plus two new columns
(`pinned`, `pinnedOrder`) on the existing Stage 1 `FounderWidgetPreference`
table. Every one of these stores a *configuration*, never a snapshot of
business data — every read/generate still calls the real Stage 1-3
service live.

- **Saved Views** (`saved-view-service.ts`) — a structured description
  (surface + filters + sort + date range + display mode) of a view onto
  one of nine real surfaces (`WORKSPACE_SURFACES` in `domain.ts`: Alerts,
  Decision Queue, Approval Center, Exception Center, Enterprise
  Monitoring, Timeline, Activity Feed, Search, Executive Reports — every
  one a real Stage 1-3 surface, none invented). Filters are `(field,
  operator, value)` triples; `field` is checked against a fixed
  per-surface allowlist (`SURFACE_FILTERABLE_FIELDS`), `value` is
  restricted to string/number/boolean/bounded-array by the Zod schema —
  there is no code path that accepts a raw query fragment or an
  arbitrary JSON expression tree. At most one default view per
  (owner, surface), enforced both by an application-level
  unset-then-set sequence inside a Serializable transaction *and* by a
  hand-added partial unique index
  (`founder_saved_views_one_default_per_owner_surface`) — proven live in
  the test suite by attempting to violate it directly via two raw
  `prisma.founderSavedView.create` calls, not just trusted from the
  service's own logic.
- **Dashboard Layouts** (`dashboard-layout-service.ts`) — a named,
  ordered arrangement of the Stage 1 widget catalogue (`widgets` is a
  JSON array of `{ widgetCode, order, section?, width?, height?,
  visible }`). Every `widgetCode` is validated on every write against a
  new shared module, `widget-catalogue.ts` (see below) — the same
  authorization check `listWidgetsForCurrentUser` itself uses, so a
  layout can never reference a deleted, inactive, or permission-gated
  widget the current user doesn't hold. At most one active and one
  default layout per owner, same partial-unique-index pattern as Saved
  Views. "Reset to system default" deactivates (never deletes) the
  owner's layouts, falling back to each widget's own
  `defaultVisible`/`defaultOrder` — Stage 1's real fallback, not a
  fabricated second "system layout" row.
- **Pinned Widgets** — deliberately *not* a new file or table. Two
  columns (`pinned`, `pinnedOrder`) were added directly to Stage 1's
  existing `FounderWidgetPreference` row; the pin functions live in
  `widget-service.ts` alongside `listWidgetsForCurrentUser`/
  `setWidgetPreference`. Duplicate-pinning is structurally impossible
  (the row's own `@@unique([organizationKey, userId, widgetId])` from
  Stage 1 already prevents a second row for the same user+widget); the
  max-pin-limit (`WORKSPACE_LIMITS.maxPinnedWidgets = 8`) and
  widget-authorization check are both application-level, reusing
  `widget-catalogue.ts`.
- **`widget-catalogue.ts`** (new shared module) — factored out of Stage
  1's `listWidgetsForCurrentUser` *before* Dashboard Layouts and Pinned
  Widgets were written (this Stage's own established "extract first,
  don't duplicate" discipline from Stage 2/3), so all three widget
  consumers validate against the exact same ACTIVE + permission-
  authorized widget set.
- **Executive Report Workspace + Report Generation**
  (`report-workspace-service.ts`) — a Saved Report is a persisted
  *request shape* (report type, metrics, date range, comparison mode,
  grouping, filters, sort, output preference). `generateReport` never
  computes a business number itself: it dispatches by `reportType` to
  exactly one existing composition —
  `EXECUTIVE_SUMMARY → getExecutiveSummary()`,
  `KPI_SNAPSHOT → getEnterpriseKpis()`,
  `TREND_ANALYSIS → getRevenueTrendSeries()`,
  `PERIOD_COMPARISON → getComparison()/getAllComparisons()`,
  `DECISION_QUEUE_SNAPSHOT → getDecisionQueue()` — then attaches
  Explainability metadata (Stage 2's `explainMetric`) for every
  requested metric. `metrics` is validated with `z.enum(SUPPORTED_REPORT_METRICS)`,
  a list derived directly from `explainability-service.ts`'s own
  `METRIC_REGISTRY` keys — **Profit has no entry there** (no
  authoritative computation exists anywhere in this codebase, per
  Stage 2's own documented limitation), so it is structurally
  impossible to request, not merely rejected by a special case. Date
  ranges are bounded to `WORKSPACE_LIMITS.maxReportDateRangeDays` (400
  days). No file/PDF/CSV export exists anywhere in this codebase
  (confirmed by search before this Stage was built) — `outputPreference`
  only describes how the JSON payload is meant to be rendered by the
  caller (`DASHBOARD_VIEW` or `JSON`), never a generated file.
- **Report Scheduling Foundation** — `scheduleFrequency`/
  `scheduleTimezone`/`scheduleDeliveryChannel`/`scheduleEnabled`/
  `scheduleRequestedTime` are plain columns on `FounderSavedReport`,
  stored and returned as-is, never acted on. **Deliberately no
  `lastRunAt`/`nextRunAt` column exists anywhere in the schema** — there
  is no field that could ever be populated with a false execution
  claim, verified structurally by the Part 3D verifier.
- **Workspace Preferences** (`workspace-preference-service.ts`) — one
  row per (organization, user): default dashboard layout (validated to
  be one of the same owner's own layouts), default landing surface,
  default date range (reusing `lib/analytics.ts`'s own `resolveDateRange`
  preset vocabulary, not a second one), default comparison mode, display
  density, table page size, timezone, notification display preferences.
  Checked against `User`'s own columns before adding any of these — none
  are duplicated.
- **Search Integration** — `search-foundation.ts`'s existing fan-out
  (Stage 1) gained three more branches (`SAVED_VIEW`, `SAVED_REPORT`,
  `DASHBOARD_LAYOUT`), each filtered by `ownerId: principal.id` — the
  entire enforcement behind "no cross-user results" for these three
  types, proven in the integration suite with two distinct accounts.

## Ownership model

Every Stage 4 read/write is scoped to `ownerId: principal.id` (or
`userId: principal.id` for Workspace Preferences) — including for the
Founder role. `isFounder` bypasses the *permission* check inside
`requireFounderOsPrincipal` (as it does everywhere else in this
codebase), and **never** the ownership scope — verified structurally
(the verifier greps all four owner-scoped service files for
`principal.isFounder` and fails if found) and behaviorally (the test
suite creates a second, distinct Founder-role account and proves it
cannot read, update, delete, or find-via-search the first account's
saved views/reports). A missing or foreign-owned resource returns
`NotFoundError`, never `ForbiddenError` — consistent with Stage 1's own
"not found, not a cross-org leak" convention, so a non-owner can't
distinguish "doesn't exist" from "exists but isn't yours."

## Permissions

One new key: `founder_os.workspace.manage`, gating every Stage 4 write
(create/update/delete/set-default/activate/pin/unpin/reorder/generate/
save-preferences). Reads use the existing `founder_os.access`, same
split Stage 1 already established for `founder_os.widgets.manage`. None
of the 9 pre-provisioned `founder_os.*` keys fit a personal-workspace
write concern (`founder_os.approvals.perform` is reserved for actually
approving something, a different action); reusing one would have been a
semantic mismatch, not a genuine reuse — so one new key was added, not
zero, and not more than one.

## Data model

Four new tables, all additive, all indexed by `(organizationKey,
ownerId, ...)`:

- `founder_saved_views` — partial unique index for at most one default
  per (organizationKey, ownerId, surface).
- `founder_dashboard_layouts` — partial unique indexes for at most one
  active and at most one default per (organizationKey, ownerId).
- `founder_saved_reports` — no uniqueness constraint needed (reports
  don't have a "default" concept).
- `founder_workspace_preferences` — unique per (organizationKey, userId);
  `defaultDashboardLayoutId` has a real Prisma-level FK/relation to
  `FounderDashboardLayout` (unlike the `xById`-to-`User` columns
  throughout this codebase, this one relation didn't need to avoid a
  giant hub model, so it's a normal declared relation, not a
  hand-written-only FK).

Every `ownerId`/`userId` column has a hand-written FK to `users(id)` in
the migration (the same established pattern as every prior Part/Stage —
Prisma's relation to `User` is deliberately not declared to avoid
another back-relation array on that already-large model).

**Independent Audit finding F2, disclosed here:** the three partial
unique indexes above exist only as hand-written SQL in
`prisma/migrations/20260801090000_.../migration.sql` — Prisma's schema
language has no partial-index syntax (no `previewFeatures` enable one
here either), so `schema.prisma` cannot express them and
`npx prisma db push` (documented in `CLAUDE.md` as a legitimate
dev-only "fast local sync" command) will **not** recreate them on a
database it provisions from scratch. Every environment stood up via
`prisma migrate deploy`/`migrate dev` (production always uses `migrate
deploy` per `CLAUDE.md`) gets the real indexes; a dev database built
purely with `db push` would not, leaving the "at most one default/active"
invariant enforced only by the application's own unset-then-set
transaction sequencing for that specific database. That sequencing is
still real protection under Prisma's Serializable transaction isolation,
just without the index as a second, independent backstop.

## Validation schemas

Every Stage 4 Zod schema is `.strict()` — unknown keys are a validation
error, not silently dropped (the concrete mechanism behind "reject
unsupported keys"). Filter conditions are `{ field, operator, value }`
triples where `operator` is one of nine named enum values and `value` is
restricted to `string | number | boolean | bounded array` — there is no
schema branch that accepts an object, so "no raw SQL," "no code," and
"no arbitrary JSON execution" are true by construction. Array sizes
(`filters`, `metrics`, `widgets`, pin-reorder lists) are all bounded via
`WORKSPACE_LIMITS` in `domain.ts`.

## Dashboard-layout / widget behavior

See "What's genuinely new" above. Widget authorization is checked at
write time (creating/updating a layout, pinning a widget) via
`widget-catalogue.ts`'s `assertWidgetCodesAuthorized` — not merely at
read time — so a layout or pin referencing a widget the owner isn't
authorized for is rejected outright, not silently hidden later.

## Report-generation flow

`generateReport(id)` → ownership check → date-range validation → dispatch
by `reportType` to exactly one Stage 1/2 composition → attach
Explainability metadata for every requested metric (bounded to
`maxMetricsPerReport`) → stamp `lastGeneratedAt` → return
`{ report, generatedAt, sections, explainability, sourceSystems }`.

## Scheduling limitation

Restated plainly (Stage 3 already established this for background jobs;
Stage 4 extends the same honesty to reports): **no scheduler exists
anywhere in this codebase.** `scheduleEnabled: true` on a Saved Report
means only "the Founder has expressed this preference" — it does not run
anything, and nothing reads these columns to trigger execution. A future
stage that adds a real scheduler can act on these columns without a
schema change; this Stage does not pretend one already exists.

## Search integration

See "What's genuinely new." No new search index or ranking — the same
fixed `contains`, case-insensitive fan-out Stage 1 established, now with
three more branches, each ownership-filtered.

## Audit behavior

Stage 4 does not call `recordEnterpriseMutation` (the Part 3A-established
helper that also writes to `SalesTimelineEvent` and creates a
`NotificationLog` entry) for its own mutations — deliberately: a saved
view rename or a pinned-widget reorder is personal workspace housekeeping,
not a founder-significant business event, and routing it through the
Executive Timeline/Activity Feed would pollute both with noise those
surfaces were specifically curated to avoid (see `timeline-feed.ts`'s own
"founder-significant" allowlist rationale). No parallel audit table was
built either. **Auditability for Stage 4 is deferred, not built in this
Stage** — see "Known limitations." (`lib/sales/audit.ts`'s
`appendAuditLog`, writing to the existing `SalesAuditLog` table, is the
correct, already-existing mechanism to wire in for this; it was not
wired in this Stage because doing so for five different mutation
surfaces with sensible before/after payloads is itself a real, scoped
piece of work better done deliberately than bolted on at the end of an
already-large Stage.)

## Errors found and fixed during this Stage (self-challenge, not hidden)

1. **A raw-SQL precedence bug in the verifier's own live-database check.**
   The first draft of the "partial unique indexes exist" check used
   `WHERE tablename IN (...) AND indexname LIKE 'a' OR indexname LIKE 'b'`
   — due to SQL's operator precedence, this is `(tablename IN (...) AND
   LIKE 'a') OR (LIKE 'b')`, which would also match an unrelated table's
   index merely named `...one_active...`. Caught by reading the query
   literally before trusting it, not by a failure — fixed with explicit
   parentheses around the `OR`.
2. **A doc comment triggered its own "column doesn't exist" check.** The
   verifier's `lastRunAt`/`nextRunAt` absence check used a bare
   `/lastRunAt|nextRunAt/` regex against the full `schema.prisma` text —
   which matched this very Stage's own doc comment *explaining* why those
   columns don't exist, failing a true statement for a false reason.
   Fixed to require the word be immediately followed by `\s+DateTime` (an
   actual field declaration shape), which comments never are.
3. **A verifier assertion from Stage 3 went stale the moment Stage 4
   legitimately added a permission key.** Stage 3's own check asserted
   "exactly 12 `founder_os.*` keys total" — true when Stage 3 was
   written, false the instant Stage 4 added its one new key, for a
   completely correct reason. A bare total-count assertion is the wrong
   shape for a check meant to survive future stages. Fixed by rewriting
   it as "these exact 12 keys that existed as of Stage 3 are still
   present" (a subset check), which stays true regardless of how many
   *new* keys later stages correctly add — the general lesson (bare
   counts go stale, name-based subset checks don't) is now applied
   here for the first time in this verifier.
4. **This document itself first claimed "no Stage 2 file was touched,"
   which was false.** `explainability-service.ts` (Stage 2) was in fact
   modified — one export added, `SUPPORTED_REPORT_METRICS`. Caught during
   the file-by-file self-challenge pass by grepping every
   `lib/founder-os/*.ts` file actually written or edited this Stage
   against the draft document's claims, not by trusting the draft.
   Fixed by correcting the "Did any Stage 1-3 file get unnecessarily
   modified?" answer to name all three real modifications and explain
   why each was necessary.
5. **Report generation's KPI-metric filtering was going to require a
   second mapping table.** First instinct for `KPI_SNAPSHOT` was to
   cherry-pick individual values out of `getEnterpriseKpis()`'s response
   by walking a `METRIC_REGISTRY key → kpis.* path` lookup table —
   which would itself be a second piece of knowledge about the KPI
   Engine's shape that could drift from the real one. Recognized before
   writing it; fixed by returning `getEnterpriseKpis()`'s full,
   unmodified output alongside the plain list of `requestedMetrics`,
   letting the caller cross-reference — honest about what's included
   rather than fabricating a precise-looking extraction that could
   silently mismatch.

## Self-challenge — the required question list, answered

- **Can one user access another user's workspace?** No — proven in the
  integration suite with two distinct Founder-role accounts (chosen
  specifically so the test isolates ownership from permission — both
  bypass permission checks via `isFounder`, so a failure could only come
  from ownership scoping, not the permission gate).
- **Can a user store an unauthorized widget?** No — a dedicated,
  isolated test role (granted only `founder_os.access` +
  `founder_os.workspace.manage`, never touching the shared "Customer
  Support" role other suites rely on) is rejected when referencing a
  widget with a `requiredPermission` it lacks.
- **Can malformed JSON bypass filter validation?** No — a filter
  `value` of `{ $where: "1=1" }` fails Zod validation (not in the
  string/number/boolean/array union), proven directly against the
  schema.
- **Can unsupported fields enter saved filters?** No — `field: "password"`
  on the `ALERTS` surface is rejected by `SURFACE_FILTERABLE_FIELDS`.
- **Can saved reports call unsupported metrics?** No —
  `metrics: ["PROFIT"]` fails Zod validation; Profit has no registry
  entry to be enum-valid against.
- **Can report generation duplicate financial calculations?** No —
  every report type dispatches to an existing Stage 1/2 function;
  verified structurally (no direct `finance_*`/Prisma query exists in
  `report-workspace-service.ts`).
- **Can multiple defaults exist?** No — proven at the database level
  (two direct `create` calls with `isDefault: true` for the same
  owner+surface; the second is rejected by the partial unique index),
  not only trusted from the service's own unset-then-set sequence.
- **Can stale or deleted widgets remain referenced?** Every write to a
  layout or a pin re-validates the full widget code list against the
  live, ACTIVE-only catalogue — nothing is cached from creation time.
- **Can a large date range overload report generation?** No — bounded to
  400 days, tested directly (500-day range rejected).
- **Can scheduling configuration falsely imply execution?** No — no
  `lastRunAt`/`nextRunAt` field exists to be false; `scheduleEnabled`
  only means "stated preference."
- **Can search expose another user's saved data?** No — proven with two
  accounts against the same query string.
- **Can workspace mutations bypass audit?** Deliberately deferred, not
  bypassed — see "Audit behavior" and "Known limitations"; this Stage
  never claims auditability it doesn't have.
- **Can any action bypass RBAC?** No — every entry point requires
  `requireFounderOsPrincipal`, verified structurally for every service
  file (the same check every prior Stage's verifier has run).
- **Did any Stage 1-3 or Part 3C file get unnecessarily modified?** Three
  files were modified, each necessarily and each re-tested — caught and
  corrected in this exact list during self-challenge, since an earlier
  draft of this document claimed only two: `widget-service.ts` (Stage 1
  — add pin functions, reuse the new `widget-catalogue.ts`),
  `search-foundation.ts` (Stage 1 — add three ownership-filtered search
  branches), and `explainability-service.ts` (Stage 2 — add one export,
  `SUPPORTED_REPORT_METRICS = Object.keys(METRIC_REGISTRY)`, so Saved
  Report metric validation derives from the Stage 2 registry directly
  rather than hand-maintaining a second metrics list that could drift
  out of sync with it — the smallest possible change that avoids
  duplicating "which metrics are real"). No Part 3C file was touched.
- **Is any capability mocked, hardcoded, or falsely reported as working?**
  No — every claim above (ownership isolation, widget authorization,
  filter/metric validation, database-level default uniqueness,
  date-range bounding, scheduling being preferences-only) is backed by a
  real integration test against the real database, not a mock.

## Testing

One real-database integration test file, no mocked Prisma:
`__tests__/founder-os/stage4.integration.test.ts` — 23 tests. Setup
creates three dedicated test identities beyond the usual Founder/
restricted pair: a second Founder-role account (for ownership-isolation
proof independent of permission bypass), a dedicated limited-permission
role/user (`founder_os.access` + `founder_os.workspace.manage` only, on
an isolated new `SalesRole` — never touching the shared "Customer
Support" role other Founder OS test files depend on staying
`founder_os`-free, to avoid any cross-file interference), and a
temporary permission-gated widget definition, all torn down in
`afterAll`. Covers: access control (read gate and write gate
separately), Saved View CRUD, unsupported-field/malformed-value/
unsupported-surface/unsupported-key rejection, default-uniqueness both
via the service and directly at the database level, cross-user denial;
Dashboard Layout CRUD, invalid/unauthorized widget rejection,
at-most-one-active/default enforcement, reset-to-system-default;
Pinned Widgets pin/duplicate-pin/limit/unpin/reorder/invalid-reorder-set;
Saved Report CRUD, Profit rejection, oversized date-range rejection,
scheduling-is-configuration-only, generation for all five report types,
cross-user denial; Workspace Preferences save/retrieve/ownership/enum
validation; Search ownership filtering; and a regression check that
Stage 1's `listWidgetsForCurrentUser` still works with the new columns.

## Known limitations

- **Auditability is deferred, not implemented.** Stage 4 mutations do
  not currently write to `SalesAuditLog` or any audit trail. Wiring in
  `lib/sales/audit.ts`'s existing `appendAuditLog` for the five mutation
  surfaces (Saved Views, Layouts, Pins, Saved Reports, Preferences) with
  sensible before/after payloads is real, scoped follow-up work — not
  done here to avoid rushing it at the end of an already-large Stage.
- **No file export.** `outputPreference` describes rendering intent
  only; no PDF/CSV/file generation exists anywhere in this codebase.
- **No scheduler.** Scheduling fields are preferences only — see
  "Scheduling limitation" above.
- **KPI_SNAPSHOT reports return the full KPI Engine payload**, not a
  precisely filtered subset matching `requestedMetrics` — see "Errors
  found and fixed," item 4, for why a precise filter was deliberately
  not built this Stage.
- Saved Views' per-surface filterable-field allowlists
  (`SURFACE_FILTERABLE_FIELDS`) are conservative and may need expansion
  as real UI requirements surface — extending them requires updating
  both the list and confirming the target surface's own service
  actually supports filtering/sorting by the new field.
- Workspace Preferences' `defaultLandingSurface`/`defaultComparisonMode`/
  etc. are stored but not yet read by any Stage 1-3 service to actually
  change default behavior — this Stage builds the preference storage
  and validation; wiring each Stage 1-3 entry point to consult it is
  follow-up work.

## Verification commands run for this Stage

```text
npx prisma format
npx prisma validate
npx prisma migrate deploy
npx prisma migrate status
npx prisma generate
npm run db:seed
npx tsc --noEmit --pretty false
npx vitest run   (focused: __tests__/founder-os/stage4.integration.test.ts, then full __tests__/founder-os, then full suite)
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

## Deferred items

- Auditability wiring (see "Known limitations").
- Wiring Workspace Preferences into Stage 1-3 entry points as actual
  defaults.
- A precise per-metric KPI_SNAPSHOT filter.
- File export, if a trusted export infrastructure is ever introduced.
- Real scheduled execution, if a real scheduler is ever introduced.

## Next

Stage 5 is not started and was not begun, per the explicit "complete one
stage, stop, wait for authorization" instruction governing this Part.
