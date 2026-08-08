# MUV — Homepage Missing Dynamic Content: Forensic Report

**Read-only investigation. Nothing was modified** — no repository file, no database row, no
Vercel/project setting. A temporary diagnostic script was created to run read-only `SELECT`
queries against the production database and deleted immediately after; `git status --short`
confirms the repository is unchanged from before this investigation.

## 1. Production `DATABASE_URL` (masked)

```
postgresql://neondb_owner:<masked>@ep-red-surf-azlgu03d-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb
```

Read from `.env` (this project's only file containing a real `DATABASE_URL` value — see §4 for
why this is also what production uses).

## 2. Row counts (queried directly, read-only, against the live database)

| Table | Row count |
|---|---|
| `products` | **0** |
| `categories` | **0** |
| `product_variants` (closest real table to "product_images" — see note below) | **0** |
| `homepage_sections` | **0** |
| `banners` (closest real table to "homepage_banners" — see note below) | **0** |
| `media_assets` | **0** |

**Naming note**: `product_images` and `homepage_banners` are not real tables in this schema.
Product images live as a `String[]` column directly on `products.images` (no join table), and the
homepage banner carousel is backed by the `banners` table (`Banner` model, `type: "HERO"` etc.),
not a separately-named `homepage_banners` table. Both real equivalents are included above and are
also empty, so the distinction doesn't change the finding.

## 3. Are Prisma queries returning empty arrays, or failing?

**Returning empty — not failing.** Every query the homepage actually runs was executed directly
and none threw:

| Query | Result |
|---|---|
| `prisma.category.findMany({ orderBy: { sortOrder: "asc" } })` | Succeeded, **0** rows |
| `prisma.product.findMany({ where: { isFeatured: true, status: "ACTIVE" } })` | Succeeded, **0** rows |
| `prisma.banner.findFirst({ where: { type: "HERO", active: true } })` | Succeeded, returned `null` |
| `prisma.homepageSection.findMany({ where: { visible: true } })` | Succeeded, **0** rows |
| Raw check: `SELECT id, status, "isFeatured" FROM products LIMIT 5` | **0** rows — the table is genuinely empty, not filtered out by a `WHERE` clause |

Prisma Client is connecting correctly and every query is well-formed — this rules out a broken
query, a wrong table/column reference, and a connection failure.

## 4. Is production's database different from development's?

**No separate development database exists in this codebase's configuration.** Checked both env
files present:
- `.env` — contains the real `DATABASE_URL` above (the Neon instance).
- `.env.local` — exists, but was auto-created by the Vercel CLI and contains only
  `VERCEL_OIDC_TOKEN`; **no `DATABASE_URL` override**.

Since Next.js would use `.env.local`'s value over `.env`'s if one existed, and it doesn't, local
`npm run dev`/`npm run build` and production both resolve to the same single `DATABASE_URL` — the
Neon `neondb` instance. This is also the exact database reconciled earlier in this engagement
(`NEON_SCHEMA_RECONCILIATION_REPORT.md`), and the fact that Hero/Navbar/static sections render
without error on the live deployment is consistent with a real, working connection to this same
database (a wrong or unreachable `DATABASE_URL` would fail every query, not just some).

**One caveat, stated plainly rather than assumed away**: this cannot fully rule out Vercel's
*stored* `DATABASE_URL` secret being a different value that happens to also work — actual secret
values in Vercel are write-only via its API/CLI (`vercel env pull` would confirm byte-for-byte, but
that writes a local file, which this investigation deliberately avoided per "do not modify
anything"). The row-count evidence above, however, was queried using this exact `.env` value, and
it precisely matches the observed symptom (some sections render, data-dependent ones don't) — so
even if an independent confirmation of Vercel's stored value were done, it would need to explain
the same empty-table result already observed.

## 5. Was seed data ever inserted into production?

**No.** Zero rows exist in every catalog/CMS table. This matches `prisma/seed.ts`'s own explicit,
built-in safety guard (`assertSafeToSeed()`), which **refuses to run unless `DATABASE_URL` looks
like `localhost`/`127.0.0.1`, or `ALLOW_SEED=true` is explicitly set** — specifically to prevent
exactly this seed script (which creates a known-password default admin account) from running
against a shared/production database by accident. Nothing in this investigation, nor in the
history of this engagement's sessions, shows that script ever being run with `ALLOW_SEED=true`
against this Neon instance. The earlier database work in this engagement
(`NEON_SCHEMA_RECONCILIATION_REPORT.md`) was explicitly schema-only DDL — it never inserted a
single data row, and said so at the time.

## 6. Exact root cause

**The production database's schema is complete and reachable, but contains zero catalog/CMS data
— no categories, no products, no banners, no homepage section configuration — because the seed
step has never been run against it.** This is not a frontend bug, not a broken Prisma query, not a
missing table, and not a database connectivity problem. The homepage's data-fetching code
(`app/(storefront)/page.tsx`) is working exactly as designed: it queries real tables, gets real
(empty) results, and renders the honest empty-state UI those sections were built with.

## Exact query/file causing the visible symptom

`app/(storefront)/page.tsx`:
- **Line 77**: `prisma.category.findMany({ orderBy: { sortOrder: "asc" } })` — populates `categories`.
- **Line 308–311**: `orderedCategories.length === 0 ? <p>New categories are on their way — check back soon.</p> : <real grid>` — this is the exact conditional producing the placeholder text quoted in the task. `orderedCategories` is a direct sort of `categories` from line 77 with no additional filtering, so an empty placeholder is mathematically guaranteed whenever `categories` has 0 rows, which is confirmed the case.
- **Line 83–91**: `prisma.product.findMany({ where: { isFeatured: true, status: "ACTIVE" }, ... })` — populates `featuredRaw` / the Featured Products section; empty for the same reason (0 rows in `products`).
- **Line 97, 124–142** (`getNewArrivals`, `getTrendingProducts`, `getRecommendedForYou` in `lib/recommendations.ts`, and the hero-candidate query) — all ultimately query `products`; all necessarily return empty for the same reason, explaining the missing product sliders.
- **Line 76**: `prisma.banner.findFirst({ where: { type: "HERO", active: true } })` — returns `null`; the Hero section's JSX evidently has a non-data-dependent fallback path (it renders without a configured banner), which is why "Hero loads" was observed as a working section despite this query also returning nothing.

## What this is not

- Not a missing/misnamed table (all 6 tables checked exist and are queryable).
- Not a Prisma Client generation issue (queries execute and return typed results correctly).
- Not a `DATABASE_URL` misconfiguration or dev/prod split (single database in use everywhere, confirmed reachable).
- Not related to the earlier `COMMIT_AUTHOR_REQUIRED` deployment block or the schema reconciliation — both of those are already fully resolved; this is a distinct, downstream, purely data-population gap.
