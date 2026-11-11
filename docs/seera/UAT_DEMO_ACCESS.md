# Demo (UAT) logins for Super Stockist / Distributor portals

Field staff want to show a prospect how the Super Stockist and Distributor portals work.
**Do not create demo partners in the production database**: a demo order placed from a demo
S.S./Distributor login goes into the real Accounts queue, real stock and real reports — the
production schema has no "demo" flag that keeps it out.

The safe setup is a separate demo site on its own database:

1. Create a second PostgreSQL database (for example a Neon branch / new project). Never point it at
   the production endpoint — `scripts/seera/production-build-preflight.cjs` refuses that for
   previews anyway.
2. Put its URL in `.env.test` as `TEST_DATABASE_URL=...` and apply the schema:
   `npm run db:test:migrate` (or `npx prisma migrate deploy` with that URL).
3. Seed realistic demo data and logins:
   `npx tsx scripts/seera/seed-integrated-review.ts`
   This creates S.S., distributors, retailers, SKUs, prices, orders and one login per role
   (password `SeeraReview!2026`), including:
   - `review-ss-owner@seera.test` — Super Stockist owner
   - `review-ss-operator@seera.test` — Super Stockist operator
   - `review-distributor-owner@seera.test` — Distributor owner
   - `review-distributor-operator@seera.test` — Distributor operator
   - `review-delivery@seera.test` — Distributor delivery user
   - `review-retailer@seera.test` — Retailer
4. Deploy the app a second time (e.g. a Vercel project or Netlify site named `seera-demo`) with
   `DATABASE_URL` = the demo database and its own `AUTH_SECRET`, and hand executives the demo URL
   plus the logins above. Change the shared password before giving it out.

Re-run step 3 any time to reset the demo data.
