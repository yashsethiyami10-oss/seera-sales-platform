# MUV — Dirty Migration Resolution Report

Covers Phase 1 ("Dirty Migration Forensics") of the Neon Targeted Schema Reconciliation protocol.

## 1. The exact SQL in `20260727000000_sales_architecture_v1/migration.sql`

Read in full (52 lines). It performs, in order: `ALTER TABLE "users" ADD COLUMN` (4 columns) →
`CREATE TABLE` ×5 (`sales_roles`, `sales_permissions`, `sales_role_permissions`, `territories`,
`sales_audit_logs`) → `ALTER TABLE "users" ADD CONSTRAINT` ×3 (foreign keys) → `CREATE INDEX` ×7 →
`CREATE FUNCTION reject_sales_audit_mutation()` → `CREATE TRIGGER sales_audit_logs_immutable`.

## 2. The dirty row in `_prisma_migrations` (read before resolution)

```json
{
  "migration_name": "20260727000000_sales_architecture_v1",
  "started_at": "2026-08-01T18:11:44.860Z",
  "applied_steps_count": 0,
  "finished_at": null,
  "logs": "...Database error code: 42P01...relation \"users\" does not exist..."
}
```

`applied_steps_count: 0` — Prisma's own migration engine recorded that **zero** of this
migration's statements succeeded through this specific attempt.

## 3. Which statements were actually applied before failure?

**None**, via this failed attempt. Migration transactions fail atomically — the error on
statement 1 (`ALTER TABLE "users"`, at a moment when `users` did not yet exist) rolled back
whatever the transaction had touched. This is confirmed independently by
`applied_steps_count: 0`, not just inferred.

## 4. Does the database already contain the full intended effect of this migration?

**Partially — and this required real investigation, not an assumption.** Direct read-only queries
against Neon found:

| Object this migration would create | Present before reconciliation? |
|---|---|
| `users.salesRoleId` / `territoryId` / `reportingManagerId` / `active` columns | ✅ Yes |
| `sales_roles`, `sales_permissions`, `sales_role_permissions`, `territories`, `sales_audit_logs` tables | ✅ Yes (0 rows each) |
| `users_salesRoleId_fkey` / `users_territoryId_fkey` / `users_reportingManagerId_fkey` and the other 4 named FK constraints | ❌ **No — confirmed absent, by exact name AND by a broader name-agnostic query for any FK on those tables** |
| The 7 named indexes | ❌ **No** |
| `reject_sales_audit_mutation()` function | ❌ **No** |
| `sales_audit_logs_immutable` trigger | ❌ **No** |

A broader check confirmed this wasn't specific to this one migration: **zero foreign keys, zero
non-primary-key indexes, zero triggers, zero custom functions, and zero custom sequences existed
anywhere in the entire Neon public schema** before reconciliation — 373 tables with only bare
columns and primary keys. This means whatever process created the tables (almost certainly
`prisma db push` against a schema.prisma snapshot) created the declarative table/column shape but
none of the relational-integrity layer this migration (and 49 others) separately hand-writes.

## 5. Correct supported Prisma action — determined from actual state, not the failed status alone

Per the explicit instruction not to choose based on failed status alone: a plain `--rolled-back`
would have told Prisma to attempt this migration's SQL again on the next `migrate deploy` — which
would immediately fail again, now with a *different* error (`relation "sales_roles" already
exists`), since the tables this migration creates already exist. A blind `--applied` without
first fixing the missing FKs/indexes/trigger/function would have permanently hidden that real gap
from Prisma's bookkeeping.

**The correct action, and the one taken**: `prisma migrate resolve --applied` — but only *after*
first applying a reconciliation migration (see `NEON_SCHEMA_RECONCILIATION_REPORT.md`) that
genuinely creates the missing FK constraints, indexes, function, and trigger this migration was
always supposed to produce. Once that reconciliation was applied and verified, marking
`20260727000000_sales_architecture_v1` as `--applied` became **accurate**, not a fiction — its
full originally-intended effect now genuinely exists in the database.

## Extending the same logic to the other 49 migrations

The same investigation, generalized: none of the 50 migrations' relational-integrity statements
(FKs, indexes, sequences, functions, triggers, CHECK constraints) existed in Neon, even for the 42
migrations whose tables *did* already exist. This meant `sales_architecture_v1` was never a
special case — it was the first of 50 migrations all in the same situation. Resolving only migration
#1 and then running `migrate deploy` would have caused it to attempt migrations #2–50 next, which
would have failed identically. All 50 existing migrations, plus the new reconciliation migration,
were therefore resolved as `--applied` together, immediately after the reconciliation SQL was
verified to have supplied everything they were collectively missing. Full detail in
`NEON_SCHEMA_RECONCILIATION_REPORT.md` and `DATABASE_FINAL_HEALTH_REPORT.md`.

## Outcome

`npx prisma migrate status` now reports: **"51 migrations found in prisma/migrations... Database
schema is up to date!"** — zero dirty records remain.
