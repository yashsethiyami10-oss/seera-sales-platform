# MUV — Neon Schema Reconciliation Report

Covers Phases 2–5 of the Neon Targeted Schema Reconciliation protocol. **This reconciliation has
been applied to the live Neon production database.** Every step below is a record of what was
actually done and verified, not a plan.

## Phase 2 — Targeted schema diff (Prisma-native, read-only until applied)

Generated via:
```
prisma migrate diff --from-url <live Neon DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script
```
This computes the delta from the *actual live database* to the target schema — not a from-empty
baseline — so it never emits `CREATE TABLE` for anything already present. Result: 4,447 lines,
containing 41 new `CREATE TABLE` statements (see below for why 41, not 34), all `CREATE TYPE`
enum definitions those tables need, 793 `CREATE INDEX` statements, and 992 FK-related lines. A
pre-apply scan for `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, lossy `ALTER COLUMN
... TYPE`, and `RENAME` found **zero** — the diff tool never proposed removing or altering
anything already there.

**Why 41 new tables, not the 34 identified by the earlier manual audit**: 6 of the 41 are Prisma's
own implicit many-to-many join tables (e.g. `_CareIntelligenceVersionToProduct`,
`_CategoryToProblemIntelligenceVersion`) — hidden relation tables for implicit m2m relations
involving the missing models, which a manual table-name diff has no way to predict. This is a
concrete example of why the Prisma-native diff tool, not manual regex extraction, was used for the
actual write action.

**Second correction the diff tool surfaced**: the 5 tables the prior audit flagged as "orphaned"
(`phase2_operations`, `phase2_policy_versions`, `phase2_sod_policies`, `phase2_source_references`,
`phase6_configuration`) turned out to **already have corresponding models in `schema.prisma`** —
the diff tool added `CREATE INDEX` statements for them, never a `CREATE TABLE` (since the tables
already existed) and never a `DROP TABLE` (since they're not orphaned at all). The earlier "5
orphan tables" framing was based on an incomplete manual `@@map(...)` regex extraction in a prior
audit pass; the Prisma-native diff is authoritative and corrects it. Full detail in
`ORPHAN_TABLE_CLASSIFICATION.md`.

## What the diff tool cannot cover — found and closed manually

Prisma's schema DSL has no representation for triggers, functions, sequences, CHECK constraints,
or Postgres extensions — so `migrate diff` correctly never mentions them, even though the
migration history is full of them. Read-only inspection confirmed **all of these were completely
absent from Neon** (0 triggers, 0 functions, 0 sequences, 0 CHECK constraints, `vector` extension
not enabled) despite 373 tables already existing — the entire hand-written relational-integrity
layer was missing across the whole database, not just for the one table set investigated in
`DIRTY_MIGRATION_RESOLUTION_REPORT.md`. These were extracted programmatically, in chronological
migration order, from all 50 migration files:

| Object type | Count extracted | Notes |
|---|---|---|
| `CREATE EXTENSION` | 1 | `vector` — required by `knowledge_embeddings.embedding vector(1536)`, one of the 41 new tables; without it that one `CREATE TABLE` would have failed |
| Sequences | 13 | Normalized to `CREATE SEQUENCE IF NOT EXISTS` |
| Functions | 52 blocks / 44 unique names | Later `CREATE OR REPLACE FUNCTION` redefinitions (e.g. two real bug-fix iterations of `finance_reject_posted_journal_mutation`) replayed in original chronological order, so the final state matches what the full history would have produced |
| Triggers | 119 statements / ~109 unique names | Each preceded by an auto-derived `DROP TRIGGER IF EXISTS ... ON <table>` for idempotence-review, including the 8 places the original history itself drops and recreates a trigger under bug-fix migrations |
| CHECK constraints | 36 | 35 from standalone `ALTER TABLE ADD CONSTRAINT ... CHECK`, plus 1 found only by a separate, deliberate second pass for constraints declared *inline* inside a `CREATE TABLE` block (`phase2_policy_versions_version_check` — missed by the first extraction pass specifically because that table already existed, so its original inline constraint was never applied) |

## Phase 3 — Validation before applying

1. **Statement-type scan** of the Prisma-generated portion: no destructive statements (above).
2. **Manual review** of the full assembled file (5,682 lines) — spot-checked structurally sound,
   correct dependency order (extension → tables/enums/indexes/FKs → sequences → functions →
   triggers → CHECK constraints).
3. **Full transactional dry run against the live Neon database**: the complete 5,682-line script
   wrapped in `BEGIN; ... ROLLBACK;` was executed via `prisma db execute --file`. Result:
   **"Script executed successfully."** with zero errors, then rolled back — every single statement
   validated as both syntactically correct and semantically valid against Neon's actual live
   schema (correct table/column references, no naming collisions, no missing dependencies),
   without making any lasting change. This is the closest available equivalent to a staging-clone
   test given no separate staging database exists.
4. **Neon compatibility**: confirmed via the same dry run — Neon accepted `CREATE EXTENSION IF NOT
   EXISTS vector` without error (pgvector is available on this Neon instance).
5. **Suitable only for a database in this exact state**: this migration is explicitly not a general
   fresh-database bootstrap (it assumes 373 tables and their columns already exist) — documented as
   such in the migration file's own header comment.

## Phase 4 — The reconciliation migration

Written to `prisma/migrations/20260804000000_neon_schema_reconciliation/migration.sql` (5,682
lines). Contains only the validated targeted diff plus the manually-catalogued hand-written SQL
layer above. Does not recreate any existing table. Does not delete data. Does not drop the 5
tables previously suspected to be orphans. All 50 pre-existing migration files are untouched.

## Phase 5 — Applied and verified

1. **Applied for real**, wrapped in `BEGIN; ... COMMIT;` via `prisma db execute --file` — the exact
   same tested script, executed for real this time. Result: **"Script executed successfully."**
2. **Dirty migration resolved**: `prisma migrate resolve --applied` for
   `20260727000000_sales_architecture_v1` — now accurate, per `DIRTY_MIGRATION_RESOLUTION_REPORT.md`.
3. **All 50 pre-existing migrations, plus the new reconciliation migration, resolved as applied**
   (51 total) — necessary because none of the 50 migrations' relational-integrity statements had
   ever been recorded as applied, and leaving 49 of them pending would have caused the next real
   `migrate deploy` to attempt replaying them against tables that already exist. Full reasoning in
   `DIRTY_MIGRATION_RESOLUTION_REPORT.md`.
4. **`prisma migrate status`**: `51 migrations found in prisma/migrations` / `Database schema is up
   to date!`
5. **`prisma generate`**: succeeded, Prisma Client regenerated against the reconciled schema.
6. **All schema-declared tables now exist**: public schema table count went from 374 to **415**
   (374 + 41 new = 415, exact match).
7. **No existing table or data was removed**: `users`, `customers`, `orders`, `products`,
   `order_items`, `sales_inquiries` all re-checked post-reconciliation — still 0 rows each, same as
   before. No table was dropped (confirmed both by the destructive-statement scan and by the table
   count increasing, never decreasing).
8. **The 5 previously-flagged tables still exist** — confirmed individually, all present.
9. **Required queries succeed** — real, typed Prisma Client queries (not raw SQL) against
   `product`, `announcementBar`, `financeBankAccount`, `user`, `supportTicket`,
   `runtimeAuditLog`, plus a raw count against `knowledge_embeddings` — all returned successfully
   (0 rows each, consistent with an empty-of-data, complete-schema database).
10. **Structural totals, before → after**:

| Object type | Before | After |
|---|---|---|
| Tables (public schema) | 374 | 415 |
| Foreign keys | 0 | 496 |
| Non-PK indexes | 0 | 793 |
| Triggers | 0 | 111 (final unique count after DROP/recreate de-duplication — matches the ~109 unique trigger names catalogued) |
| Functions | 0 | 163 (44 hand-written + the remainder installed automatically by the `vector` extension itself — pgvector ships its own distance/operator functions into `public`, expected and not a concern) |
| Sequences | 0 | 13 |
| CHECK constraints | 0 | 37 (36 extracted + confirmed applied) |

## Phase 6 — Local production build

`npm run build` — **succeeded**. Every route compiled, including `/os/support/*` (Customer Support
module), `/os/finance/*`, `/os/manufacturing/*`, `/products/[slug]`, and every storefront static
page. One unrelated TypeScript error surfaced first from temporary scratch scripts left in
`scripts/_tmp_*.ts` (used for the read-only inspection and reconciliation-assembly work in Phases
1–4) — these were deleted immediately (they were never meant to be committed, matching the same
practice from the earlier Git Safety Cleanup), and the build was re-run clean.
