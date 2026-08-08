# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System™ — FORMAL FREEZE

## 1. Part name

Part 3D — Founder Operating System (Stages 1–5).

## 2. Frozen scope

Everything covered by `PART_3D_FOUNDER_OS_STAGE1.md` through `STAGE4.md` and the Stage 5 hardening
pass recorded in `PART_3D_FOUNDER_OS_REFERENCE.md`, exactly as it stood after the Independent Audit
and the bounded repair of findings F1, F2, and F4:

- **Stage 1 — Dashboard Foundation**: KPI Engine, Executive Summary, Company Health, Alert Engine,
  Notification Center, Executive Timeline/Activity Feed, Search Foundation, Widget Framework,
  Dashboard Framework.
- **Stage 2 — Executive Intelligence**: Executive Brief Engine, Trend Engine, Comparison Engine,
  per-area Enterprise Health, Decision Queue, Risk Engine (rule-based, no AI/prediction), Drill Down,
  Explainability.
- **Stage 3 — Enterprise Control Center**: Approval Center, Enterprise Monitoring, Exception Center,
  Enterprise Activity Supervision, Notification Rules/escalation.
- **Stage 4 — Founder Workspace**: Saved Views, Dashboard Layouts, Pinned Widgets, Saved Filters,
  Executive Report Workspace with deterministic Report Generation, Scheduling-preference foundation
  (configuration only, no execution), Workspace Preferences, ownership-scoped Search integration.
- **Stage 5 — Founder OS Completion and Hardening**: architecture/dependency/security/performance
  review with confirmed fixes (see `PART_3D_FOUNDER_OS_REFERENCE.md` §6–§8).
- **Independent Audit + bounded repair**: F1 (`setWidgetPreference` widget-authorization gap), F2
  (`db push` vs. `migrate deploy` partial-unique-index disclosure), F4 (stale Stage 1 test count) —
  all three repaired and re-confirmed intact in this governance pass (§9 below). F3, F5, F6, F7, F8
  remain non-blocking per the Independent Audit's own classification; no repository evidence in this
  pass showed otherwise.

## 3. Architecture baseline

Verified-acyclic layering: `domain.ts`/`context.ts` (vocabulary, principal) → `schemas.ts` (Zod) →
internal store helpers (`alert-store.ts`, `approval-store.ts`, `job-store.ts`, `widget-catalogue.ts`
— no principal check of their own, callers already checked) → services (each independently calls
`requireFounderOsPrincipal`) → composition services (`dashboard-service.ts`,
`executive-summary-service.ts`, `brief-engine.ts`) → `actions/founder-os.ts` (thin
`toErrorResponse`-wrapped Server Actions, zero business logic). No Founder OS file writes to any
`finance_*` table — reconfirmed by direct repository search in this pass (zero matches).

## 4. Authoritative services

All 32 files under `lib/founder-os/*.ts`, reusing the frozen Phase 15 `lib/analytics.ts` BI layer and
the frozen Part 3C Finance reporting Business Services throughout — no duplicate KPI, approval,
monitoring, exception, or report-generation logic exists (confirmed structurally by the verifier and
manually during the Stage 5 review; the one accidental *re-invocation* found, a triple KPI-Engine
fetch per dashboard load, was fixed and is now guarded by a structural regression check).

## 5. Data models and migrations

Eight Founder OS tables: `FounderAlert`, `FounderNotification`, `FounderWidgetDefinition`,
`FounderWidgetPreference` (Stage 1) plus `FounderSavedView`, `FounderDashboardLayout`,
`FounderSavedReport`, `FounderWorkspacePreference` (Stage 4). Two migrations:
`20260728100000_enterprise_phase2_part3d_founder_os_stage1` and
`20260801090000_enterprise_phase2_part3d_founder_os_stage4` — both additive, both re-confirmed this
pass to touch zero `finance_*` tables. Three hand-added partial unique indexes enforce "at most one
default/active" invariants at the database level for Saved Views and Dashboard Layouts — **disclosed
in this freeze (finding F2, repaired)**: these exist only in migration SQL, not in `schema.prisma`
(Prisma has no partial-index schema syntax), so they are created by `migrate deploy`/`migrate dev`
but **not** by `prisma db push`. Production always uses `migrate deploy` per `CLAUDE.md`; a dev
database built via `db push` alone would not have this specific database-level backstop, though
application-level Serializable-transaction sequencing still applies.

## 6. Permissions

13 `founder_os.*` permissions (9 pre-provisioned ahead of Founder OS's own build, 3 added in Stage 1,
1 — `founder_os.workspace.manage` — added in Stage 4). Confirmed present via the verifier's own
named-list checks (deliberately not a bare total count, after two earlier instances in this
engagement of a bare count going stale the moment a later stage legitimately added a key).

## 7. Security and isolation model

Every entry point requires `requireFounderOsPrincipal`. `isFounder` bypasses the *permission* check
only, never the `ENTERPRISE_FOUNDER_OS_ENABLED` feature-flag check, and never the *ownership* scope
Stage 4 introduced — verified structurally (no owner-scoped service file references
`principal.isFounder`) and behaviorally (two distinct Founder-role accounts proven isolated from each
other's saved views/layouts/reports/preferences). **Finding F1, repaired and reconfirmed this
pass**: `setWidgetPreference` now calls `assertWidgetCodesAuthorized` (matching `pinWidget`'s
existing check), while the pre-existing `NotFoundError` behavior for a nonexistent widget code is
unchanged (confirmed by the pre-existing test for that exact case still passing).

## 8. Tests and validation counts

63 Founder OS tests across four stage files (Stage 1: 17, Stage 2: 15, Stage 3: 8, Stage 4: 23),
**re-run live in this governance pass: 63/63 passed.** Full project regression suite: 336 tests
total; at the moment of this freeze decision, 324 passed and 12 skipped in one unrelated Part 3C test
file due to the (now separately remediated — see
`docs/enterprise-phase2/FISCAL_YEAR_TEST_POOL_REMEDIATION.md`) fiscal-year test-pool exhaustion; 0
Founder OS tests failed or were skipped at any point. `npx tsc --noEmit` clean. `npm run build` clean.

## 9. Verifier results

`scripts/verify-enterprise-phase2-part3d.cjs`: **127/127 checks passed**, re-run live in this
governance pass, including the structural regression guards added during Stage 5/the bounded repair
for every fix made (shared-store reuse, ownership scoping, the KPI-Engine triple-fetch fix, the
Monitoring/Decision Queue transaction-batching fix, `createNotification`'s wiring, and the F1 widget-
authorization fix).

## 10. Known non-blocking limitations

Carried forward unchanged from the Independent Audit and Stage 5 (repository evidence in this pass
did not contradict any of these):

- No authoritative Profit calculation exists anywhere in this codebase — structurally excluded from
  `SUPPORTED_REPORT_METRICS`, not merely rejected by a special case.
- No scheduler exists — Report Scheduling (Stage 4) and Enterprise Monitoring's "Scheduled Tasks"
  (Stage 3) are both honestly disclosed as preferences/unsupported, never claimed functional.
- No file export exists — `outputPreference` describes rendering intent only.
- Stage 4 workspace mutations (saved views, layouts, reports, preferences, pins) are not yet wired to
  `SalesAuditLog` — disclosed, deferred, not silently omitted.
- Workspace Preferences are stored and validated but not yet consulted by Stage 1–3 services as
  actual defaults.
- Approval Center and Exception Center's independent-transaction-per-read pattern was not batched
  the way Monitoring/Decision Queue's was — explicitly reviewed and deferred, not missed.
- F3 (`FounderAlert` dedup relies on Serializable-transaction conflict detection rather than an
  explicit unique constraint), F5 (a documentation-precision note on the Approval/Exception Center
  deferral), F6 (some verifier checks use loose whole-file regex matches rather than call-site-scoped
  ones), F7 (`reorderPinnedWidgets` doesn't apply the same authorization filter `listPinnedWidgets`
  does), F8 (an audit-process note about `prisma format` writing to disk) — all confirmed still
  accurate and non-blocking in this pass; no repository evidence found any of them to have worsened,
  been contradicted, or require escalation.

## 11. Explicitly deferred UI scope

No UI, API route, or presentation layer exists for any Founder OS capability. Confirmed via direct
repository search in this pass and the separate Admin UI audit that preceded this governance pass:
zero references to `founder-os` anywhere under `app/` or `components/`.

> UI integration is authorized as a separate presentation and orchestration layer and must reuse the
> frozen backend without duplicating business logic.

## 12. Change-control policy

Confirmed bug fixes, security fixes, data-integrity fixes, legal/compliance requirements, measured
performance fixes, explicitly authorized versioned upgrades, and UI integration that reuses existing
`lib/founder-os/*`/`actions/founder-os.ts` services without changing frozen business rules. No silent
redesign. No duplicate business logic (in particular: no UI-side reimplementation of KPI, alert,
approval, monitoring, exception, or report-generation calculations — every number must come from
calling the existing service). No schema change without explicit authorization. No permission
weakening. No Founder-role ownership bypass introduced at any layer, including UI.

## 13. Freeze date

This governance verification pass (Enterprise Architecture v3.0 Phase 2 Governance Verification and
Formal Backend Freeze Pass), immediately following the prior Independent Audit and bounded repair of
F1/F2/F4.

## 14. Freeze status

**FORMALLY FREEZE NOW.** Decision: B. Basis: the prior Independent Audit and bounded repair had
already concluded "requires a bounded repair pass before re-audit" (decision C) and that repair was
completed and validated; per the authoritative context for this governance pass, a full re-audit was
not required "unless repository evidence shows the bounded repairs are incomplete or introduced
regressions" — this pass found no such evidence (all three repairs confirmed intact by direct source
inspection, 127/127 verifier, 63/63 Founder OS tests, clean build). Formal freeze authorization is
this document's own declaration.
