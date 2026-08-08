# Enterprise Architecture v3.0 Phase 2 Part 3C — Enterprise Finance Platform

## Wave 1: Finance Foundation

**This document covers Wave 1 of 6 only.** Journal/ledger/posting (Wave 2),
Accounts Receivable (Wave 3), Accounts Payable/Expenses (Wave 4), Banking/
Reporting (Wave 5), and cross-wave Hardening (Wave 6) are not implemented
and are not described as implemented anywhere in this document. No claim of
Part 3C completion, independent verification, or freeze is made here.

## Scope delivered in Wave 1

- **Finance Configuration** — one organization-scoped row: base currency,
  accounting timezone, financial-year start month, nine optional control-
  account references (retained earnings, AR/AP control, input/output tax
  control, default cash/bank, rounding, default expense payable), posting-
  policy version, DRAFT/ACTIVE status, optimistic `version`.
- **Fiscal Years and Fiscal Periods** — a fiscal year is created together
  with its periods in one call (`createFiscalYearWithPeriods`); periods are
  generated as equal date slices covering the year exactly (no gaps, no
  overlaps by construction). Period lifecycle: `OPEN → SOFT_CLOSED ⇄ OPEN`,
  `SOFT_CLOSED/OPEN → HARD_CLOSED → ADJUSTMENT → HARD_CLOSED`. Reopening a
  hard-closed period (the `ADJUSTMENT` transition) requires the seeded
  `FISCAL_PERIOD_REOPEN` Segregation-of-Duties policy and a reason.
- **Cost Centers and Profit Centers** — organization-scoped, self-
  referencing hierarchies, ACTIVE/INACTIVE lifecycle, unique code per
  organization, no self-parenting, no cycles, no cross-organization parent.
- **Chart of Accounts** — organization-scoped `FinanceAccount`: category
  (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), declared normal balance
  (contra accounts are permitted — the caller's declared value is never
  silently overwritten), control-account marker, posting-enabled marker,
  self-referencing hierarchy with `hierarchyLevel`, DRAFT/ACTIVE/INACTIVE
  lifecycle, system-account protection against deactivation, and a
  `validateAccountForPosting` check (active, posting-enabled, and — since a
  summary/parent account can never receive a direct posting — has no
  children) that Wave 2's posting engine will call rather than
  re-implementing the rule.

## What Wave 1 deliberately does not include

No `FinanceJournal`, `FinanceJournalLine`, `FinanceLedgerEntry`, posting
engine, AR/AP/expense/banking domain record, or reporting query exists yet.
`validateAccountForPosting` and the reopen SoD policy are the only places
Wave 1 anticipates Wave 2; neither one posts, allocates, or moves money.

## Repository architecture reused (nothing new introduced)

| Concern | Reused from | Notes |
|---|---|---|
| Organization scoping / trusted principal | `lib/enterprise/context.ts`'s `requireEnterprisePrincipal`, `requireOrganization` | New `lib/enterprise-finance/context.ts` only supplies the Finance-specific feature-flag constants and thin wrappers |
| Feature flags | `AiConfiguration` (`category: "FEATURE_FLAG"`), Part 3A's `PHASE2_FEATURE_FLAGS` | `ENTERPRISE_FINANCE_ENABLED` and `ENTERPRISE_FINANCIAL_POSTING_ENABLED`/`ENTERPRISE_BANKING_RECONCILIATION_ENABLED`/`ENTERPRISE_FINANCIAL_REPORTING_ENABLED` were already reserved by Part 3A, unused until now. One new flag was appended (see Deviations). |
| Permissions | `lib/sales/constants.ts`'s `PERMISSIONS`, `prisma/seed.ts`'s `permissionData` | The 19 `finance.*` permission strings were already seeded by Part 3A (module `enterprise_finance`, already granted to Founder); this wave only adds their typed `PermissionKey` entries |
| Serializable transactions | `lib/enterprise/governance.ts`'s `enterpriseTransaction` | Unchanged |
| Numbering | `lib/enterprise/governance.ts`'s `nextEnterpriseNumber` | Not yet needed — Wave 1 records have no external document number |
| Audit / timeline / notification | `lib/enterprise/governance.ts`'s `recordEnterpriseMutation` | Every mutating Wave 1 call emits it |
| Idempotency / job boundary | `lib/enterprise-phase2/foundation.ts` and `jobs.ts` | Not yet called — Wave 1 has no background job or externally-triggered idempotent operation. Reused unmodified for Wave 2+ |
| Segregation of Duties | `lib/enterprise-phase2/foundation.ts`'s `enforceSegregationOfDuties`, `Phase2SodPolicy` | One new seeded policy: `FISCAL_PERIOD_REOPEN` |
| Source provenance | `lib/enterprise-phase2/foundation.ts`'s `recordSourceReference`, `Phase2SourceReference` | Not yet called — no Wave 1 record has an external source; will be used starting Wave 2 when journals reference their originating documents |
| Optimistic concurrency | `lib/enterprise/context.ts`'s `requireVersion` | Every editable Wave 1 record carries `version` |
| Lifecycle transitions | `lib/enterprise-phase2/foundation.ts`'s `assertLifecycleTransition` | Wrapped as `assertFinanceTransition` in `lib/enterprise-finance/domain.ts` |
| Hierarchy cycle detection | Same breadth-first-ancestor-walk shape as `lib/enterprise-network/partner-service.ts`'s `wouldCreateCycle` | Generalized as `wouldCreateHierarchyCycle` in `lib/enterprise-finance/domain.ts`, reused for cost centers, profit centers, and the chart of accounts |
| Errors | `lib/errors.ts` (`AppError`, `ConflictError`, `NotFoundError`) | Unchanged |

## Deviations from the Production Codex's literal text, and why

- **Feature flags.** Section 5 asked for one flag per capability area
  (Finance Core, AR, AP, Expense Management, Banking, Reporting, AI
  Adapter — 7). Part 3A had already reserved 5 flags with different
  boundaries (`ENTERPRISE_FINANCE_ENABLED` as a single umbrella for
  configuration/COA/GL/journal/AR/AP/expense; separate flags only for
  Posting, Banking Reconciliation, Tax, and Reporting). Per "Part 3A... is
  authoritative and frozen," Wave 1 reuses the 5 existing flags rather than
  fragmenting `ENTERPRISE_FINANCE_ENABLED` into new AR/AP/Expense flags.
  Exactly one new flag was appended —
  `ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED` — since no existing flag covers
  Section 36's advisory AI extension point. This is additive to
  `PHASE2_FEATURE_FLAGS` (9 → 10 entries); the pre-existing
  `__tests__/enterprise-phase2/foundations.test.ts` assertion pinned to
  exactly 9 was updated to 10, since the count changing is the intended,
  disclosed effect of a legitimate additive change, not a regression.
- **Permissions.** Section 6 asked for a much more granular permission set
  (separate keys per lifecycle step — draft/submit/approve/reject/post/
  reverse — for each domain, on the order of 80+ keys). The 19 `finance.*`
  keys Part 3A had already seeded are coarser (e.g. `finance.journals.
  prepare/approve/post`, not one key per state transition). Given Part 3A's
  own permissions are frozen and already granted to Founder, Wave 1 reuses
  those 19 keys as-is rather than inventing dozens of new, unseeded
  permission strings; finer-grained control within a coarse permission
  (e.g. who may create a draft vs. submit it) is enforced through explicit
  lifecycle-transition checks and Segregation-of-Duties policies, not
  through additional permission keys. No new role beyond Founder was
  granted any `finance.*` permission this wave — matching Part 3A's own
  "current operational and sales roles retain their prior grants," since
  granting AR/AP/banking-shaped permissions to a role before those domains
  exist would misrepresent what that role can actually do.
- **Fiscal period non-overlap.** Section 8 asked for "database constraints
  or triggers where appropriate" to prevent overlap. Overlap is checked at
  the Business Service layer inside a serializable transaction — the same
  precedent already established by `assignPartnerParent` in
  `lib/enterprise-network/partner-service.ts` for `NetworkPartnerHierarchy`
  overlap — rather than a Postgres exclusion constraint (`EXCLUDE USING
  gist`), since no other table in this schema uses `btree_gist` and this
  would be new infrastructure for one table. Non-overlap *within* a
  generated fiscal year's own periods is guaranteed by construction (each
  period's end date is the next period's start date, computed once, in one
  transaction).

## Files

**New:**
- `lib/enterprise-finance/context.ts` — Finance principal/feature-flag helpers
- `lib/enterprise-finance/domain.ts` — categories, transition graphs, cycle detection, posting-eligibility check
- `lib/enterprise-finance/schemas.ts` — Zod input validation
- `lib/enterprise-finance/configuration-service.ts` — Finance Configuration Business Service
- `lib/enterprise-finance/period-service.ts` — Fiscal Year/Period Business Service
- `lib/enterprise-finance/dimension-service.ts` — Cost Center/Profit Center Business Service
- `lib/enterprise-finance/chart-of-accounts-service.ts` — Chart of Accounts Business Service
- `prisma/migrations/20260727140000_enterprise_phase2_part3c_wave1_finance_foundation/migration.sql`
- `__tests__/enterprise-finance/wave1-foundation.integration.test.ts` — real-database integration tests

**Modified (additive only):**
- `prisma/schema.prisma` — six new models (`FinanceConfiguration`, `FinanceFiscalYear`, `FinanceFiscalPeriod`, `FinanceCostCenter`, `FinanceProfitCenter`, `FinanceAccount`); no existing model touched
- `lib/sales/constants.ts` — 19 `FINANCE_*` entries added to `PERMISSIONS`; nothing removed or renamed
- `lib/enterprise-phase2/foundation.ts` — one flag appended to `PHASE2_FEATURE_FLAGS`
- `prisma/seed.ts` — one new feature-flag seed row, one new `Phase2SodPolicy` seed row; both idempotent upserts
- `__tests__/enterprise-phase2/foundations.test.ts` — updated pinned flag count (9 → 10), see Deviations

## Database integrity (Section 31)

Beyond Prisma-level foreign keys, the migration adds, hand-written (not
Prisma-generated):
- `finance_*_createdById`/`updatedById`/`closedById`/`reopenedById` foreign
  keys to `users(id)` — same convention as Phase 1's `enterprise_vendors_
  createdById_fkey` and siblings.
- A trigger function (`finance_assert_same_organization_parent`) plus one
  `BEFORE INSERT OR UPDATE` trigger per hierarchy table (cost centers,
  profit centers, chart of accounts) rejecting a parent from a different
  `organizationKey` at the database level, not just in the Business
  Service.
- `CHECK ("parentId" IS NULL OR "parentId" <> "id")` on all three hierarchy
  tables, rejecting immediate self-parenting at the database level.
  Multi-level cycles are rejected at the Business Service layer
  (`wouldCreateHierarchyCycle`), matching the existing
  `NetworkPartnerHierarchy` precedent.
- `CHECK ("endDate" > "startDate")` on fiscal years and fiscal periods.

No immutability trigger (reject UPDATE/DELETE) was added this wave. Every
Wave 1 model has a legitimate, ongoing lifecycle (draft/active/inactive,
open/closed/reopened) — nothing in Wave 1 becomes historically immutable
the way a posted journal or finalized reconciliation will in later waves.

## Migrations

`20260727140000_enterprise_phase2_part3c_wave1_finance_foundation` —
generated by diffing the live database against the updated schema
(`prisma migrate diff --from-schema-datasource ... --to-schema-datamodel
...`), reviewed, then hand-extended with the User foreign keys, organization
guard triggers, and check constraints described above before being applied
with `prisma migrate deploy`. Contains no `DROP`, no destructive `ALTER`, no
rewrite of any prior migration.

## Seeds

Idempotent upserts only: one new `AiConfiguration` feature-flag row
(`ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED`, disabled), one new
`Phase2SodPolicy` row (`FISCAL_PERIOD_REOPEN`). No Finance Configuration,
fiscal year, cost/profit center, or chart-of-accounts row is seeded — Section
33's "seed only minimum deterministic reference/configuration data" is read
here as: none of Wave 1's actual Finance master data is universal enough to
seed safely (base currency and fiscal calendar are organization decisions),
so none is seeded speculatively.

## Testing

`__tests__/enterprise-finance/wave1-foundation.integration.test.ts` runs
against the real, live database (no mocked Prisma), following the same
pattern as `__tests__/enterprise-phase2/foundations.integration.test.ts`:
17 tests covering feature-flag enforcement (disabled → rejected, enabled →
allowed), permission enforcement (non-Founder without any `finance.*`
permission is rejected; Founder is allowed), organization isolation
(`requireOrganization` rejects a non-`MUV` key), optimistic concurrency
(stale version rejected on both a direct helper call and a real reparent
call), Finance Configuration's draft→active lifecycle, chart-of-accounts
hierarchy-cycle rejection, invalid-parent rejection, summary-account
posting rejection, draft/inactive-account posting rejection, fiscal-year
overlap rejection, twelve-period generation with no gaps and no overlaps,
an invalid period lifecycle transition, Segregation-of-Duties enforcement
on period reopen, and the reopen reason requirement. All auth is mocked
locally in this file via `vi.mock("@/lib/auth", ...)` (the same pattern
`__tests__/muv-ai/diagnostics.test.ts` already established) rather than
constructing a principal object directly, so the tests exercise the real
`getSalesPrincipal → requireEnterprisePrincipal → requireFinancePrincipal`
chain end to end, not just the Business Service below it.

Test rows are cleaned up in `afterAll` by a per-run unique code prefix; the
feature flags this test toggles are restored to their pre-test values
(not hardcoded to a fixed end state), since the live dev database's flag
state before this test run was not assumed.

## Known limitations

- No journal, ledger, posting engine, AR, AP, expense, or banking domain
  record exists. Nothing in this document should be read as implying any
  of those exist.
- `FinanceAccount.normalBalance` is not validated against
  `CONVENTIONAL_NORMAL_BALANCE` — a caller can create a nonsensical
  combination (e.g. a REVENUE account with DEBIT normal balance) without
  rejection. This was a deliberate choice to permit legitimate contra
  accounts, but it also means no guard exists yet against a genuine data-
  entry mistake; Wave 2's posting engine, or a Wave 6 hardening pass, should
  decide whether to add a warning-level check.
- Fiscal-period generation divides the fiscal year into perfectly equal
  slices; it does not yet support calendar-month-aligned periods (e.g. a
  period boundary landing mid-day because the fiscal year's total span
  isn't evenly divisible by the period count). Real calendar-month periods
  are expected to be added when Wave 2 or a hardening pass needs them.
- `financeConfiguration.status` "ACTIVE" is not yet enforced anywhere
  (nothing yet reads whether the configuration is DRAFT or ACTIVE to decide
  whether to allow posting) — enforcing that is Wave 2's responsibility
  once there is something to post.
- **No Server Action or API route exists yet.** Wave 1 delivers
  `lib/enterprise-finance/*` Business Services only, called directly by the
  integration test; nothing under `actions/` or `app/api/` wires them up,
  so none of this code is reachable from an actual request yet. This
  matches the Codex's own Wave 1 scope line ("permissions, feature flags,
  finance configuration, fiscal years and periods, cost centers, profit
  centers, chart of accounts, migrations, seeds") — it does not list an
  API/UI layer — but is flagged explicitly rather than left implicit.
- `listFiscalPeriods`, `listCostCenters`, `listProfitCenters`, and
  `listAccountDescendants`/`listAccountAncestors` are not paginated
  (`pageInput` is defined in `lib/enterprise-finance/schemas.ts` but not
  yet wired into any of them). Realistic cardinality for Wave 1 data
  (periods per fiscal year, cost/profit centers, account hierarchy depth)
  stays small by nature, but this should be revisited if a real Server
  Action layer is added before Wave 5's dedicated reporting/export
  services replace ad hoc listing. `exportChartOfAccounts` was given an
  explicit `take: 5000` cap during self-challenge (Section 39) since it is
  the one function here actually named as an export.
- `requireFinancialPostingPrincipal`, `requireBankingPrincipal`, and
  `requireFinancialReportingPrincipal` (in `lib/enterprise-finance/
  context.ts`) are exported but not called by any Wave 1 service —
  deliberately forward-declared for the waves that need them (Wave 2, 5,
  5 respectively), not dead code left over from a removed feature. Twelve
  of the nineteen typed `FINANCE_*` permission keys (journals, receivables,
  payables, payments, expenses, banking, tax) are similarly unused by any
  Wave 1 service for the same reason — the underlying permission strings
  were already seeded by Part 3A for exactly this purpose.

## Verification commands run

```text
npx prisma format
npx prisma validate
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
npx tsc --noEmit
npx vitest run
npm run build
node scripts/verify-enterprise-phase1.cjs
node scripts/verify-enterprise-phase2-part3a.cjs
node scripts/verify-enterprise-phase2-part3b.cjs
node scripts/verify-enterprise-phase2-part3b-db.cjs
node scripts/verify-sales-architecture.cjs
```

All passed. Exact results are in the Part 3C Wave 1 implementation report.

## Next

Wave 2 (Accounting Core: journal models, journal lifecycle, posting
policy, posting engine, general ledger, immutability, idempotency, runtime
tests) is not started. This document will be superseded or extended, not
silently replaced, when Wave 2 begins.
