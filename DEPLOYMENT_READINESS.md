# MUV — Deployment Readiness

Companion to `AUDIT.md`. That document says what's wrong; this one says
what to do, in order, to actually deploy.

---

## 1. Production Deployment Checklist

**Before first deploy:**
- [ ] Address `AUDIT.md` Finding 0 — convert the `.jsx` files into real
  `app/` route pages, wired to the Server Actions/API routes per
  `WIRING.md`. Nothing else on this checklist matters until this is done.
- [ ] `npm install` for real (this project has never had a real
  `node_modules` — every check so far used hand-written stubs)
- [ ] `npx prisma generate` against the real schema
- [ ] `npx prisma migrate deploy` against the production database (see
  Migration Checklist below — never `migrate dev` in production)
- [ ] Run `tsc --noEmit` for real, with real types — this project's own
  verification notes are explicit that the stub-based checks used
  throughout can't catch a real Prisma relation typo
- [ ] Run `next build` and inspect the output for bundle size warnings,
  especially around `recharts` (admin-only, confirm it's not in the
  customer-facing bundle)
- [ ] Every environment variable in the checklist below is set in the
  hosting platform (not just `.env.example`)
- [ ] Razorpay account is in **live mode**, not test mode, with live keys
  in production env vars only
- [ ] Shipping provider account (whichever `SHIPPING_PROVIDER` is set to)
  has a real pickup location configured on their side — `requestPickup`
  cannot work without one
- [ ] At least one WhatsApp template (if `MESSAGING_PROVIDER` sends
  WhatsApp) is submitted and **approved** by Meta/the provider — templates
  referenced in code (e.g. `"order_shipped"`) do not exist until approved
- [ ] Webhook URLs registered in both the Razorpay dashboard and each
  shipping provider's dashboard, pointing at the production domain
  (`https://yourdomain.com/api/webhooks/razorpay`,
  `.../api/webhooks/shipping/shiprocket`, etc.) — not localhost
- [ ] `robots.ts`/`sitemap.ts` verified live at `/robots.txt` and
  `/sitemap.xml` after deploy
- [ ] Rate limiter confirmed working (attempt 6 failed logins in a row,
  confirm the 6th is blocked) — and confirmed this is on the list to
  replace with Redis before any second instance/region is added

**Immediately after first deploy:**
- [ ] Place one real test order end-to-end (COD) and one real test order
  with a live-mode small-value Razorpay payment, refund it immediately
- [ ] Confirm the order-confirmation email actually arrives (not just that
  the Server Action returned success)
- [ ] Confirm a webhook actually reaches the deployed webhook URL (check
  `NotificationLog`/logs for the event, not just the provider dashboard's
  "sent" status)

---

## 2. Environment Variables Checklist

37 variables exist in `.env.example` today, grouped by what breaks if
they're missing:

| Group | Vars | If missing |
|---|---|---|
| Database | `DATABASE_URL` | App doesn't start |
| Auth | `AUTH_SECRET`, `NEXTAUTH_URL` | NextAuth throws on boot (by design) |
| OAuth (optional) | `GOOGLE_CLIENT_ID/SECRET` | Google login silently unavailable, not a crash |
| Site | `NEXT_PUBLIC_SITE_URL` | Emails/sitemap/OG tags get wrong/empty URLs |
| Tax | `MUV_GSTIN` | Invoices show `GSTIN_NOT_CONFIGURED` — **must** be set before any real invoice is issued |
| Payments | `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Checkout can't create orders; webhook verification fails closed (rejects everything) |
| Email | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | Every transactional email throws (caught, logged, never blocks the underlying order/payment — but customers get zero emails) |
| Shipping | `SHIPPING_PROVIDER` + that provider's specific keys, `WAREHOUSE_*` | Rate calculation and fulfillment throw |
| Messaging | `MESSAGING_PROVIDER` + that provider's specific keys | SMS/WhatsApp sends throw (caught, logged, non-blocking) |

**Secret management:**
- [ ] Never commit `.env` — only `.env.example` (with empty values) belongs
  in version control
- [ ] Use the hosting platform's secret manager (Vercel env vars, or a real
  secrets manager for other hosts) — not a `.env` file uploaded manually
- [ ] `AUTH_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and
  every provider API key are **server-only** — confirm none are ever
  prefixed `NEXT_PUBLIC_` except the one deliberate exception
  (`NEXT_PUBLIC_RAZORPAY_KEY_ID`, which Razorpay's own client-side script
  needs)
- [ ] Rotate `AUTH_SECRET` only with a plan for what happens to existing
  sessions (rotating it invalidates every logged-in session immediately)

---

## 3. Database Migration Checklist

- [ ] Every schema change goes through `prisma migrate dev` locally first
  (generates a migration file), never hand-edited SQL against production
- [ ] `prisma migrate deploy` (not `migrate dev`) is the only command that
  ever runs against production — `dev` can drop/reset data, `deploy` only
  applies pending migrations
- [ ] Migrations are checked into version control — the migration history
  is itself the audit trail of schema changes
- [ ] Before any migration that changes an existing column's type or
  constraints (not just adds new nullable columns), test it against a copy
  of production data, not just an empty dev database
- [ ] `prisma/seed.ts` doesn't exist yet (noted in `README.md`) — before
  launch, decide whether categories/initial coupons/admin users need
  seeding, and write it before the first deploy rather than creating
  production data by hand through the admin UI
- [ ] Connection pooling: confirm `DATABASE_URL` goes through a pooler
  (Prisma Accelerate, PgBouncer, or the hosting platform's built-in pooler)
  before this runs as a serverless function at any real concurrency —
  direct Postgres connections don't scale under serverless's connect-per-
  invocation pattern

---

## 4. Backup Strategy

Nothing in this project implements backups — this is infrastructure
configuration on whichever Postgres host is chosen, not application code.
Concretely:
- [ ] Automated daily backups enabled at the database host level (every
  managed Postgres provider — RDS, Supabase, Neon, Railway — has this as a
  toggle, not custom code)
- [ ] Point-in-time recovery (PITR) enabled if the host supports it —
  daily backups alone mean losing up to 24 hours of orders in a failure
- [ ] Backup retention: minimum 30 days for a launch, longer once real
  order volume exists (financial/tax records typically need longer retention
  — confirm against India's actual GST record-keeping requirements before
  finalizing, that's a compliance question, not an engineering one)
- [ ] At least one **restore drill** before launch — an untested backup is
  a hope, not a backup. Restore to a scratch database and confirm the app
  can actually read from it.
- [ ] `MediaAsset` records point at external storage (S3/Cloudinary/Vercel
  Blob) — that storage needs its own backup/versioning policy, separate
  from the Postgres backup; a database restore doesn't bring back deleted
  files if the storage provider doesn't retain them too

---

## 5. Monitoring Strategy

Nothing in this codebase implements monitoring beyond `lib/logger.ts`'s
structured stdout lines — this section is what to point at that output:
- [ ] Pipe stdout logs to a real aggregator (Vercel's own log drain,
  Datadog, Axiom) — `lib/logger.ts` already says this explicitly; this is
  the actual step, not just the placeholder acknowledging it's needed
- [ ] Route `logger.error` calls to an exception tracker (Sentry) — every
  `logger.error("payment:...")`, `("webhook:...")`, `("notify:...")` call
  site in the codebase is a real signal worth alerting on, not just logging
- [ ] Uptime monitoring on at least: the homepage, `/api/products`, and
  both webhook endpoints (a webhook silently failing is invisible unless
  something actively checks it responds)
- [ ] Alert on `NotificationLog` rows with `status: FAILED` accumulating —
  that table already exists specifically to make failed
  email/SMS/WhatsApp sends queryable; nothing currently alerts on it
- [ ] Alert on `PaymentAttempt` rows stuck in `CREATED` past a few hours —
  the same abandoned-payment signal the scheduled-cleanup job (not yet
  built, see `AUDIT.md`) would also use
- [ ] Track Core Web Vitals in production (Vercel Analytics or
  `next/web-vitals` reporting) — everything in `AUDIT.md`'s Performance
  section was necessarily component-level; real CWV numbers only exist
  once real traffic hits a real deployment

## 6. Logging Strategy

`lib/logger.ts` already establishes the pattern — this is what to keep
consistent as the app grows:
- Every external-service call site (payments, shipping, notifications) logs
  both the attempt and the outcome, with enough context (`orderId`,
  provider name) to trace one order's full lifecycle across log lines
- Every Server Action failure returns a structured error to the client
  (`lib/errors.ts`) **and** logs the same failure server-side — the client
  never sees a stack trace, but nothing is silently swallowed either
- `NotificationLog` and `StockHistory` are already durable, queryable logs
  in Postgres, not just stdout lines — prefer querying those tables over
  grepping logs for anything related to notifications or inventory changes
- As the team grows: add request-ID correlation (a single ID threaded
  through one request's log lines) if debugging across concurrent requests
  becomes hard to follow in raw stdout

## 7. Disaster Recovery Checklist

- [ ] Documented runbook for "Razorpay is down" — orders should still be
  placeable as COD; confirm the storefront actually degrades gracefully
  rather than showing a broken payment step (untestable without a real
  frontend integration, flagged again here because it matters for DR
  specifically)
- [ ] Documented runbook for "database is down" — what does the customer
  see? Confirm error boundaries exist once real pages exist; a raw 500 page
  is not acceptable for a storefront
- [ ] Documented runbook for "a shipping webhook stops arriving" —
  `syncShipmentTracking` (in `app/actions/shipping.ts`) exists as a polling
  fallback specifically for this; confirm something actually calls it on a
  schedule, since nothing currently does (same missing-cron gap as the
  abandoned-payment cleanup)
- [ ] Confirm the restore drill from the Backup Strategy section is
  re-run periodically (quarterly is reasonable), not just once before
  launch — a restore process that worked once and was never tested again
  is exactly the kind of thing that silently breaks after an infra change
- [ ] Incident communication plan: who gets paged, who updates customers if
  checkout is down — this is a people/process question this audit can
  identify the need for but can't answer on the team's behalf
