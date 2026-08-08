# Enterprise Architecture v3.0 Phase 2 Part 3D — Founder Operating System, Stage 2

**Status: Stage 2 implemented and tested. Not frozen — no claim of
independent verification or freeze is made anywhere in this document.**
Builds directly on `PART_3D_FOUNDER_OS_STAGE1.md` (read that first — this
document assumes it). Stage 3+ is explicitly out of scope and not started;
per the governing instruction for this Part, work stops at the end of
each stage and waits for explicit authorization before continuing.

## Objective

Turn enterprise data into executive intelligence. **No AI. No
prediction. Deterministic analysis only.** Every number and every "risk"
signal in this Stage is a fixed, documented business rule applied to a
real calculation — never a trained model, never a forecast.

## What's genuinely new vs. reused

Stage 2 introduces **zero new Prisma models**. Every one of its nine
deliverables is either a pure composition of Stage 1 services and the
frozen Phase 15/Part 3C functions Stage 1 already reused, or — where
persistence is genuinely needed (Risk Engine detections) — writes into
the **same** `FounderAlert` table Stage 1's Alert Engine already owns,
through the same dedupe rule, not a parallel table.

- **Executive Brief Engine** (`brief-engine.ts`) — Daily/Weekly/Monthly
  briefs are the same composition (Executive Summary + the matching named
  Comparison + recent Executive Timeline) at three time horizons. Business
  Highlights is the Executive Timeline's own already-curated allowlist,
  relabeled. Critical Actions is the Decision Queue's own items filtered
  to CRITICAL severity plus every pending approval.
- **Enterprise KPI Intelligence** — no new file. Every KPI Stage 2's
  objective lists (Revenue, Collections, Expenses, Orders, Customers,
  Growth, Cash Position, Outstanding) was already covered by Stage 1's
  `kpi-engine.ts`. "Profit" is the one KPI genuinely absent from both
  Stage 1 and this Stage — see "Known limitations."
- **Trend Engine** (`trend-engine.ts`) — Daily/Weekly/Monthly/Quarterly/
  Yearly/Custom granularity, all bucketed re-aggregations in application
  code of the **same single real daily series** —
  `lib/analytics.ts`'s `getRevenueTrend(range)` (frozen Phase 15, called
  unmodified). One real query per call; the rest is grouping.
- **Comparison Engine** (`comparison-engine.ts`) — Today vs Yesterday,
  Week vs Week, Month vs Month, Quarter vs Quarter, Year vs Year are five
  named ranges fed into `lib/analytics.ts`'s existing
  `getGrowthComparison(range)` (frozen Phase 15, called unmodified,
  already generic over "any range vs. the immediately preceding
  equal-length range" — exactly the semantics every one of these five
  names needs).
- **Enterprise Health** — Stage 1's `company-health-service.ts` was
  **extended, not duplicated**: its existing four signals were tagged
  with a named area (`REVENUE`, `FINANCE`, `SALES`, `CUSTOMER`,
  `COLLECTION`), two new signals were added (expense approval backlog
  under Finance, aged-receivables ratio under Collection, and a Sales
  Health signal from the KPI Engine's existing pipeline data), and a
  per-area rollup plus the pre-existing overall rollup are both returned.
  Same file, same function signature callers already use
  (`getCompanyHealth()`), richer output.
- **Decision Queue** (`decision-queue-service.ts`) — every section is a
  direct, bounded, read-only query or a real Finance function's own
  output re-filtered (never a write): pending vendor payments (`FinanceVendorPayment`
  status `REQUESTED`), high-value receivables (`getReceivablesAging`'s
  own rows, filtered by amount rather than by days-overdue — deliberately
  broader than the Alert Engine's `LARGE_OVERDUE_RECEIVABLE`, which
  requires both), critical expenses (`FinanceExpenseClaim` status
  `SUBMITTED` above a threshold), Finance/Enterprise Exceptions (`FounderAlert`
  rows, filtered by `sourceModule`).
- **Risk Engine** (`risk-engine.ts`) — five rule-based detectors, every
  one a fixed percentage threshold (`domain.ts`'s `ALERT_THRESHOLDS`)
  applied to a real, already-computed comparison: Revenue Drop
  (`getGrowthComparison`), Expense Spike (a new, narrowly-scoped
  month-vs-month `FinanceExpenseClaim` aggregate — no equivalent Business
  Service exists to call instead), Collection Delay (average days-overdue
  across `getReceivablesAging`'s own rows), Customer Decline
  (`getCustomerGrowth` plus a direct new-customer count comparison), and
  Business Anomaly (a genuine composite — fires only when 2+ of the other
  four are active together, not a fifth independent threshold). Writes
  through the **same** `upsertAlert` dedupe-then-create function Stage
  1's Alert Engine uses — factored out into a new shared module,
  `alert-store.ts`, specifically so Stage 2 would not duplicate that
  logic (see "Errors found and fixed").
- **Drill Down** (`drilldown-service.ts`) — Enterprise → Business Area →
  Record → Transaction. Business Area is a static list (Receivables,
  Payables). Record reuses `listReceivableInvoices`/`listVendorBills`
  (frozen Part 3C, already paginated). Transaction reuses `getSourceLedger`
  (frozen Part 3C, bounded during the independent-audit repair pass) —
  nothing queries `FinanceLedgerEntry` a second way.
- **Explainability** (`explainability-service.ts`) — a static, hand-written
  registry (source file/function, plain-language calculation, real
  dependencies, contributing systems) for every metric Founder OS
  surfaces. Honest about being static: this Stage does not attempt to
  dynamically trace a number back to its inputs at runtime.

## Errors found and fixed during this Stage (self-challenge, not hidden)

1. **A near-duplication of alert creation logic, caught before it
   shipped.** The Risk Engine's first draft was going to reimplement the
   dedupe-then-create logic Stage 1's Alert Engine already had (as a
   private, unexported function). Recognized while planning
   `risk-engine.ts` — Stage 2's own "never duplicate logic" instruction
   applies to Stage 2's own code, not only to Part 3C. Fixed by factoring
   the existing `upsertAlert` out of `alert-engine.ts` into a new shared
   module, `alert-store.ts`, that both `alert-engine.ts` and
   `risk-engine.ts` import — one implementation, two callers, verified
   structurally by the updated Part 3D verifier (`RESULT` section "Stage
   2 — Executive Intelligence checks").

## Security, organization isolation, SoD — unchanged from Stage 1

Every Stage 2 function requires `requireFounderOsPrincipal` (verified
structurally). No Stage 2 file writes directly into any `finance_*`
table (verified structurally — same check as Stage 1, re-run against the
new files). No new SoD-governed operation is introduced: acknowledging a
risk-derived alert goes through the exact same `acknowledgeAlert`/
`resolveAlert` Stage 1 already built (Risk Engine alerts are ordinary
`FounderAlert` rows, indistinguishable in the lifecycle API from
exception-detector alerts). No Founder bypass beyond the one Stage 1
already established and documented (`isFounder` bypasses the permission
check only, never the feature-flag check).

## Testing

One real-database integration test file, no mocked Prisma:
`__tests__/founder-os/stage2.integration.test.ts` — 15 tests covering
access control (both the general `founder_os.access` gate and the
stricter `founder_os.alerts.manage` gate for Risk detection), every Trend
granularity plus a custom range, all five named Comparisons, the
per-area Enterprise Health rollup (including asserting the overall status
is genuinely the worst area, not an independent number), every Decision
Queue section, Risk Engine detection idempotency, the full Drill Down
chain (Business Area → Record → Transaction, verified against a real
posted invoice when one exists), Explainability (a known metric, an
unknown metric returning `null` rather than throwing, and the full
registry listing), and all three Briefs plus Highlights and Critical
Actions.

## Known limitations

- **"Profit" is not implemented.** Stage 2's own KPI list names it, but
  no existing function (Phase 15's `lib/analytics.ts` or Part 3C's
  Finance Platform) computes a real profit figure — that would need
  either a full P&L from the General Ledger (Part 3C has Trial
  Balance/period activity but no P&L statement function) or a
  revenue-minus-costs calculation this schema doesn't have enough cost
  data to support honestly (no COGS tracking). Rather than fabricate a
  number, this is disclosed as not implemented instead of quietly
  approximated.
- Risk Engine thresholds (`ALERT_THRESHOLDS` in `domain.ts`) are fixed
  constants, same as Stage 1's exception thresholds — not yet
  configurable per organization.
- Trend Engine's granularities beyond daily are bucketed in application
  code from a daily series, not a native database-level weekly/monthly
  aggregation — fine at today's data volume (matching `lib/analytics.ts`'s
  own documented "catalog/boutique scale" assumption), worth revisiting
  if order volume grows enough for this to matter.
- Explainability's registry is static and hand-maintained — adding a new
  Founder OS metric requires a corresponding registry entry; nothing
  enforces that today.
- Drill Down currently covers only Receivables and Payables as Business
  Areas — Expenses, Banking, and non-Finance areas (Orders, Customers)
  are not yet wired in.

## Verification commands run for this Stage

```text
npx tsc --noEmit --pretty false
npx vitest run   (focused: __tests__/founder-os, then full suite)
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

Stage 3 (Enterprise Control Center) is not started and was not begun,
per the explicit "complete one stage, stop, wait for authorization"
instruction governing this Part.
