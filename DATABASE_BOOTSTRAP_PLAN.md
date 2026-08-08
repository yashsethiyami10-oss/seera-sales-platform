# MUV — Database Bootstrap Plan

**PLAN ONLY. Nothing below has been executed.** Companion to `DATABASE_MIGRATION_FORENSIC_AUDIT.md`
(read that first for the evidence this plan is built on). Every command in this document requires
explicit, separate Founder approval before anything runs — per the protocol's own "Stop after the
audit. Do not execute the recommended plan" instruction.

## The one recommended strategy: a new consolidated baseline migration for fresh environments

**Do not** attempt to fix this by reordering the 50 existing migrations (§4 of the audit already
shows no ordering fixes it — the `CREATE TABLE` statements for the 86 missing tables don't exist
anywhere to reorder). **Do not** run `prisma db push` against Neon (this is exactly the practice
that caused the defect, and CLAUDE.md itself already prohibits `db push` in production). **Do not**
run `migrate reset` (destroys the ability to compare against what's already there, and is
unnecessary — see below). **Do not** silently `migrate resolve --applied` past the failure without
first actually creating the missing tables (that would leave Neon's schema permanently incomplete
while telling Prisma everything is fine).

The one safe path: **generate one new migration that represents the complete, current
`prisma/schema.prisma` from nothing, apply it directly to the (currently empty of application
tables) Neon database, and only then tell Prisma's bookkeeping that this environment is caught up.**
This is Prisma's own documented pattern for "baselining an environment" — it exists precisely for
a broken/incomplete migration history meeting a target database that has none of that history's
assumed prior state.

### Why this is safe specifically for Neon right now

Per the forensic audit, migration #1 of 50 failed on its very first statement
(`ALTER TABLE "users"`). `migrate deploy` applies migrations strictly in order and stops on first
failure — so no migration after #1 ever ran. Neon's `neondb` should therefore contain, at most,
Prisma's own `_prisma_migrations` bookkeeping table plus one dirty row for the failed attempt, and
**no application tables at all**. This should be confirmed (see Step 1 below) before proceeding,
but if confirmed, there is no real data at risk in Neon — only bookkeeping state.

### Why the 50 existing migration files must NOT be deleted or rewritten

They remain the accurate, working history for any database that already has the pre-existing base
tables from prior `db push` usage (any existing local/dev Postgres this team already works
against day to day). Deleting or editing them would break `migrate dev`/`migrate deploy` for those
already-functioning environments. The new baseline is **additive** — a new starting point for
*new* environments only, sitting alongside the existing history, not replacing it.

## Exact ordered commands — for Founder-approved execution only, not run in this audit

**Step 0 — safety precondition, read before anything else.** `.env`'s `DATABASE_URL` currently
points directly at this Neon instance. Every command below that touches a database must be run
with deliberate, verified `DATABASE_URL` — confirm which target you're pointed at immediately
before every single command in this sequence, especially before Step 4.

**Step 1 — confirm Neon is actually empty of application tables (read-only).**
```bash
npx prisma migrate status
```
This reads `_prisma_migrations` bookkeeping only — it does not write anything. Expected output:
one migration (`20260727000000_sales_architecture_v1`) shown as failed/not fully applied, zero
others applied. If this shows anything unexpected (more migrations marked applied, or evidence of
partial application beyond the `users` ALTER), stop and re-audit before continuing — the plan below
assumes Neon is otherwise empty.

**Step 2 — clear the one dirty migration record.**
```bash
npx prisma migrate resolve --rolled-back "20260727000000_sales_architecture_v1"
```
This tells Prisma "this migration's partial effect should be treated as not applied" — appropriate
here since its only statement (`ALTER TABLE "users"`) necessarily failed with no schema effect
(the table it targeted doesn't exist, so there was nothing to partially alter). This is the same
class of command the audit itself was explicitly told not to run — it is listed here as part of the
*plan* for later approval, not executed now.

**Step 3 — generate the full baseline SQL from the current schema.**
```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/<TIMESTAMP>_baseline_consolidated/migration.sql
```
(Create the folder first: `mkdir prisma/migrations/<TIMESTAMP>_baseline_consolidated`, using a
timestamp *later* than all 50 existing folders so it sorts after them if `migrate dev` is ever run
locally against a database that already has the old history applied — the folder name is otherwise
Prisma's own convention.) This produces one script containing every `CREATE TABLE`, `CREATE INDEX`,
`CREATE TYPE`, and constraint for all 408 models — including the 86 currently missing and the 322
already covered by the existing 50 migrations. Review this generated file before Step 4 — confirm
it contains `CREATE TABLE "users"`, `CREATE TABLE "products"`, and `CREATE TABLE "announcement_bar"`
specifically, as a direct check that the three named tables from the audit are now covered.

**Step 4 — apply the baseline to Neon.**
```bash
npx prisma migrate deploy
```
With Neon now clean (Step 2) and the new baseline migration present as the only pending migration
Prisma will find for this history, `migrate deploy` applies it directly — no `db push`, no manual
SQL execution outside Prisma's own tooling.

**Step 5 — verify.**
```bash
npx prisma migrate status
npx prisma generate
npx tsc --noEmit
npm run build
```
`migrate status` should report "Database schema is up to date." The build check specifically closes
the loop on the original symptom (Vercel build failing on `products`/`announcement_bar`/
`finance_bank_accounts` not existing).

**Step 6 — seed only if intentional.** `prisma/seed.ts` already refuses to run against a
non-`localhost` `DATABASE_URL` unless `ALLOW_SEED=true` is explicitly set — this is an existing,
correct safety guard (it creates a known-password default admin account). Do not override it as a
reflex; decide deliberately whether this Neon database should start with seed/demo data or a real
empty catalog, per `PRE_LAUNCH_CHECKLIST.md`'s own framing of that same decision.

**Step 7 — redeploy on Vercel.** Only after Steps 1–5 are confirmed clean.

## Task 13 — what happens to the existing migration history

- **The 50 existing migration files: remain unchanged, permanently.** They are not deleted, not
  edited, not renamed. They stay in git as the accurate record for any environment that already has
  the pre-existing base tables.
- **A new baseline is added** (Step 3 above) — this is additive, not a replacement.
- **Fresh environments going forward** (this Neon database, any future staging/CI database) should
  be bootstrapped starting from the new baseline, not from migration #1 of the original 50 — the
  practical effect is that this repository now has two valid starting points depending on which
  database you're targeting: pre-existing environments keep using the original 50 from wherever
  they currently are; brand-new environments start from the baseline. This dual-timeline reality is
  an unavoidable, direct consequence of not rewriting history that already-working databases
  depend on — it is not a shortcut, it is the standard, documented way Prisma expects this exact
  situation to be handled.
- **Process fix, not just a technical one**: the actual root cause (§7 of the audit) is `db push`
  being used for new-table creation throughout this project's life, not just once at the start.
  Applying this bootstrap plan fixes today's blocker but does not prevent recurrence — recommend a
  standing rule that any new Prisma model change goes through `prisma migrate dev` (generating a
  real migration file) before it's considered done, with `db push` reserved strictly for scratch/
  throwaway local experimentation, matching what CLAUDE.md already says for production but
  extending the same discipline to local development.

## Task 14 — risks

| Area | Risk | Mitigation already reflected in this plan |
|---|---|---|
| **Localhost data** | Any existing local dev Postgres that already has the base tables (from historical `db push`) would break or duplicate state if the new baseline script were ever run against it | Baseline is only ever applied to a *confirmed-empty* target (Step 1's check); never run Step 3/4 against a `DATABASE_URL` pointing at an existing populated database |
| **Production (Neon) data** | Currently low — Neon holds no real application data yet (migration #1 failed before creating anything) — but `.env` already points live at this instance, so any careless local command run without checking `DATABASE_URL` first could act against it | Step 0's explicit precondition; every step above assumes deliberate `DATABASE_URL` verification immediately before running it |
| **Git history** | Rewriting or deleting the 50 existing migration files would break any collaborator/environment relying on them, and would erase real project history | Plan explicitly keeps all 50 files unchanged; baseline is additive only |
| **Vercel** | Every deploy will keep failing with the same missing-table errors until this plan is executed — no data-loss risk from that (a failed build touches nothing), but it blocks any progress until resolved | Plan sequences Vercel redeploy as the last step, after local verification |
| **Future migrations** | Without a process change, the same `db push`-for-new-tables habit recurs and a future fresh environment hits an equivalent gap again | Process recommendation included above, not just the one-time technical fix |

---

## FINAL VERDICT

# NOT READY — MIGRATION HISTORY REPAIR REQUIRED

Remaining blockers, all of which this plan addresses but none of which have been executed:

1. 86 tables declared in `prisma/schema.prisma` — including `users`, `products`,
   `announcement_bar`, and 83 others — have no `CREATE TABLE` statement anywhere in the 50-migration
   history.
2. Neon's `_prisma_migrations` table almost certainly holds one dirty/failed row for
   `20260727000000_sales_architecture_v1` that must be resolved before any further migration can be
   applied (P3018's documented behavior).
3. No baseline migration capturing the complete current schema has been generated yet.

Once the plan above is executed and independently verified (Step 5), re-run this audit's checks —
specifically §2–§3 and §6 of `DATABASE_MIGRATION_FORENSIC_AUDIT.md` — against the new baseline
migration to confirm all 86 previously-missing tables are now present, before considering Vercel
redeployment final.
