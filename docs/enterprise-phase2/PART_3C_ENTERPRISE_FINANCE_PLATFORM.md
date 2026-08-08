# Enterprise Architecture v3.0 Phase 2 Part 3C — Enterprise Finance Platform

## FORMALLY FROZEN

**This Part is formally frozen as of this governance action.** Freeze
covers everything listed below, exactly as it stood after the final
independent re-audit: Finance Configuration, Chart of Accounts, Fiscal
Years, Fiscal Periods, Cost Centers, Profit Centers, the Journal Engine,
the Posting Engine, General Ledger, Trial Balance, Accounts Receivable,
Accounts Payable, Expense Management, Banking Foundation, Bank
Reconciliation, the reporting services implemented in this Part
(customer/vendor statements, period activity summary), the two background
jobs, Finance permissions, feature flags, SoD policies, idempotency,
organization isolation, the immutable-accounting-evidence triggers,
database integrity constraints, every migration listed below, every test
file listed below, both verifier scripts, and this document itself.

**Freeze means**: no silent redesign, no silent schema changes, no
editing a frozen migration file. Any future change to anything in this
list goes through governed change control as a new, additive Part —
exactly the same discipline this Part itself followed against Parts 1,
3A, and 3B throughout its own development. Future Finance work (Founder
OS or otherwise) must call these Business Services as they exist today;
it must not reimplement, duplicate, or bypass any of them, and must never
write directly into any `finance_*` table.

**Basis for freeze**: a final independent read-only re-audit verified,
directly against the repository and a live database — not against any
prior report's prose — that all 6 findings from the preceding independent
audit were genuinely closed at the code, migration, live-database, and
test level, that the repair pass introduced no regressions across a full
architecture re-sweep, and that no Critical, High, or unresolved Medium
defect (production-code, accounting-integrity, security, migration, or
database-integrity) remained. Full verdict text: "PART 3C IS
INDEPENDENTLY VERIFIED AND TECHNICALLY READY FOR FREEZE WITH THE
DOCUMENTED NON-BLOCKING LIMITATIONS. FORMAL FREEZE AUTHORIZATION REMAINS
A SEPARATE GOVERNANCE DECISION." — that separate governance decision is
this document's own freeze declaration above.

**Non-blocking limitations carried forward from that re-audit, verbatim
in substance** (frozen status does not retroactively resolve these; they
remain accurate as of freeze and are not blockers):
- **Fiscal-year test pool proximity to exhaustion** (test-infrastructure
  only, zero production impact — classified **B: non-blocking
  test-infrastructure defect requiring the next repair**, not a freeze
  blocker). At the final re-audit's last live check the shared pool's
  highest used year was **9888** against Prisma's real year-9999
  serialization ceiling, roughly **111 years** of headroom and shrinking
  at approximately 6 years per full local test-suite run. The proposed
  structural remediation (per-test-file transactional rollback, or an
  isolated/disposable test database, in preference to widening the
  random range further) is recorded in that audit's report and should be
  the next piece of Finance-adjacent work taken up, ahead of any further
  heavy local iteration against these test files.
- **Benign synthetic-data `journalType` mismatch** — a small, fully
  understood, non-growing-in-a-concerning-way set of test-only
  `FinanceLedgerEntry` rows (four labeled
  `AR_INVOICE_AUDIT_REPAIR_COMPENSATION` from the audit-repair pass's own
  historical-data correction, plus four more added by every successful
  run of the Part 3C `>5000-row` aggregation test) whose `journalType`
  does not match their owning journal's real type. Confirmed
  independently to be dev-database-only test residue, not reachable
  through any real code path — `posting-engine.ts` is the only writer of
  production ledger entries and is provably type-consistent. Cosmetic
  only; not a defect in frozen production code.
- All previously-disclosed deferred scope remains deferred and out of
  freeze: credit notes, write-offs, discount posting, statutory tax
  reporting, an actual scheduler/cron trigger for the two background
  jobs, and any Server Action/API route exposing these Business Services
  to the UI. None of this was ever claimed complete, and freezing the
  implemented baseline does not retroactively claim it either — it freezes
  what exists, not what was deferred.

This document retains its full implementation history below unedited —
freezing a baseline means stopping silent changes to it, not rewriting
its own record of how it got here.

### Freeze reconfirmation — Phase 2 Governance Verification pass

Re-verified live, repository-first, as part of a governance pass covering
Parts 3A–3D together (not a Part 3C-specific re-audit — none was
required, since no repository evidence suggested the frozen baseline had
drifted). Confirmed unchanged: `scripts/verify-enterprise-phase2-part3c.cjs`
still passes **73/73**; no later Part (3D included) writes to any
`finance_*` table (confirmed by direct repository search — zero matches
for a Founder OS or any other later file mutating a Finance table); `npx
tsc --noEmit` and `npm run build` both clean.

**One disclosed limitation has now materialized as predicted, confirmed
live in this pass — test-infrastructure only, not a change to this
freeze:** the fiscal-year test pool's headroom (documented above at
~9,888/~111 years remaining as of the original re-audit) is now
genuinely exhausted — the live pool's highest used year is **9997**
(362 fiscal years consumed from the shared pool), and
`__tests__/enterprise-finance/stageB-accounts-payable.integration.test.ts`
now fails its own `beforeAll` (`pickUnusedFiscalYear`'s deliberate guard
throwing `"Finance fiscal-year test pool exhausted"` rather than
silently wrapping past year 9999) — the exact, intended failure mode
this test's own author built for this exact eventuality, not a new or
surprise defect. All 12 tests in that one file did not run as a result;
every other Part 3C test file and the verifier's own live
database-rejection checks are unaffected and still pass. This remains
**classification B: non-blocking test-infrastructure defect**, now with
higher priority than "the next piece of Finance-adjacent work" (its
original framing) — it now actively blocks that one test file on every
run until remediated. Remediation (per-test-file transactional rollback,
or an isolated/disposable test database) is authorized as a bounded,
test-infrastructure-only repair under this document's own change-control
policy below; it does not touch frozen production code and does not
require reopening this freeze.

**Remediated.** An isolated test database (`muv_test`) now hosts every
automated test run, schema-replicated from the dev database via
`pg_dump`/`psql` (not `prisma migrate deploy`, which cannot rebuild this
project's schema from empty — the migration history predates a base
schema that was never itself captured as a migration; and not `prisma db
push`, which would silently omit every hand-written trigger/index that
exists only in migration SQL, including this Part's own immutability
triggers). `stageB-accounts-payable.integration.test.ts` now passes
12/12; the fiscal-year pool reason for any skip is fully resolved. No
frozen file's logic changed — `pickUnusedFiscalYear()` is byte-for-byte
unchanged in every Finance test file. Full remediation record:
`docs/enterprise-phase2/FISCAL_YEAR_TEST_POOL_REMEDIATION.md`.

Every piece of this platform sits on Part 3A's frozen shared foundation —
organization scoping (`lib/enterprise/context.ts`), feature flags
(`AiConfiguration`), the typed permission registry (`lib/sales/
constants.ts`), serializable transactions and audit/timeline/notification
(`lib/enterprise/governance.ts`), idempotency and the job boundary
(`lib/enterprise-phase2/foundation.ts` / `jobs.ts`), and Segregation of
Duties (`enforceSegregationOfDuties`). AR reuses the existing `Customer`
model directly; AP reuses the existing Phase 1 `EnterpriseVendor` model
directly. Neither introduces a duplicate identity.

## Money handling

Every amount column is `Decimal(18,2)` (16 integer digits, 2 fractional —
matching `NetworkPartnerOrderSource.attributedAmount`, the most recent
precedent in this schema before this Part). All arithmetic uses
`Prisma.Decimal`'s own methods (`.plus`, `.minus`, `.times`, `.equals`,
`.greaterThan`) throughout `lib/enterprise-finance/*` — nothing is ever
coerced to a JavaScript `number` for an authoritative comparison or
aggregation. Rounding is not automatic: `assertJournalBalances` requires
exact equality, and there is no rounding-account logic yet (Section 6's
"do not create automatic rounding lines unless explicitly authorized and
tested" — none is; a rounding account field exists on
`FinanceConfiguration` but nothing currently posts to it).

## Document numbering semantics

Every journal/invoice/bill/payment/receipt/claim number is generated by
`nextEnterpriseNumber` (`lib/enterprise/governance.ts`), reused unchanged
from Part 3A. Precise semantics, written down explicitly here because the
format alone (`JRN-2026-000042`) can otherwise read as implying something
it doesn't:

- **The counter is scoped by `(organizationKey, documentType)`** — e.g.
  `FINANCE_JOURNAL`, `AR_INVOICE`, `AR_RECEIPT`, `AP_BILL`, `AP_PAYMENT`,
  `EXPENSE_CLAIM` each have their own independent counter, sharing nothing
  with each other.
- **The counter never resets by fiscal year, calendar year, or any other
  period.** It is a single lifetime-monotonic integer per
  `(organizationKey, documentType)`, starting at 1 and incrementing
  forever.
- **The year embedded in the formatted string is the real calendar year at
  the moment the number was generated** (`new Date().getUTCFullYear()`),
  not the document's posting date, fiscal year, or fiscal period. Two
  journals posted into the same fiscal year, generated months apart in
  real time spanning a calendar-year boundary, will show two different
  embedded years despite belonging to the same fiscal year. `JRN-2026-000042`
  means "the 42nd `FINANCE_JOURNAL` number ever issued for this
  organization, issued in real calendar year 2026" — it does not mean "the
  42nd journal of fiscal 2026," and the embedded year must never be parsed
  as proof of which fiscal year or period a document belongs to (use the
  document's own `fiscalYearId`/`fiscalPeriodId`/`postingDate` columns for
  that).
- **Concurrency**: the counter increment is a single atomic Postgres
  `UPSERT ... ON CONFLICT DO UPDATE ... increment`, not a read-then-write
  count. Two concurrent requests generating a number for the same
  `(organizationKey, documentType)` cannot receive the same number — under
  this codebase's SERIALIZABLE, no-retry transaction policy
  (`enterpriseTransaction`), a genuine concurrent collision causes the
  losing transaction to fail outright with a serialization error rather
  than silently issuing a duplicate. There is no retry at this layer; a
  caller that needs to survive contention must retry its own top-level
  call with a fresh idempotency key.
- **Retry/idempotency**: number generation itself is not separately
  idempotent — it always issues the next integer. Safety against duplicate
  *documents* (not duplicate numbers) comes from the surrounding
  `Phase2Operation` idempotency claim (`claimOperation`), which is what
  actually prevents a retried `postJournal`/`createAndIssueReceivableInvoice`/etc.
  call from creating a second document and consuming a second number for
  what the caller considers "the same" request.

## Tax compliance feature flag — intentionally reserved, not yet wired

`ENTERPRISE_TAX_COMPLIANCE_ENABLED` is registered in `PHASE2_FEATURE_FLAGS`
(`lib/enterprise-phase2/foundation.ts`) and seeded disabled
(`prisma/seed.ts`), but **no code under `lib/enterprise-finance/` reads or
gates on it** — confirmed by grep, zero references outside its own
registration/seed lines. This is intentional, not an oversight: statutory
tax reporting is explicitly deferred scope for this Part (see "Deferred,
disclosed" throughout this document and "Known limitations" below), and
the flag is forward-provisioned so the eventual tax-reporting work has a
feature flag already seeded and disabled-by-default, matching every other
Finance capability's rollout pattern, rather than needing a new migration
just to add one. It gates nothing today and should stay that way — do not
wire a placeholder/fake code path to it merely to make it "used"; wire it
only when real statutory tax-reporting logic exists to gate.

## Wave 1 — Finance Foundation

See `docs/enterprise-phase2/PART_3C_WAVE1_FINANCE_FOUNDATION.md` for full
detail. Summary: `FinanceConfiguration`, `FinanceFiscalYear`/
`FinanceFiscalPeriod` (with governed reopen), `FinanceCostCenter`/
`FinanceProfitCenter`, `FinanceAccount` (Chart of Accounts with hierarchy
and posting-eligibility rules).

## Stage A — Accounting Core

### Journal model and lifecycle
`FinanceJournal` / `FinanceJournalLine` / `FinanceLedgerEntry`. Lifecycle:
`DRAFT → SUBMITTED → APPROVED → POSTED` (plus `REJECTED` returning to
`DRAFT`, and `CANCELLED` from `DRAFT`). `POSTED` is terminal — a reversal
or correction is always a new journal, never a status change on the
original (Section 18).

### Validation Engine (`lib/enterprise-finance/validation-engine.ts`)
One reusable, structured `validateJournalForPosting` — batches every
account/dimension lookup (no N+1), returns a `findings[]` array rather
than throwing on the first problem. Checks: minimum two lines, exactly one
positive side per line (also DB-enforced), exact Decimal balance, currency
consistency, account existence/active/posting-enabled/non-summary,
cost/profit center existence/active, document-date-before-posting-date,
fiscal-period resolution and status (rejects `HARD_CLOSED`; `ADJUSTMENT`
periods only accept `ADJUSTMENT`/`REVERSAL`/`CORRECTION` journal types),
duplicate-source-posting rejection, and Finance Configuration readiness
for control-account-dependent journal types.

### Posting Engine (`lib/enterprise-finance/posting-engine.ts`)
`postJournal` is the **only** path that creates `FinanceLedgerEntry` rows
for a manually-approved journal: claims a `Phase2Operation` (idempotent —
concurrent/replayed calls with the same key never duplicate ledger
entries), re-validates unconditionally, enforces the `JOURNAL_POSTING` SoD
policy, creates one ledger entry per line, marks the journal `POSTED`.
`reversePostedJournal` creates a new, immediately-posted journal with every
line's debit/credit swapped, links both journals, and — since the Part 3C
independent-audit repair pass — enforces the `JOURNAL_REVERSAL` SoD policy
against the original journal's poster before proceeding (an independent
audit found this control was missing entirely; see "Errors found and
fixed" below). `createCorrectionSuccessor`
creates a linked `DRAFT` journal pre-populated from the original's lines.
`postSystemGeneratedJournalInTx` is a shared internal helper (added during
Stage B) that AR and AP call for already-authorized, system-generated
postings (invoice issuance, receipts, bill posting, payment approval) —
reusing the same claim/validate/ledger-entry logic without routing every
such event through the full manual DRAFT→APPROVED lifecycle.

### General Ledger and Trial Balance (`lib/enterprise-finance/ledger-service.ts`)
Account/journal/fiscal-period/source/cost-center/profit-center ledger
inquiries, all reading only from `FinanceLedgerEntry` (structurally
impossible to include draft-journal or mutable-source data, since the
Posting Engine is the only writer). Trial Balance aggregates via Prisma's
native `groupBy`/`_sum` (real database aggregation, exact Decimal),
asserts its own output balances as an integrity check, and throws a
500-level error (not a user-facing validation error) if it doesn't — since
every individual posted journal is balanced by construction, an unbalanced
trial balance would indicate ledger corruption, not bad input.

`FinanceLedgerEntry.journalType` (added during the Part 3C independent-
audit repair pass) is denormalized from the owning journal at posting
time by every one of the Posting Engine's three ledger-entry-creation call
sites, so `getPeriodActivitySummary` can `groupBy` it directly — Prisma
cannot group by a related model's field. `getAccountLedger`,
`getJournalLedger`, `getFiscalPeriodLedger`, `getSourceLedger`,
`getCostCenterLedger`, and `getProfitCenterLedger` are now all bounded,
paginated, and deterministically ordered (`getJournalLedger`/
`getSourceLedger` were unbounded before the repair pass — see "Errors
found and fixed").

### Database integrity
Beyond FK constraints: `finance_journal_lines`/`finance_ledger_entries`
CHECK constraints enforcing "exactly one positive side" (which also
excludes negative and zero values by construction); no-self-reversal/
no-self-correction CHECKs; organization-consistency triggers on journal
lines and reversal/correction references; and — the one genuine defect
this stage's own tests caught and fixed — a **deny-by-default** posted-
journal immutability trigger (see "Errors found and fixed" below).
`FinanceLedgerEntry` is unconditionally append-only.

## Stage B — Accounts Receivable (partial: no credit notes/write-offs)

`FinanceCustomerAccount` (wraps `Customer.id`), `FinanceReceivableInvoice`/
`FinanceReceivableInvoiceLine`, `FinanceCustomerReceipt`,
`FinanceReceiptAllocation`. Invoice issuance and receipt recording post
immediately via `postSystemGeneratedJournalInTx` (invoice: debit AR
control, credit each line's revenue account, credit output-tax control if
taxed; receipt: debit cash/bank, credit AR control). Allocation rejects
over-allocation against either the receipt's remaining balance or the
invoice's remaining outstanding amount. Reversal is a new, opposite row —
`FinanceReceiptAllocation` is unconditionally append-only at the database
level (reuses the same trigger function protecting `FinanceLedgerEntry`).
Aging is computed as of an explicit `asOfDate` parameter, never implicit
"now" (reproducibility, Section 19).

**Deferred, disclosed**: credit notes, write-off request/approval, and
`discountAmount` posting (the column exists; the service always posts it
as zero). Invoice creation and issuance are collapsed into one atomic
Business Service call rather than separate draft/issue steps — the
`FinanceReceivableInvoice.status` model still has a real `DRAFT` state,
just nothing in this pass leaves an invoice sitting there.

## Stage B — Accounts Payable (partial: no vendor credits)

Mirrors AR structurally: `FinanceVendorAccount` (wraps the existing
Phase 1 `EnterpriseVendor.id` — no duplicate supplier master),
`FinanceVendorBill`/`FinanceVendorBillLine`, `FinanceVendorPayment`,
`FinanceVendorPaymentAllocation`. Duplicate vendor-invoice detection is a
real database unique constraint (`organizationKey, vendorAccountId,
supplierInvoiceNo`), not an app-level best-effort check.

**Payment has a genuine two-step gate AR's receipts don't**: Section 9
explicitly prohibits "payment requester approving payment" as an SoD
combination. `requestVendorPayment` only records intent (no journal yet).
`approveVendorPayment` is the step that actually posts the journal (debit
AP control, credit cash/bank) — and is rejected outright if the same actor
who requested it tries to approve, via the seeded `VENDOR_PAYMENT_APPROVAL`
SoD policy (no override configured, matching every other Stage A/B
policy).

**Deferred, disclosed**: vendor credits/debit notes.

## Stage B — Expense Management

`FinanceExpenseCategory` (each carries a `defaultAccountId`, used as the
line's account when a line doesn't specify its own), `FinanceExpenseClaim`,
`FinanceExpenseLine`. Lifecycle: `DRAFT → SUBMITTED → (APPROVED |
PARTIALLY_APPROVED | REJECTED) → POSTED → REIMBURSED`.
`createExpenseClaimDraft` computes `totalClaimedAmount` from its lines and
defaults each line's `accountId` to its category's `defaultAccountId` when
not explicitly given. `approveExpenseClaim` requires an **explicit**
approval entry for every line — there is no implicit "approve the rest at
zero" — and derives the claim's overall status from the sum of approved
amounts (`REJECTED` if all zero, `PARTIALLY_APPROVED` if some lines were
reduced or rejected, `APPROVED` if every line was approved in full).
`EXPENSE_APPROVAL` is a seeded SoD policy: the actor who submitted a claim
cannot approve or reject it. `postApprovedExpenseClaim` posts via
`postSystemGeneratedJournalInTx` — debits each line's account for its
`approvedAmount`, credits `FinanceConfiguration.defaultExpensePayableAccountId`.
`reimburseExpenseClaim` mirrors an AP payment: debits the payable account,
credits cash/bank.

**Deferred, disclosed**: multi-currency claims, receipt/evidence file
storage (`evidenceReference` is a free-text field only — no upload
pipeline), and per-category spending limits/policy enforcement.

## Stage B — Banking Foundation and Reconciliation

`FinanceBankAccount` (each links to a `FinanceAccount` via
`linkedGlAccountId` — the GL control account that reconciliation is
performed against), `FinanceBankStatement`/`FinanceBankStatementLine`
(imported, not fetched live — no bank-feed integration), and
`FinanceReconciliationSession`/`FinanceReconciliationMatch`.

`importBankStatement` rejects a duplicate `statementRef` for the same
bank account via a real database unique constraint, not an app-level
check. `beginReconciliation` opens a session against one statement.
`matchStatementLine` supports two distinct match types: matching a
statement line to an **existing** `FinanceLedgerEntry` (with an explicit
amount-equality check — no silent partial or fuzzy matching), or, when no
matching ledger entry exists (bank fees, interest, or other bank-initiated
movements the books don't know about yet), posting a brand-new
`BANK_ADJUSTMENT` journal via `postSystemGeneratedJournalInTx` and
matching to that journal's resulting ledger entry instead. `unmatchStatementLine`
follows the same append-only, reversal-via-new-row pattern established in
AR/AP — it never `UPDATE`s the original `FinanceReconciliationMatch` row,
which is unconditionally immutable at the database level (reuses
`finance_reject_ledger_mutation()`, the same trigger function protecting
`FinanceLedgerEntry`). `completeReconciliation` requires zero unmatched
lines remaining and enforces the seeded `RECONCILIATION_APPROVAL` SoD
policy (the actor who prepared the session cannot complete it).
`getBankPosition` reports the linked GL account's balance as of an
explicit `asOfDate`, mirroring the AR/AP aging functions' reproducibility
discipline. `matchStatementLine`'s existing-ledger-entry path also rejects
matching a ledger entry that is already matched (non-reversed) to another
statement line — there is no database uniqueness on `ledgerEntryId`
(deliberately, since a reversed match must free it up again), so this is
an application-level guard, added after an independent-audit-style
self-challenge found no protection existed against the same ledger entry
being double-booked across two statement lines.

A completed `FinanceReconciliationSession` is unconditionally immutable —
the trigger protecting it (`finance_reject_completed_session_mutation`)
was rewritten during the Part 3C independent-audit repair pass to a
deny-by-default whole-row comparison (see "Errors found and fixed"); no
field is permitted to change post-completion, since no Business Service
ever legitimately writes to a session again once `completeReconciliation`
has run.

**Deferred, disclosed**: no live bank-feed/API integration (statements are
imported as discrete batches only), no auto-matching/suggested-match
heuristics (every match is an explicit, individually-authorized call), and
no support for a statement line matching more than one ledger entry (or
vice versa) — matches are strictly one-to-one.

## Remaining Reporting Services

Added to the existing AR/AP/Ledger services rather than as a new file,
since each belongs to the domain that already owns the underlying data:
- `ar-service.ts`: `getCustomerStatement(customerId)` — chronological
  invoice + receipt activity for one customer.
- `ap-service.ts`: `getVendorStatement(vendorId)` — mirrors the above for
  one vendor.
- `ledger-service.ts`: `getPeriodActivitySummary(fiscalPeriodId)` — groups
  `FinanceLedgerEntry` rows by `journalType` (denormalized directly onto
  the ledger entry — see "General Ledger and Trial Balance" above) and
  sums debit/credit per type, via a real Prisma `groupBy`/`_sum`, bounded
  by the number of distinct journal types rather than raw row count. An
  earlier version of this function actually did an in-memory reduction
  over a capped `take: 5000` row fetch despite this same claim in the
  documentation — a genuine defect an independent audit found; see
  "Errors found and fixed".

**Deferred, disclosed**: a full journal register/audit export report, and
any statutory tax-return-formatted report.

## Background Jobs

`lib/enterprise-finance/jobs.ts` — `refreshOverdueInvoiceStatus` and
`refreshOverdueBillStatus`, both built on Part 3A's existing job boundary
(`claimPhase2Job`/`completePhase2Job`/`failPhase2Job` from
`lib/enterprise-phase2/jobs.ts`), not a new job mechanism. Each claims a
day-scoped idempotency key (`ar-overdue-refresh:<YYYY-MM-DD>` /
`ap-overdue-refresh:<YYYY-MM-DD>`) so a second call on the same day safely
replays the prior claim instead of duplicating work, bulk-updates every
`ISSUED`/`PARTIALLY_PAID` invoice (or `POSTED`/`PARTIALLY_PAID` bill) whose
due date has passed to `OVERDUE`, and records the updated count as the job
result. Both require `FINANCE_RECEIVABLES_MANAGE`/`FINANCE_PAYABLES_MANAGE`
respectively — there is no unauthenticated or system-cron-only path yet
(deferred: an actual scheduled trigger; today these are directly-callable
functions only, exercised by tests, not wired to a cron/queue).

## Permissions, feature flags, SoD (all reused, minimal additions)

No new permission strings this Part — `finance.receivables.view/manage`,
`finance.payables.view/manage`/`finance.payments.prepare/approve`, and the
remaining `finance.*` keys were already seeded by Part 3A specifically for
this purpose. Seven SoD policies exist in total (idempotent seed upserts):
`FISCAL_PERIOD_REOPEN` (Wave 1), `JOURNAL_APPROVAL`, `JOURNAL_POSTING`,
`JOURNAL_REVERSAL` (Stage A), `VENDOR_PAYMENT_APPROVAL` (Stage B AP),
`EXPENSE_APPROVAL` (Stage B Expense), `RECONCILIATION_APPROVAL` (Stage B
Banking). All seven have `prohibitSameActor: true` and **no
`overridePermission` configured** — meaning no actor, Founder included,
can perform both sides of the same maker-checker pair (see "Errors found
and fixed"). `JOURNAL_REVERSAL` was added during the Part 3C independent-
audit repair pass — an independent audit found `reversePostedJournal` had
no maker-checker control at all, unique among Part 3C's sensitive
mutations; its preparer is the original journal's poster (`postedById`),
so the actor who posted a journal cannot also be the one who reverses it.

## Errors found and fixed during this Part (self-challenge, not hidden)

1. **Deny-by-default immutability, not an enumerated allowlist.** The
   first version of `finance_reject_posted_journal_mutation()` explicitly
   listed which columns to protect on a `POSTED` journal — and missed
   `description` (among others). A Stage A runtime test
   (`UPDATE finance_journals SET description = 'tampered' ...`) caught
   that this succeeded instead of being rejected. Fixed via a new,
   additive migration (`20260727150100_...`) that replaces the trigger
   function with a whole-row `jsonb` comparison excluding only the two
   columns a reversal/correction is allowed to populate once — the
   already-applied prior migration was never edited.
2. **A false-positive SoD test.** Wave 1's own "enforces segregation of
   duties on period reopen" test asserted that a Founder acting as both
   requester and approver would succeed. It passed — but only because
   `npm run db:seed` had never actually been run against the live
   database before that test first executed, so the `FISCAL_PERIOD_REOPEN`
   policy row didn't exist yet, and `enforceSegregationOfDuties`'s
   early-return-on-missing-policy branch silently skipped enforcement
   entirely. Once Stage A's own work ran the seed for real, the test
   started failing honestly — revealing that `enforceSegregationOfDuties`
   requires `overridePermission` to be configured for *any* override,
   Founder included, not just non-Founder actors. The test was corrected
   to assert the true, stricter, correct behavior (same-actor rejected,
   different-actor allowed), and every subsequent Stage A/B two-actor
   flow (journal approve/post, vendor payment approve) was built and
   tested against this same real behavior from the start.
3. **A self-contradicting reversal implementation.** `ar-service.ts`'s
   first `reverseAllocation` tried to `UPDATE` the original allocation's
   `status` to `"REVERSED"` — directly contradicting its own doc comment
   ("the original allocation is never updated") and the database's
   unconditional append-only trigger, which correctly rejected it. Fixed
   to derive "already reversed" by querying for an existing row with
   `reversalOfAllocationId` pointing at the original, never by mutating
   it. The same corrected pattern was used for AP's `reverseVendorAllocation`
   from the start.
4. **Cross-file test flag races.** Vitest's default parallel file
   execution let two test files race on the same shared `AiConfiguration`
   feature-flag rows once tests started actively toggling flags on and
   off mid-run (not just reading them). Fixed by setting
   `fileParallelism: false` in `vitest.config.ts` — this integration
   suite shares one live database by design, so sequential file execution
   is the correct fix, not a workaround.
5. **Snapshot-and-restore flag cleanup was fragile against its own
   failures.** Test `afterAll` blocks originally captured each flag's
   value in `beforeAll` and restored that captured value afterward. An
   earlier interrupted run (during this same development session) left
   flags enabled without ever reaching its own cleanup, which meant a
   later run's "captured original" was already polluted `true` — and
   every subsequent run kept re-preserving that pollution. Fixed by
   hardcoding the restore target to `false` (the actual documented
   default) in every Finance test file's `afterAll`, and by resetting the
   live database's flags directly once to correct the accumulated
   pollution.
6. **An unbounded export.** `exportChartOfAccounts` (Wave 1) had no result
   cap. Given `take: 5000`.
7. **Two more unbounded `findMany` calls, found during this segment's
   hardening pass.** `listDimensions` (`dimension-service.ts`) and
   `listFiscalPeriods` (`period-service.ts`) had no `take` limit. Both
   given `take: 5000`, matching the rest of the codebase's convention.
8. **Missing `organizationKey` filter on "already reversed" lookups,
   found during the same hardening pass.** `ar-service.ts`'s
   `reverseAllocation`, `ap-service.ts`'s `reverseVendorAllocation`, and
   `banking-service.ts`'s `unmatchStatementLine` all located the existing
   reversal row by its `reversalOf*Id` foreign key alone, without an
   explicit `organizationKey` filter. Not exploitable today (ids are
   globally unique cuids), but fixed for defense-in-depth and consistency
   with every other query in these services.
9. **A real cross-object status-list bug, found while building the
   overdue-bill background job.** `ap-service.ts`'s
   `allocateVendorPayment`, `getVendorBalance`, and `getPayablesAging` all
   filtered on bill status `["POSTED", "PARTIALLY_PAID"]` — omitting
   `"OVERDUE"`. AR's equivalent functions already included the parallel
   `"OVERDUE"` state; AP's didn't, meaning a payment against a genuinely
   overdue bill would have been silently rejected as "not payable." Fixed
   all three; added a dedicated regression test
   (`stageB-jobs.integration.test.ts`) that marks a bill `OVERDUE` via the
   new job and then proves allocation against it still succeeds.
10. **Job idempotency key/fingerprint granularity mismatch.**
    `refreshOverdueInvoiceStatus`/`refreshOverdueBillStatus` used a
    day-scoped `idempotencyKey` (correct — the job is meant to be safely
    re-run same-day) but built `requestFingerprint` from the full
    millisecond-precision `asOfDate` — so two legitimate same-day calls
    produced different fingerprints under the same key, and the second
    call failed with "idempotency key was already used for a different
    request" instead of replaying. Fixed by fingerprinting the same
    day-scoped string (`asOfDay`) used for the key.
11. **Intermittent full-suite test failures, investigated rather than
    dismissed as flakiness.** Full-suite runs intermittently failed
    (varying error messages: missing fiscal period, inactive finance
    configuration, overlapping fiscal-year date range) during this
    segment. An initial hypothesis — genuine Postgres SERIALIZABLE
    contention — led to speculatively wrapping `banking-service.ts` in
    Part 3A's retry-capable `phase2SerializableTransaction`; this did not
    fix the failures and was reverted once the real causes were found by
    capturing full (not truncated) error output across repeated runs:
    (a) `stageB-banking.integration.test.ts`'s `beforeAll` never itself
    activated the singleton `FinanceConfiguration` row, silently relying
    on some other, non-deterministically-ordered test file having already
    done so — fixed by giving Banking's own `beforeAll` the same
    fetch-then-activate logic every other Finance test file already has;
    (b) fiscal years created by tests are permanent by design (immutable,
    same as posted journals), and several test files originally drew
    "random" fiscal years from overlapping numeric ranges — after many
    repeated local re-runs during this session's own debugging, the
    unclaimed space within each range was depleted enough to make
    `assertNoOverlap` collisions non-trivial. This is a local
    heavy-iteration test-infrastructure artifact, not a production or
    single-CI-run risk (collision probability against a fresh database is
    negligible). Went through three attempts before landing on the real
    fix: (1) widening each file's random draw to a much larger year range
    reduced but did not eliminate the risk; (2) widening further into 5-6
    digit years surfaced a second, genuine, separate bug — Prisma's query
    engine cannot serialize a `DateTime` past year 9999 (`Could not
    convert argument value ... "+176974-04-01T00:00:00.000Z" to
    ArgumentValue`) — so that was reverted; (3) switching each file to a
    *fixed, disjoint sub-band* (e.g. Stage A 2100-4099) with a
    deterministic "highest year used in my band, pick the next" query
    still failed on a later run, because stale years from attempt (1)'s
    random draws (which could land anywhere up to ~7099) had already
    polluted the *top* of the newly-assigned fixed bands, so the very
    first deterministic pick landed near the band's ceiling and
    immediately exhausted it. The actual fix: every future-anchored
    Finance test file (Stage A, AR, AP, Banking) now shares one growing
    pool starting at year 2100 — each queries the TRUE highest fiscal year
    used *anywhere* for the org at or above 2100 and always picks the next
    year past it, which is correct regardless of how much of the space is
    already polluted, by whom, or when (no fixed ceiling to run into short
    of year 9999). `stageB-jobs.integration.test.ts` needs its fiscal year
    to stay in the past relative to the real run date, so it uses the same
    "true highest existing year, pick next" query scoped below a ceiling
    of (today's year − 5), which keeps working correctly indefinitely
    since that ceiling moves forward with real time. Wave 1's own fixed
    2031-2040 range stays below 2100 so it never intersects the shared
    pool. `banking-service.ts` was reverted back to plain
    `enterpriseTransaction` (matching every other Finance service) once
    the real causes were found. 4+ consecutive full-suite runs passed
    cleanly after all of the above.
12. **A reconciliation double-match gap, found during this segment's final
    self-challenge re-read of `banking-service.ts`.** Nothing prevented
    the same `FinanceLedgerEntry` from being matched to two different
    bank statement lines — there was no database uniqueness on
    `ledgerEntryId` (deliberately, since a reversed match legitimately
    frees the ledger entry up again) and no application-level check either.
    Fixed by adding the same kind of guard AR/AP already use against
    over-allocation: before creating a `LEDGER_ENTRY`-type match,
    `matchStatementLine` now queries for any existing, non-reversed match
    already referencing that ledger entry and rejects with a
    `ConflictError` if found. Two regression tests were added to
    `stageB-banking.integration.test.ts` (the ledger-entry match path had
    no test coverage at all before this — every prior Banking test only
    exercised the `MANUAL_ADJUSTMENT` match path): one proving a ledger
    entry can be matched once and a second match attempt against it is
    rejected, and one proving an amount mismatch between the ledger entry
    and the statement line is rejected.

The following four items (13-16) were found by a subsequent **independent
read-only audit** of the code above (not self-reported by the
implementation), then repaired in a dedicated audit-repair pass:

13. **`reversePostedJournal` had no Segregation-of-Duties control at all**
    — unique among Part 3C's sensitive mutations (posting, vendor payment
    approval, expense approval, and reconciliation completion all had one).
    A single actor holding `FINANCE_JOURNALS_POST` could unilaterally
    create and post a reversal of any posted journal in one step. Fixed by
    adding a `JOURNAL_REVERSAL` SoD policy (preparer = the original
    journal's poster) and an `enforceSegregationOfDuties` call in
    `reversePostedJournal`, matching every other Part 3C maker-checker
    control (no `overridePermission`, Founder included). The existing
    reversal test was updated to use two actors (it had been posting and
    reversing as the same actor, which is exactly how the gap went
    unnoticed); two new tests assert same-actor rejection (Founder
    included, no implicit bypass) and rejection of a missing/blank
    reversal reason.
14. **The completed-reconciliation-session immutability trigger used an
    enumerated column allowlist that omitted `organizationKey`** — the
    same class of gap Stage A's own trigger had once (item 1 above), in a
    trigger added later in this same Part that should have already known
    better. A direct `UPDATE` of a completed session's `organizationKey`
    would not have raised an exception. Fixed via a new additive migration
    (`20260727190000_..._audit_repair_reconciliation_immutability`)
    replacing the function with a deny-by-default whole-row comparison —
    no field is permitted to change post-completion at all (verified no
    Business Service ever legitimately writes to a completed session), so
    unlike the posted-journal trigger this one needs no exceptions, and
    any future column addition is automatically protected. A new test
    exercises `organizationKey`, `status`, identity (`bankAccountId`),
    both balance fields, `preparedById`, and deletion — all rejected — on
    top of the existing match-mutation test.
15. **`getPeriodActivitySummary` did not match its own documentation.**
    It fetched up to 5000 raw `FinanceLedgerEntry` rows (unordered) and
    reduced them in a JS `Map`, despite its doc comment claiming real
    `groupBy`/`_sum` aggregation — a genuine scalability defect, since any
    period with more than 5000 posted entries produced a silently
    incomplete summary. Fixed by denormalizing `journalType` directly onto
    `FinanceLedgerEntry` (new additive migration
    `20260727191000_..._audit_repair_ledger_journal_type` — added
    nullable, backfilled from the owning journal with the append-only
    trigger briefly disabled *for that migration's own backfill statement
    only*, then set `NOT NULL`; Prisma cannot `groupBy` through a
    relation, which is why denormalization was necessary rather than
    joining), populated by all three of the Posting Engine's
    ledger-entry-creation call sites, and rewriting the function to a real
    `groupBy`. A new test bulk-inserts (via direct `createMany`, not the
    Business Service — 5000+ rows one at a time would be far too slow for
    a test) more than 5000 ledger rows across two distinct journal types
    into a dedicated fiscal period and asserts exact per-type totals, that
    every row is accounted for, and that a fresh empty period returns a
    valid empty summary.
    - **A self-inflicted lesson from building this exact test**: an
      earlier draft of the bulk-inserted synthetic data was deliberately
      *unbalanced* (debit-only rows with no offsetting credit, since the
      test only needed to exercise per-type counting) — but
      `finance_ledger_entries` is permanent and immutable, so that
      unbalanced test data corrupted `getTrialBalance`'s global integrity
      check for every fiscal period chronologically after it, for the
      rest of this database's life, the moment it was inserted. It also
      caused the *dedicated fiscal year* fix below (next paragraph), since
      the first version of this test reused the file's shared `testYear`
      and picked up +2 phantom rows from an unrelated, earlier test in the
      same file that also posts into that period. Both were repaired:
      the synthetic AR_INVOICE batch now includes a genuine offsetting
      credit side (debit against a cash-type account, credit against a
      revenue-type account, both through the same real journal's own
      accounts), and the heavy test now creates its own dedicated,
      untouched fiscal year rather than sharing one with other tests in
      the file. The specific historical corruption this mistake caused in
      the shared dev database during development (four rows, net 1000
      imbalance) was located precisely — by finding the exact
      `journalType='AR_INVOICE'` rows whose `journalId` also owned
      thousands of other ledger entries, since a real invoice's own
      journal never does — and corrected with matching compensating
      entries before this pass was considered complete; global
      `SUM(debitAmount) = SUM(creditAmount)` was re-verified directly
      against the database afterward.
16. **`getJournalLedger` and `getSourceLedger` had no `take`/pagination
    bound at all**, unlike every sibling function in `ledger-service.ts`.
    Fixed to use the same bounded, deterministically-ordered,
    count-plus-`findMany` pattern as `getAccountLedger`/
    `getFiscalPeriodLedger` — both functions' return shape changed from a
    plain array to `{ items, total, page, pageSize }` (their only 3
    existing call sites, all in `stageA-accounting-core.integration.test.ts`,
    were updated). `boundedPage` itself was hardened to clamp non-finite,
    zero, or negative `page`/`pageSize` input to a safe positive value
    rather than ever producing a negative `take` (which Prisma rejects) or
    an unbounded fetch. A new test proves: `pageSize` is capped at
    `MAX_PAGE_SIZE` (200) even when a much larger value is requested;
    two pages returned in sequence never overlap and stay in
    deterministic ascending-`id` order; invalid page input (negative page
    and pageSize) degrades to a safe default instead of erroring; and an
    empty result set returns `{ items: [], total: 0 }` rather than
    throwing.

## Testing

Seven real-database integration test files, no mocked Prisma:
- `wave1-foundation.integration.test.ts` — 18 tests
- `stageA-accounting-core.integration.test.ts` — 27 tests (includes the
  five audit-repair tests from items 13 and 15-16 above: same-actor
  reversal rejection, blank-reason rejection, the 5000+-row aggregation
  proof, the empty-period summary, and the summary flag-gate check)
- `stageB-accounts-receivable.integration.test.ts` — 13 tests
- `stageB-accounts-payable.integration.test.ts` — 12 tests
- `stageB-expense-management.integration.test.ts` — 7 tests
- `stageB-banking.integration.test.ts` — 12 tests (includes the two
  ledger-entry-match regression tests from item 12, and the full
  completed-session-immutability sweep from item 14, above)
- `stageB-jobs.integration.test.ts` — 3 tests (includes a dedicated
  regression test for the AP `OVERDUE`-status bug above)

All auth is mocked locally per file via `vi.mock("@/lib/auth", ...)`
(matching `__tests__/muv-ai/diagnostics.test.ts`'s established pattern),
so every test exercises the real `getSalesPrincipal → requireEnterprisePrincipal
→ requireFinancePrincipal` chain end to end. Full suite: 273/273 passing
after the independent-audit repair pass (was 267/267 before it) — see the
accompanying repair report for the actual command run confirming this.

## Known limitations (in addition to the deferred scope stated above)

- No Server Action or API route exists for any Finance capability yet —
  everything is a directly-callable, directly-tested Business Service.
- List/inquiry functions across Wave 1/Stage A/Stage B/Stage B Expense
  and Banking are not paginated except where explicitly noted
  (`listJournals`, `listReceivableInvoices`, `listVendorBills` are
  paginated and bounded; most `list*`/`get*Ledger` functions cap at
  `take: 5000` but don't accept a page cursor).
- `FinanceAccount.normalBalance` isn't validated against the conventional
  balance for its category (deliberate — permits contra accounts — but
  also permits an unflagged data-entry mistake).
- Fiscal-period generation divides the year into equal date slices, not
  calendar-month-aligned periods.
- The two background jobs (overdue invoice/bill refresh) exist as
  directly-callable, idempotent, tested functions only — neither is wired
  to an actual scheduler/cron/queue yet.
- Bank reconciliation matching is strictly one-to-one and fully manual
  (no bank-feed integration, no auto-match suggestions).
- Test files persist real fiscal years permanently by design (matching
  production immutability). Every Finance test file now picks its next
  fiscal year deterministically via a DB query in `beforeAll` — the four
  future-anchored files share one growing pool from year 2100, and Jobs
  uses its own pool bounded below (today's year − 5) — instead of a fixed
  band or a random draw (see "Errors found and fixed" item 11). This is
  correct indefinitely up to Prisma's own year-9999 serialization limit
  (confirmed real — see item 11's account of the "+176974-04-01..."
  driver error), but an earlier estimate here that this "would take many
  thousands of runs to approach" was **wrong and has already been
  disproven**: this local dev database's shared pool reached year ~9852
  during the audit-repair pass's own development and debugging (direct
  `MAX(startDate)` query), leaving only roughly 150 years of headroom —
  not thousands. The heavier tests added by this repair pass (which each
  reserve several dedicated fiscal years per run, on top of what every
  prior Finance test file already consumed across many months of
  iterative local re-runs) consume the pool noticeably faster than
  originally assumed. **This is now a real, near-term risk**, not a
  theoretical one: the next several dozen full-suite runs against this
  specific local database could genuinely exhaust the pool and start
  producing the same "+176974..." driver error this Part already hit
  once. A structural fix (e.g., a fresh database, or moving fiscal-year
  test data to a range the driver can serialize past 9999, if one exists)
  should be considered before much further local iteration on this Part.
- Bank reconciliation match-to-existing-ledger-entry double-booking is
  now guarded at the application level (see "Errors found and fixed" item
  12), not the database level — there is deliberately no unique
  constraint on `ledgerEntryId`, since a reversed match must free it up
  again, so this protection lives entirely in `matchStatementLine`'s own
  check rather than being structurally guaranteed.

## Verification commands run for this Part

```text
npx prisma format · npx prisma validate · npx prisma generate
npx prisma migrate deploy   (run twice in the audit-repair pass — a migration replay check; second run was a clean no-op)
npx prisma migrate status   (drift check — "Database schema is up to date!")
npm run db:seed   (run twice in the audit-repair pass — a seed idempotency check; both exit 0)
npx tsc --noEmit
npx vitest run   (full suite; run 4+ times across the original implementation pass to confirm
                   stability after items 11-12, and again after the audit-repair pass's items 13-16)
node scripts/verify-enterprise-phase1.cjs
node scripts/verify-enterprise-phase2-part3a.cjs
node scripts/verify-enterprise-phase2-part3b.cjs
node scripts/verify-enterprise-phase2-part3b-db.cjs
node scripts/verify-enterprise-phase2-part3c.cjs
node scripts/verify-sales-architecture.cjs
npm run build
```

All executed for real against the live dev database; all passed on the
final run, both for the original implementation pass and again after the
independent-audit repair pass. Exact numbers are in the accompanying
implementation report and repair report.

## Next

Credit notes, write-offs, discount posting, statutory tax reporting, an
actual scheduler/cron trigger for the two background jobs, and Server
Action/API exposure for any of this Part's Business Services are not
started. Before much further local iteration on this Part specifically,
the shared fiscal-year test-year pool's proximity to Prisma's year-9999
serialization ceiling (see "Known limitations") should be addressed —
it is closer to exhaustion than earlier estimates in this document
assumed. This document will be extended, not silently replaced, when that
work begins. No claim of Part 3C completion, independent verification, or
freeze is made — this repair pass fixed the defects an independent audit
found; it did not re-run that independent audit, and a repaired defect
list is not itself a freeze-readiness claim.
