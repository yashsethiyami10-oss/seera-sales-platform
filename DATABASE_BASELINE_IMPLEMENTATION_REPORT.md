# MUV — Database Baseline Implementation Report

## Status: NOT IMPLEMENTED — stopped at Phase 1's own explicit safety gate

Phase 2 ("Consolidated Baseline") was **not executed**. No baseline SQL was generated. No new
migration folder was created. No SQL was applied to Neon. This report exists to explain why,
precisely, rather than silently skip the deliverable.

## Why baseline generation did not proceed

The approved protocol's Phase 1 contains an explicit, unconditional instruction: **"If the
database is not safely empty, STOP."** Phase 1's own read-only inspection (full results in
`NEON_BOOTSTRAP_VERIFICATION_REPORT.md`) found the target Neon database already contains **373
application tables** — including `users`, `products`, `announcement_bar`, and
`finance_bank_accounts`, the exact tables the original Vercel failure named. This directly
contradicts the premise the approved Phase 2 command was built on:

```bash
prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

`--from-empty` computes a diff **as if the target had zero tables**, producing plain `CREATE TABLE`
statements for all 403 tables in `schema.prisma`, with no `IF NOT EXISTS` or collision handling.
Running that script against a database that already has 373 of those 403 tables would fail on the
first statement targeting an already-existing table (Postgres error 42P01's sibling, "relation
already exists") — at best a safe, loud failure; at worst, a temptation to silently patch the
generated SQL to tolerate collisions, which would be executing a materially different, unreviewed
action under the banner of an already-approved one. Neither outcome is acceptable without new,
explicit Founder direction, so generation was not attempted.

## What was verified instead (Phase 1, completed in full)

- Target confirmed as the intended Neon project, not localhost. ✅
- Database inspected read-only (three `SELECT`-only queries via a temporary, now-deleted script —
  no DDL, no `db push`, no migration command). ✅
- Confirmed zero rows in every business/customer/order-relevant table checked (`users`,
  `customers`, `orders`, `products`, `order_items`, `sales_inquiries`) — no real business data is
  at risk regardless of how the schema gap is eventually resolved. ✅
- `_prisma_migrations` fully documented — exactly one dirty row, for
  `20260727000000_sales_architecture_v1`, `finished_at: null`, `applied_steps_count: 0`. ✅
- Full bidirectional schema diff performed: 34 tables genuinely missing from Neon (concentrated in
  the Customer Support module, the Stage 6C Runtime/AI layer, and part of the Knowledge Modeling
  sprint), 5 tables present in Neon but absent from the current `schema.prisma`. ✅

Full detail and the complete missing/orphaned table lists are in `NEON_BOOTSTRAP_VERIFICATION_REPORT.md`
and `DATABASE_MIGRATION_HEALTH_REPORT.md` — not duplicated here.

## What this means for the originally-approved strategy

The strategy itself — "generate one new consolidated baseline" — was correct **for the situation
the forensic audit believed it was solving** (a genuinely empty target). It is the wrong-sized tool
for the situation actually found: a database that is ~92% schema-complete already, missing a
specific, identifiable set of 34 newer tables, plus one bookkeeping record to resolve, plus 5 stray
tables needing a reconciliation decision. `DATABASE_MIGRATION_HEALTH_REPORT.md` describes what a
right-sized fix would look like (a targeted diff-and-reconcile migration, not a from-empty
baseline) — presented there as analysis for Founder review, not executed here, since it is a
different action than what this protocol approved.

## No files were committed under Phase 7

Since Phases 2–6 did not produce a baseline migration, seed run, or verified build, Phase 7's
"commit only targeted, necessary changes" has nothing new to commit beyond this report and its
three companion reports. The 50 existing migration files remain completely untouched, as required.
The one temporary read-only inspection script used for Phase 1 was deleted immediately after use
and was never part of any commit surface.
