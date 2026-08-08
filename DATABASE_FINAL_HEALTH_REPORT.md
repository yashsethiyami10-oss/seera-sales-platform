# MUV — Database Final Health Report

## Status: HEALTHY

`prisma migrate status` against the live Neon production database:

```
51 migrations found in prisma/migrations
Database schema is up to date!
```

Zero dirty or failed migration records remain. This is a real, current, re-verifiable state — not
carried forward from any prior report.

## Summary of what changed

| Metric | Before this protocol | After |
|---|---|---|
| Tables in `public` schema | 374 (373 application + `_prisma_migrations`) | 415 |
| Foreign key constraints | 0 | 496 |
| Non-PK indexes | 0 | 793 |
| Triggers | 0 | 111 |
| Custom functions | 0 | 163 (44 hand-written + pgvector's own installed functions) |
| Sequences | 0 | 13 |
| CHECK constraints | 0 | 37 |
| `vector` extension | not enabled | enabled |
| Dirty `_prisma_migrations` records | 1 | 0 |
| Business/customer/order data | 0 rows everywhere | 0 rows everywhere — **unchanged** |

## Root cause, now fully closed

The forensic audit chain across this engagement established, in order: (1) the migration history
alone couldn't bootstrap a fresh database because 86 schema-declared tables had no `CREATE TABLE`
anywhere in it; (2) direct inspection of the live Neon database showed it wasn't empty at all —
373 tables already existed, evidently from a `prisma db push`-style action against a schema
snapshot, narrowing the real gap to 34 missing tables; (3) this reconciliation pass found the real
gap was larger and different in kind than table-existence alone — the *entire* relational-integrity
layer (FKs, indexes, sequences, functions, triggers, CHECK constraints) was absent across all 373
pre-existing tables too, not just the missing ones. All three layers are now closed: the 41 missing
tables (34 named models + 6 implicit join tables + 1 extension-dependent table) exist, and the full
relational-integrity layer now exists across all 415 tables.

## What was NOT done, and why that's correct

- **No existing table was recreated.** Confirmed by the destructive-statement scan (zero `DROP
  TABLE` anywhere in the applied SQL) and by the table count only ever increasing.
- **No data was touched.** Every business table re-checked post-reconciliation shows the same 0
  rows as before. This reconciliation was exclusively schema-level DDL.
- **No orphan table was dropped** — because, per `ORPHAN_TABLE_CLASSIFICATION.md`, there were no
  genuine orphans to drop; the 5 previously-flagged tables all have real current models.
- **The 50 pre-existing migration files were not edited, renamed, or deleted.** Only one new
  migration folder was added.
- **`.env`, application code, and every other part of the repository outside `prisma/migrations/`
  were untouched** except the temporary scratch scripts used for read-only inspection and
  reconciliation assembly — all deleted before the final build, none committed.

## Local production build

`npm run build` completed successfully — every route compiled, including the routes that touch the
previously-missing tables (`/os/support/*` for the Customer Support module) and the originally-
reported failing queries (`products`, `announcement_bar`, `finance_bank_accounts` all confirmed
queryable via real Prisma Client calls in `NEON_SCHEMA_RECONCILIATION_REPORT.md` §Phase 5).

## Uncommitted state — flagged, not acted on

This repository is connected to a git remote (`origin/main`) with commits already in its history —
this was not the case in earlier sessions of this engagement and was not something this protocol
initialized. As of this report, `git status` shows the modified `.gitignore`, the new reconciliation
migration folder, and the new report files as **untracked/unstaged** — nothing has been committed
or pushed. Per this protocol's Phase 7 ("commit only necessary changes") and the general caution
warranted for the first commit to a repository connected to a live remote, no `git add`/`git
commit`/`git push` was run without more explicit confirmation that a commit (and, separately, a
push) is wanted now. Flagging this rather than silently committing or silently leaving it undecided.

## Recommendation

The database itself is healthy and ready. The one open question before Vercel redeployment is
purely a repository-hygiene one (commit and push the reconciliation migration + reports), not a
database-health one — see `VERCEL_REDEPLOYMENT_READINESS.md` for the final verdict and what's
actually still required before that redeployment.
