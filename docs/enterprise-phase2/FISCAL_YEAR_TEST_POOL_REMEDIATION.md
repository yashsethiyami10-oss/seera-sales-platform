# Part 3C — Fiscal-Year Test-Pool Remediation

## Problem

`__tests__/enterprise-finance/stageA-accounting-core.integration.test.ts` and its siblings
(`stageB-accounts-receivable`, `stageB-accounts-payable`, `stageB-banking`) each post real
`FinanceLedgerEntry` rows against a real `FinanceFiscalYear`. Once posted, these rows are
**permanently immutable by design** — `finance_ledger_entries_immutable` (and the matching triggers
on `finance_journals`/`finance_journal_lines`) fire `BEFORE UPDATE OR DELETE`, rejecting both
operations for *every* client (Prisma, raw SQL, even a superuser `DELETE` statement — confirmed by
reading the trigger definition directly, not assumed). A fiscal year that's ever been used by a test
can never be reclaimed.

Every test file therefore draws from a single shared "future" year pool (2100 upward, chosen to never
collide with real production fiscal years) via `pickUnusedFiscalYear()`, querying the true highest
year already used and picking the next one. This pool is finite — Prisma's query engine cannot
serialize a date past year 9999 (a real, observed driver limitation). Running the test suite against
the same database used for all other dev/manual work meant this pool only ever grew, never shrank. It
was first flagged as "6 years consumed per full suite run, ~111 years headroom" during Part 3C's
original independent audit, and was fully exhausted — highest used year **9997** — during the Phase 2
Governance Verification pass, after the cumulative test runs across this project's entire Founder OS
and MUV AI work.

## Why in-place cleanup was rejected

Investigated and rejected before choosing a fix:

- **Deterministic cleanup / rollback per test file**: not viable for any test that posts a real
  journal (most of Stage A/B do) — the rows literally cannot be deleted once posted, by the same
  trigger that makes them trustworthy in the first place.
- **Wrapping each test file in one outer `$transaction()` rolled back at the end**: would require
  restructuring every `it()` block in several already-large, frozen test files into one sequential
  function body inside a single transaction callback. A large, invasive rewrite of frozen test files,
  not a minimally-bounded fix.
- **Purging existing test residue via SQL**: would require disabling the immutability triggers
  themselves (`ALTER TABLE ... DISABLE TRIGGER` or `session_replication_role = replica`) to force the
  delete through — i.e., temporarily defeating the exact guarantee these tests exist to prove. Not
  done.

## Fix implemented: isolated test database

A second, dedicated Postgres database, `muv_test`, now hosts every automated test run. The dev
database (`muv`) is untouched and keeps its historical fiscal-year usage exactly as it was — nothing
was deleted from it.

### How it was provisioned (one-time)

1. `CREATE DATABASE muv_test;` (via `prisma db execute --file` against the default `postgres`
   database — piping SQL through stdin corrupted it with a BOM in this environment; use `--file`).
2. Schema replicated with `pg_dump --schema-only --no-owner --no-privileges` from `muv`, then restored
   into `muv_test` with `psql`. **Deliberately not `prisma migrate deploy`** — replaying migrations
   into a genuinely empty database failed at the very first migration (`relation "users" does not
   exist"`), revealing this project's migration history was never a complete from-scratch schema
   history (the base schema predates migration adoption). **Also deliberately not `prisma db push`**
   — that would reproduce only what `schema.prisma` declares, silently omitting every hand-written
   trigger/index/FK that exists only in migration SQL (immutability triggers, Part 3D's partial unique
   "one default per owner" indexes, and more) — exactly the guarantees these tests need to be real.
   `pg_dump`/`psql` reproduces the database's actual, real structure, not a theoretical reconstruction
   of it.
3. `_prisma_migrations`' row data (not just its structure) was copied separately from `muv` via
   `pg_dump --data-only --table='"_prisma_migrations"'`, so `prisma migrate status` against `muv_test`
   correctly reports "up to date" without needing to replay history.
4. `npx prisma validate` and `npm run db:seed` run against `muv_test` — confirmed clean.
5. Spot-verified directly against `muv_test`: all 60 `*_immutable` triggers present (including every
   `finance_*` one), and all 3 Part 3D partial unique indexes present
   (`founder_saved_views_one_default_per_owner_surface`,
   `founder_dashboard_layouts_one_active_per_owner`,
   `founder_dashboard_layouts_one_default_per_owner`).

### How every test run now uses it automatically

`__tests__/muv-ai/test-setup.ts` — the one global `setupFiles` entry every test file in the project
already loads — now reads `.env`'s real `DATABASE_URL` directly (via `fs.readFileSync`, not Prisma's
own auto-dotenv, which fires too late — only once a test file's own `@/lib/prisma` import resolves,
after this setup file has already run) and overwrites `process.env.DATABASE_URL` with the `muv_test`
equivalent before any test file's imports resolve. No test file, no `vitest.config.ts` option, and no
`npm` script needed to change. A developer or CI running `npx vitest run` gets the isolated database
automatically; `prisma migrate status`/`db:seed`/every verifier script continue to run against `.env`'s
real `DATABASE_URL` (`muv`) exactly as before, since none of them load this test-only setup file.

### To reset `muv_test` in the future (once its own pool eventually grows large — expected to take
many times longer than the original exhaustion, since it starts from zero rather than from years of
accumulated dev-database usage)

```powershell
psql -U postgres -c "DROP DATABASE muv_test;"
psql -U postgres -c "CREATE DATABASE muv_test;"
pg_dump -U postgres --schema-only --no-owner --no-privileges -d muv -f schema.sql
psql -U postgres -d muv_test -f schema.sql
pg_dump -U postgres --data-only --table='"_prisma_migrations"' -d muv -f migrations.sql
psql -U postgres -d muv_test -f migrations.sql
# then: DATABASE_URL=...muv_test npx prisma validate && npm run db:seed (with DATABASE_URL pointed at muv_test)
```

Unlike the dev database, `muv_test` is fully disposable — there is no frozen production data in it,
so a full drop-and-recreate is always safe.

## Validation performed

- `npx tsc --noEmit` — clean.
- Previously-failing `stageB-accounts-payable.integration.test.ts` — **12/12 passed** against
  `muv_test` (was 12/12 skipped against the exhausted dev pool).
- Full project suite against `muv_test` — **330/336 passed, 6 skipped** in one *different, unrelated*
  file (see "New finding" below) — every Finance and Founder OS test passed, zero skips remaining for
  the fiscal-year reason.
- `scripts/verify-enterprise-phase2-part3c.cjs` (against `muv`, unaffected) — 73/73.
- `scripts/verify-enterprise-phase2-part3b.cjs` (against `muv`, unaffected) — 69/69.

## New finding surfaced by this change (disclosed, not fixed here — out of this remediation's scope)

`__tests__/enterprise-phase2/business-network.integration.test.ts` (Part 3B) now fails its own
`beforeAll` on `muv_test`: `Error: An order is required`. That test assumes a real customer `Order`
row already exists somewhere in whichever database it runs against (for commercial-attribution
calculations) — true on the dev database purely because years of accumulated manual/automated
storefront activity happened to leave `Order` rows there, but never something the test itself created
or guaranteed. `muv_test` is seeded with only catalog/CMS/config baseline data (`npm run db:seed`
creates no `Order` rows) — a fresh, correctly-provisioned database has none, exposing a latent fixture
assumption. This is not a Part 3B production defect (`verify-enterprise-phase2-part3b.cjs` — which
exercises the real business logic independently — still passes 69/69), and it is not related to
fiscal years. Recommended follow-up: have that one test file create its own fixture `Order` in
`beforeAll` rather than assuming one exists. Not done in this pass — outside the fiscal-year
remediation this document covers, and not something to fix silently inside an unrelated authorization.

## Change-control record

Category: **test-infrastructure correction**, per Part 3C's own freeze document's change-control
policy. Scope: `__tests__/muv-ai/test-setup.ts` (new database-selection logic, additive), plus the new
`muv_test` database itself (infrastructure, not application code). **No frozen production file, no
frozen migration, no frozen test file's own logic, and no guard clause was modified.**
`pickUnusedFiscalYear()` in every Finance test file is byte-for-byte unchanged — it now simply always
finds a fresh pool to draw from.
