# Commerce Number Trigger Remediation

**Status: REMEDIATED.** Bounded, authorized production-safety remediation completed during the
Enterprise UI Integration pass, 2026-07-28/29. This document is the full record: root cause, affected
objects, production-risk assessment, migration design, before/after reproduction, data-preservation
evidence, test and verifier results, and rollback considerations.

## 1. How this was found

Not a reported incident — discovered as a side effect of a much smaller task. The Enterprise UI
Integration continuous authorization asked for a deterministic, test-owned `Order` fixture in
`__tests__/enterprise-phase2/business-network.integration.test.ts` (carried-forward requirement #6),
replacing a `findFirst` lookup against accumulated dev data. Creating a real `Order` row for that
fixture failed. Investigating why surfaced a genuine, unrelated, pre-existing defect in Commerce
(Part 1) infrastructure — nothing to do with Part 3B Business Network, the suite that happened to
need the fixture.

## 2. Root cause

`prisma/migrations/20260727060000_commerce_operations_v2/migration.sql` (lines 468-481) defines one
shared `assign_commerce_numbers()` `BEFORE INSERT` trigger function, bound by five separate triggers
to five different tables:

| Trigger | Table | Field assigned | Format |
|---|---|---|---|
| `commerce_order_number_before_insert` | `orders` | `orderNumber` | `MUV-ORD-YYYY-NNNNNN` |
| `invoice_number_before_insert` | `commercial_invoices` | `invoiceNumber` | `MUV-INV-YYYY-NNNNNN` |
| `payment_number_before_insert` | `commerce_payments` | `paymentNumber` | `MUV-PAY-YYYY-NNNNNN` |
| `receipt_number_before_insert` | `commerce_receipts` | `receiptNumber` | `MUV-RCP-YYYY-NNNNNN` |
| `movement_number_before_insert` | `stock_ledger_entries` | `movementNumber` | `MUV-STK-YYYY-NNNNNNNN` (8-digit) |

The function body is five independent `IF TG_TABLE_NAME = '<table>' AND (NEW."<field>" IS NULL OR
NEW."<field>" = '') THEN ... END IF;` statements — not an `IF/ELSIF` chain, five separate statements,
each referencing a field name that exists on only one of the five tables.

**Mechanism:** PL/pgSQL must parse and resolve every `NEW."field"` reference in a statement it
reaches during control flow, against the actual row type bound to `NEW` for that specific trigger
firing. This resolution happens at parse/analyze time, before any runtime short-circuit evaluation of
the `AND`. Every trigger firing on any of the five tables reaches all five `IF` statements in sequence
(they are not mutually exclusive branches of one conditional), so it always attempts to resolve four
field names that do not exist on the row type currently bound — e.g., when `NEW` is an `orders` row,
the second statement's `NEW."invoiceNumber"` reference has no field to resolve. The `TG_TABLE_NAME`
guard never gets a chance to prevent that resolution from being attempted, because resolution
precedes the short-circuit, not the other way around.

**Net effect: every single insert into any of these five tables fails, unconditionally, every time.**

This is not a session, connection-pool, or plan-cache effect — confirmed by reproducing failure on the
very first statement of a brand-new database connection, and confirmed to fail identically regardless
of which of the five tables is inserted into first, or in what order, in the same connection/session.

## 3. Precedent — the same bug, already found and fixed once before

`prisma/migrations/20260727070000_customer_growth_intelligence_v2` (lines 441-450) introduced the
identical anti-pattern for a different domain: one shared `phase6_assign_numbers()` function bound to
`reward_ledger_entries`, `customer_referrals`, and `executive_reports`, each branch referencing a
different field. `20260727070100_phase6_number_triggers` — a migration applied 100 seconds later in
this project's history — replaced it with three single-table functions
(`phase6_reward_ledger_number`, `phase6_referral_number`, `phase6_report_number`). That fix has been
in place and working ever since; `scripts/verify-sales-phase6.cjs` (44/44 checks, re-run live in this
pass) confirms the growth/loyalty domain's numbering has been correct throughout.

The commerce migration (`20260727060000`) made the same mistake shortly before the growth migration's
version of it was caught and corrected — but the commerce instance was never given the same fix. This
remediation applies the identical, already-proven pattern to the five commerce tables.

## 4. Affected objects

- Function `assign_commerce_numbers()` (replaced, then dropped).
- Five triggers: `commerce_order_number_before_insert`, `invoice_number_before_insert`,
  `payment_number_before_insert`, `receipt_number_before_insert`, `movement_number_before_insert`
  (rebound to new, single-table functions — same names, same tables, same timing).
- Five sequences: `commerce_order_number_seq`, `invoice_number_seq`, `commerce_payment_number_seq`,
  `commerce_receipt_number_seq`, `stock_movement_number_seq` — reused as-is, not recreated, not reset.
- **Not touched:** `reject_commerce_history_mutation()`, `protect_invoice_snapshot()`, and every
  trigger bound to them (`stock_ledger_immutable`, `commerce_status_history_immutable`,
  `commercial_invoice_immutable`, `commercial_invoice_lines_immutable`, `commerce_receipts_immutable`,
  `commerce_documents_immutable`) — all immutability protections are unrelated to number assignment
  and were verified unchanged (see §7).
- Confirmed via full-repository search (`grep TG_TABLE_NAME` across every migration) that no other
  function shares this multi-table-conditional-field anti-pattern. The growth/loyalty instance (§3)
  was already fixed; commerce was the only remaining unfixed instance.

## 5. Production-risk assessment

Verified in this pass:

- **Every existing populated `orders` row (12 rows in the development database) predates
  `20260727060000_commerce_operations_v2` entirely** (all `createdAt` timestamps July 21-24; the
  migration is dated July 27) — none of them were ever created through this trigger, and their
  `orderNumber` values use `actions/orders.ts`'s own application-level format (`MUV` + 6 random
  digits), never the trigger's intended `MUV-ORD-YYYY-NNNNNN` format.
- **`commercial_invoices`, `commerce_payments`, `commerce_receipts`, and `stock_ledger_entries` all
  had zero rows** in the development database, and all five sequences were still at their initial
  unadvanced state — consistent with this trigger never having successfully fired since the migration
  was applied.
- **`actions/orders.ts`'s real checkout path (`createOrder`) generates its own non-empty
  `orderNumber` and was still blocked** — confirmed directly: even with a fully-populated, non-empty,
  application-generated order number supplied, the insert still failed, because the trigger fails
  regardless of which branch's assignment would have applied.

**Conclusion: since this migration was applied, order creation (and any future
invoice/payment/receipt/stock-ledger creation) has been completely, unconditionally broken in this
environment.** This could not be confirmed to be a "sometimes" defect — every reproduction attempt
failed, with no exception. Whether the production database has been affected could not be determined
from this environment (no access to production); the mechanism is deterministic and would apply
identically to any database this migration was applied to. Flagged for direct verification against
production by whoever has that access.

## 6. Migration design

New migration: `prisma/migrations/20260801100000_commerce_number_trigger_remediation/migration.sql`
(forward-only; the original `20260727060000_commerce_operations_v2` file was not edited, rewritten, or
deleted).

Approach, mirroring §3's precedent exactly:

1. `DROP TRIGGER IF EXISTS` on all five existing trigger bindings.
2. `DROP FUNCTION IF EXISTS "assign_commerce_numbers"()`.
3. `CREATE OR REPLACE FUNCTION` for five new, single-table functions — `assign_order_number()`,
   `assign_invoice_number()`, `assign_payment_number()`, `assign_receipt_number()`,
   `assign_stock_movement_number()` — each containing exactly one `IF NEW."<field>" IS NULL OR
   NEW."<field>" = '' THEN ... END IF;` referencing only its own table's field. No table-name
   branching, so there is nothing left to mis-resolve.
4. `CREATE TRIGGER` rebinding each of the five original trigger names to its corresponding new
   function, same table, same `BEFORE INSERT FOR EACH ROW` timing.

Every number format string, prefix, digit-padding width (including `stock_ledger_entries`' own
8-digit padding, distinct from the other four tables' 6-digit padding), and sequence name is copied
character-for-character from the original function. `DROP ... IF EXISTS` / `CREATE OR REPLACE`
throughout make the migration safe to reason about even under partial-failure retry, consistent with
this repository's own established idiom (matches §3's precedent migration's style exactly).

## 7. Before/after reproduction

**Before** (against both the isolated `muv_test` database and the real development `muv` database,
via both `prisma.order.create()` and raw SQL):

```
The column `new` does not exist in the current database.
```
(Prisma's surfaced message; the underlying Postgres error, visible via raw SQL, is:
`record "new" has no field "invoiceNumber"`, code `42703`.)

Reproduced as the very first statement executed on a brand-new database connection — not order- or
session-history-dependent. Every one of the following independently reproduced the identical failure:
inserting into `orders` first then another table, inserting into another table first then `orders`,
inserting into a single table alone with nothing else touched in that connection, and inserting with
an explicit non-empty value for the assigned field (removing any doubt that this was about the
assignment branch itself, rather than the mere act of the trigger firing).

**After** (same reproductions, re-run against `muv_test`, a disposable full clone of the populated
development database, and the real development database):

```
order with explicit number: <application-generated value>, unchanged
order with auto-assigned number: MUV-ORD-2026-000001  (format verified)
invoice auto-assigned number:    MUV-INV-2026-000001  (format verified)
payment auto-assigned number:    MUV-PAY-2026-000001  (format verified)
receipt auto-assigned number:    MUV-RCP-2026-000001  (format verified)
stock movement auto-assigned:    MUV-STK-2026-00000001  (format verified)
```

All permutations (orders-first, others-first, single-table-alone) now succeed identically.

## 8. Data-preservation evidence

- Development database `orders` row count: **12 before, 12 after** — unchanged.
- All 12 existing `orderNumber` values: **byte-for-byte unchanged** (spot-checked all 12, not a
  sample) — confirmed identical before and after migration application.
- `commercial_invoices`/`commerce_payments`/`commerce_receipts`/`stock_ledger_entries`: **0 rows
  before, 0 rows after** — nothing existed to preserve or renumber in any of these four tables.
- No `UPDATE` or `DELETE` statement appears anywhere in the remediation migration — it only touches
  trigger and function definitions, never table rows.
- Validated first on a **disposable full clone** of the populated development database
  (`pg_dump`/`psql`, dropped after validation) before touching the real development database, per the
  authorized validation sequence.

## 9. Test and verifier results

All counts below are from live re-runs during this remediation, in order:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | clean, all routes compile |
| New suite: `__tests__/commerce/number-trigger-remediation.integration.test.ts` | **7/7 passed** (format checks for all 5 tables, uniqueness, orders-first permutation exercising all 5 tables in one connection, reverse permutations, stock-ledger immutability still enforced, invoice-snapshot immutability still enforced) |
| `__tests__/enterprise-phase2/business-network.integration.test.ts` | **6/6 passed** (previously: `beforeAll` threw "An order is required", failing/erroring all 6) |
| `__tests__/enterprise-phase2/` (full folder) | **23/23 passed** (same total §8 of the Part 3B freeze doc already counted) |
| Full suite: `npx vitest run` | **27 files / 366 tests passed, 0 failed, 0 skipped** |
| `scripts/verify-sales-phase6.cjs` | 44/44 passed (confirms the §3 precedent fix is still intact) |
| `scripts/verify-enterprise-phase1.cjs` | 82/82 passed |
| `scripts/verify-enterprise-phase2-part3a.cjs` | 27/27 passed |
| `scripts/verify-enterprise-phase2-part3b.cjs` | 69/69 passed |
| `scripts/verify-enterprise-phase2-part3b-db.cjs` | ran clean, no assertion failures |
| `scripts/verify-enterprise-phase2-part3c.cjs` | 73/73 passed |
| `scripts/verify-enterprise-phase2-part3d.cjs` | 127/127 passed |
| `scripts/verify-sales-architecture.cjs`, `-phase3`, `-phase4`, `-phase5`, `-phase7` | all passed (30, 32, 21, 59 respectively, plus architecture) |
| `scripts/verify-sales-phase2.cjs` | **could not run** — pre-existing, unrelated: `Cannot find module '../.tmp-phase2-services/routing.js'`, a missing local compiled artifact, not a database or migration issue. Not caused by this remediation; not fixed here (out of scope). |

Full-suite total before this remediation began (this session): 344-353 passed depending on which
fixes had already landed, always with the same 6-test gap in `business-network.integration.test.ts`.
After: 366/366, zero gaps.

## 10. Rollback considerations

If this migration needs to be rolled back: re-running
`20260727060000_commerce_operations_v2`'s original `CREATE OR REPLACE FUNCTION "assign_commerce_numbers"()`
block and re-binding the five triggers to it would restore the previous (broken) state — not
recommended, since that state unconditionally fails every insert into all five tables. A safer
rollback, if ever needed, is a follow-up migration that `DROP`s the five new functions/triggers and
recreates whatever replacement is desired; the five sequences are untouched by either direction, so no
numbering continuity is lost either way. No data migration/backfill is entailed by rollback in either
direction, since (per §8) no row was ever written by the broken trigger for this rollback to reconcile
against.

## 11. Scope discipline

Not touched, per the authorization's explicit safety rules: `reject_commerce_history_mutation()`,
`protect_invoice_snapshot()`, any other frozen migration, any Part 3A/3B/3C/3D model/service/
permission, the `assign_commerce_numbers()` fix's own sibling precedent
(`phase6_*` functions — already correct, left alone), and production (this remediation was validated
against the isolated test database, a disposable clone of the development database, and the real
development database only — never applied to production from this session).
