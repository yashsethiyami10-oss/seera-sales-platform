# MUV — Premium Care Storefront, Admin, and CMS

One Next.js 15 project. Storefront, authentication, customer account,
admin dashboard, and CMS backend all live here together — this is not a
collection of separate pieces anymore.

## Stack

Next.js 15 (App Router) · TypeScript · PostgreSQL · Prisma · Auth.js
(NextAuth v5) · Tailwind CSS · Server Actions

## Project structure

```
app/                    Route pages (App Router)
  (storefront)/         Homepage, shop, collections, product, cart, checkout
  (auth)/                Login, signup
  account/               Customer dashboard, orders, wishlist, profile
  admin/                 Admin dashboard, products, orders
  api/                   Public read routes + auth + webhooks
  layout.tsx             Root layout — fonts, providers, base metadata
  globals not here       (see styles/)
actions/                 Server Actions — every mutation in the app
  products.ts, orders.ts, payments.ts, shipping.ts, coupons.ts,
  customers.ts, reviews.ts, wishlist.ts, blog.ts, media.ts, cms.ts, auth.ts
components/
  ui/                    Shared primitives (Button, Card, Modal, Toast, Aura…)
  storefront/, checkout/, account/, admin/
lib/                     Everything actions/pages depend on
  auth.ts, prisma.ts, rbac.ts, errors.ts, cache.ts, logger.ts, rate-limit.ts,
  seo.ts, retry.ts, cart-context.tsx, validations/, tax/, payments/,
  shipping/, notify/, messaging/
prisma/
  schema.prisma          Full data model
  seed.ts                Real seed data — run this before anything else
public/
  logo.png               Real static asset (not embedded base64 anywhere)
styles/
  globals.css            The one design-system stylesheet — every page
                          shares this; nothing is redefined per-page
middleware.ts             Route protection for /admin, /account, /checkout
```

## Setup

```bash
npm install
cp .env.example .env       # fill in DATABASE_URL at minimum to start
npx prisma generate
npx prisma db push         # syncs the schema to your database (no migration files)
npm run db:seed            # real categories/products/CMS content/admin user — do this before npm run dev
npm run dev
```

Open `http://localhost:3000`.

`npm run db:seed` creates an admin login at `admin@muv.co.in` / `ChangeMe123`
— change that password immediately in anything beyond local development.

For a production deploy, use `npx prisma migrate dev` (locally, to generate
migration files) and `npx prisma migrate deploy` (in production) instead of
`db push` — `db push` is the fast path for getting a local dev database
running, not how schema changes should reach production. See
`DEPLOYMENT_READINESS.md` for the full checklist.

## What's real right now

Every page under `app/(storefront)`, `app/(auth)`, `app/account`, and the
three pages under `app/admin` reads live data from Postgres via Prisma and
calls the real Server Actions in `actions/` — no mock arrays anywhere in
this project. That includes the full checkout flow through actual Razorpay
`checkout.js` and signature verification, real order cancellation, real
wishlist add/remove, and real product CRUD from the admin panel.

`PROJECT_STATUS.md` is the exact, current list of what's converted to a
real page versus what still only exists as a Server Action with no page
calling it yet (CMS admin pages, marketing/inventory sections, refund and
shipment-tracking UI). Read that before assuming a route exists.

## Other documents in this repo

- **`PROJECT_STATUS.md`** — exactly what's real vs. not yet wired to a page
- **`WIRING.md`** — which Server Action / route backs which piece of UI
- **`AUDIT.md`** — the production-readiness audit (UX, performance, SEO,
  security, code quality, QA) this project was built against
- **`SECURITY.md`** — where CSRF, rate limiting, hashing, and webhook
  verification actually live in the code
- **`DEPLOYMENT_READINESS.md`** — deployment/env/migration/backup/monitoring
  checklists

## Verification performed on this assembly, and its real limit

This project was built and restructured without npm registry access or a
live database in the environment that produced it — meaning `npm install`,
`npx prisma generate`, and `next build` have never actually been run against
it. What was verified, concretely, rather than assumed:

- Every `.ts`/`.tsx` file in the project (100+ files) was parsed with
  `esbuild` after every structural change — zero syntax errors.
- Every `@/...` import in the codebase (226 import statements across 105
  files) was checked programmatically against the actual file tree — every
  single one resolves to a real file. This was a real script, not a visual
  check.
- Every package actually imported anywhere in the source was cross-checked
  against `package.json` — nothing imported is missing from it, and one
  genuinely unused dependency (`recharts` — no chart is rendered anywhere
  in this version of the project) was removed rather than left as dead
  weight.

**What none of that replaces**: real type-checking against the actual
generated Prisma Client types, and a real `next build`. A wrong relation
name in a Prisma query, or a prop-name mismatch that both sides happen to
agree on syntactically, would pass every check above and still fail a real
build. Run `npm install && npx prisma generate && npx tsc --noEmit && npm
run build` as the actual next step — that is the check this environment
could not perform.
