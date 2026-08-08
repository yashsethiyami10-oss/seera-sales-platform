# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MUV Knowledge Book — Project Constitution (read this section first)

The approved files listed below form the **MUV Knowledge Book**. The MUV Knowledge Book is the
**supreme constitution and single source of strategic truth** for this project — for the website,
content, design, product, AI, institutional sales, CRM, sales dashboard, workflow, and every future
system decision.

**Approved constitution files (current, actual locations):**
- `.claude/docs/MUV_Knowledge/MUV KNOWLEDGE LIBRARY MASTER.txt` — *MUV Knowledge Library™ — The
  Complete Founder Edition — Master Edition 1.0*. Unifies 14 source volumes (Parts I–XIV: Philosophy/
  Darshan, Enterprise Operating System, Brand, Design, Product, Manufacturing, Marketing, Sales &
  Distribution, Customer Experience, Expansion/Franchise, People & Culture, Technology/Digital/AI,
  Finance, Capital) into one continuous manuscript with a Master Index and Master Glossary. This is
  the primary constitution document.
- `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` — *Muv AI Sutra™ — The Intelligence
  Constitution of Muv*, Volume I — Foundation (Chapters 1–12). Self-labeled **"Living Master —
  Version 1.1 Corrected (Canonical Draft)"** — treat its draft status as a real open question, not a
  formality, until the Founder confirms it is approved (see Known Conflicts below).
- Authoritative index (new, does not restate content): `docs/MUV_Knowledge/MUV_KNOWLEDGE_INDEX.md`.

**Path note:** these two files physically live under `.claude/docs/MUV_Knowledge/`, not under a
repo-root `/docs/MUV_Knowledge/`. A repo-root `docs/MUV_Knowledge/` folder now exists but currently
contains only the index file — the two constitution files themselves have **not** been moved there.
Do not assume they've been relocated; do not move them without explicit approval (see
`MUV_PHASE1_KNOWLEDGE_AUDIT.md` for the full reasoning).

**Known conflict — do not silently resolve:** the Master Founder Edition's own Part XII (Chapters
58–64, sourced from "Volume XII — MUV Technology & Digital Ecosystem™") already covers AI systems
and intelligent automation, and contains **zero references** to the separate Muv AI Sutra™ file
(confirmed by direct search — no match for "AI Sutra" anywhere in the Master file). The relationship
is **partially, not fully, declared**: the Muv AI Sutra™ itself repeatedly (13 times) names "the MUV
Knowledge Library™" as the one canonical source every AI capability must retrieve from and defer to
(see its own §4.2 "One Source of Truth" / §4.3 "The MUV Knowledge Library™" / §5.4 "Retrieval"), so
in that direction the Sutra treats the Library as senior. But neither file states how the Sutra's
12 chapters relate specifically to Part XII's 7 chapters (duplicate? supersede? extend?), and the
Library never acknowledges the Sutra existing at all. If a task requires AI-domain guidance and the
two documents would point in different directions, stop and report the conflict — do not guess which
one wins.

**Binding rules:**
1. Existing code, comments, prior prompts, or assumptions **cannot override** the MUV Knowledge Book.
2. Before editing anything the Knowledge Book has an opinion on (brand, product, sales, CRM, AI,
   workflow, etc.), first analyse the existing code **and** the relevant Knowledge Book section(s) —
   don't rely on memory of a past summary.
3. Existing working functionality and data must be preserved. Don't rebuild, redesign, or add
   unrelated features without explicit approval, even if the Knowledge Book suggests a larger vision.
4. Work proceeds phase by phase. Don't jump ahead to implementation (website corrections, AI
   integration, Institutional Sales, CRM, Sales Dashboard, etc.) without an explicit go-ahead for
   that phase.
5. When Knowledge Book files conflict with each other, conflict with this codebase's actual state, or
   are ambiguous about which rule applies, **stop and report the conflict instead of guessing.**
6. Never rewrite, summarize away, or silently edit Knowledge Book content while doing engineering
   work — it is read-only source material for decisions, not a file to refactor.

## What this is

MUV is a single Next.js 15 project containing a premium personal-care storefront, customer
auth/account, admin dashboard, and CMS backend — all in one app, not separate services.
Stack: Next.js 15 App Router · TypeScript (strict) · PostgreSQL · Prisma · Auth.js (NextAuth v5)
· Tailwind CSS · Server Actions.

Not a git repository in this checkout — there is no `.git` here, so don't assume `git log`/`git blame`
are available for history; treat the `PHASE_*.md` and `*_REPORT.md` docs as the change record instead.

## Commands

```bash
npm install
npx prisma generate                # regenerate Prisma Client after any schema.prisma change
npx prisma db push                 # fast local sync, no migration file (dev only)
npx prisma migrate dev --name x    # generate a real migration (use before deploying schema changes)
npx prisma migrate deploy          # apply migrations in production — never `db push` in prod
npm run db:seed                    # tsx prisma/seed.ts — real categories/products/CMS content/admin user
npm run db:studio                  # Prisma Studio

npm run dev                        # next dev
npm run build                      # next build
npm run start                      # next start (standard hosting)
npm run start:passenger            # node server.js (GoDaddy/cPanel Passenger hosting only)
npm run lint                       # next lint
```

There is no test runner configured in `package.json` — don't assume `npm test` exists.

Full verification chain before trusting a change compiles: `npm install && npx prisma generate &&
npx tsc --noEmit && npm run build`. Several of the project's own status docs (`PROJECT_STATUS.md`,
`README.md`) note that a real `next build` against generated Prisma Client types has historically
been the untested step — a wrong relation name or prop-name mismatch passes a syntax check but
fails a real build, so lean on `tsc --noEmit`/`next build` rather than assuming past verification covers new work.

Seeded admin login after `npm run db:seed`: `admin@muv.co.in` / `ChangeMe123` — change immediately
outside local dev.

## Architecture

### Request flow and the mutation boundary
Almost every mutation in the app is a Server Action in `actions/*.ts` (one file per domain:
`products`, `orders`, `payments`, `shipping`, `coupons`, `customers`, `reviews`, `wishlist`, `blog`,
`media`, `cms`, `auth`, `settings`, `recently-viewed`, `search`, `inquiries`, `inventory`, `cart`).
This is deliberate, not stylistic: Next.js 15 CSRF-protects Server Actions automatically by checking
`Origin` against the deployment host, so routing mutations through them is a security default, not
just convenience (see `SECURITY.md`). The few files under `app/api/*` (`products`, `categories`,
`blog`, `homepage`, plus `auth` and the two webhook routes) are read-only GETs or webhook receivers —
if a new mutating API route is ever needed instead of a Server Action, it must manually verify
`Origin`/`Referer` itself.

**Every exported function in an `actions/*.ts` file is independently callable as its own RPC
endpoint**, regardless of which other server code calls it. Auth checks in a caller (e.g.
`refundOrder`) do not protect a function it calls (e.g. `processRefund`) if that function is also
exported from a `"use server"` file — each exported action must call `requireStaff()`/
`requireAdmin()`/`requireCustomer()` (`lib/rbac.ts`) itself. This was a real bug found and fixed
during payments wiring; don't reintroduce it when adding new actions.

### AuthN/AuthZ
- `lib/auth.ts` — full NextAuth config (Node-only: bcryptjs, Prisma adapter). Used by server code
  and Server Actions.
- `lib/auth.config.ts` — edge-safe subset (no bcryptjs/Prisma), used by `middleware.ts` since the
  Edge Runtime can't load Node-only deps. It only decodes an existing session JWT, never runs
  `authorize()`.
- `middleware.ts` gates `/admin/:path*` and `/account/:path*` at the edge — this is a UX fast-path
  only, **not the security boundary**. `/checkout` is intentionally not gated here (guest checkout
  is supported; `createOrder` in `actions/orders.ts` and the checkout page handle the guest/logged-in
  split themselves).
- `lib/rbac.ts` is the actual boundary: `requireUser()` / `requireRole()` / `requireStaff()`
  (ADMIN or STAFF) / `requireAdmin()` (ADMIN only) / `requireCustomer()`. Every Server Action and
  API route touching non-public data must call one of these itself — never rely on a caller having
  already checked.
- Roles: `ADMIN`, `STAFF`, `CUSTOMER` (see `Role` enum in `prisma/schema.prisma`).

### Data layer
- `prisma/schema.prisma` is the full data model — Users/Accounts/Sessions (Auth.js), Customer,
  Address, Category, Product/ProductVariant/Inventory/StockHistory, Order/OrderItem/PaymentAttempt,
  Wishlist, RecentlyViewedItem, SearchQuery, Coupon, Review, CMS models (Banner, HomepageSection,
  AnnouncementBar, NewsletterContent, StoreSettings), BlogCategory/BlogPost, MediaAsset,
  Shipment/ShipmentEvent/ReturnShipment, NotificationLog, BusinessInquiry.
- No `Cart` table by design — cart state lives client-side (`lib/cart-context.tsx`,
  localStorage-backed) and is only sent to the backend at checkout (`createOrder` takes
  `items: [{variantId, quantity}]` directly from client state). Only add a `Cart` table if
  cross-device cart recovery becomes an actual requirement — don't add it speculatively.
- Every Server Action/API route validates input through a Zod schema in `lib/validations/*.ts`
  before it touches Prisma. Validation failures return `{ fieldErrors }`.
- `lib/errors.ts` normalizes every thrown value (Zod errors, `AppError` subclasses, known Prisma
  error codes P2002/P2025, anything unrecognized) into one `{ success: false, error: { message,
  code } }` shape via `toErrorResponse()`. Unrecognized errors are logged server-side in full and
  returned to the client as a generic message — never leak Prisma/stack internals in a response.

### Pluggable providers
Shipping and messaging both use the same swap-by-env-var pattern — application code never imports
a specific provider class directly:
- `lib/shipping/index.ts` — `getShippingProvider()` picks Shiprocket/Delhivery/BlueDart/DTDC based
  on `SHIPPING_PROVIDER`. Webhook receivers live at `app/api/webhooks/shipping/[provider]/route.ts`.
- `lib/messaging/index.ts` — same pattern for Twilio/MSG91/Interakt/WhatsApp Business Cloud API via
  `MESSAGING_PROVIDER`.
- Payments has one real integration (Razorpay, `lib/payments/razorpay.ts`), not pluggable.

When adding a new provider for either, implement the shared interface (`lib/shipping/types.ts` /
`lib/messaging/types.ts`) and add one `case` to the relevant `index.ts` switch — nothing else in
`actions/` should need to change.

### Webhooks
`app/api/webhooks/razorpay/route.ts` and `app/api/webhooks/shipping/[provider]/route.ts` are the
only inbound webhook endpoints. Both:
- Verify an HMAC signature against the **raw** request body (`req.text()`, never `req.json()`
  first — re-serializing JSON can change whitespace/key order and break signature verification).
- Return HTTP 200 even when internal processing throws after signature verification succeeds
  (prevents retry-storms from providers on failures that are this app's fault, not theirs) —
  failures are logged for manual follow-up instead of surfaced via status code.
- Razorpay webhook payment status is the actual source of truth for payment state in production —
  see the comment at the top of that route for why the client-side `verifyPayment` call alone
  isn't sufficient.

### Route structure (`app/`)
- `(storefront)` route group — homepage, shop, collections, product detail, cart, checkout, journal
  (blog), static pages (about/contact/faq/shipping/returns/privacy/terms).
- `(auth)` route group — login, signup, reset-password.
- `account/` — customer dashboard, orders, wishlist, profile. Gated by middleware + `requireCustomer`.
- `admin/` — dashboard, products, orders, customers, inventory, marketing, media, analytics,
  settings, and `cms/` (homepage, categories, blog). Gated by middleware + `requireStaff`/`requireAdmin`.
- `api/` — read-only GETs (`products`, `categories`, `blog`, `homepage`), NextAuth handler, and the
  two webhook receivers described above.
- `robots.ts` / `sitemap.ts` — dynamic SEO routes at the `app/` root.

### Other conventions
- `components/ui/*` — shared primitives (Button, Card, Modal, Toast, ToggleSwitch, Aura,
  BottleVisual); domain components split under `storefront/`, `checkout/`, `account/`, `admin/`.
- `styles/globals.css` is the single design-system stylesheet — nothing is redefined per-page.
- `lib/rate-limit.ts` (`checkRateLimit(key, limit, windowMs)`) is called from `lib/auth.ts`'s
  `authorize()` (5 attempts/5min by email), `actions/auth.ts`'s `signup()` (5/hour by IP), and
  `actions/coupons.ts`'s `validateCoupon()` (20/min by IP). **It stores counters in process
  memory** — correct for a single instance, silently ineffective across multiple instances. Swap
  in Upstash Redis before scaling beyond one server, keeping the same function signature so call
  sites don't change.
- `lib/env.ts`'s `validateEnv()` only checks `DATABASE_URL` and `AUTH_SECRET`/`NEXTAUTH_SECRET` —
  the only vars that break the app unconditionally. Every other integration (Google OAuth,
  Cloudinary, Razorpay, Resend, shipping/messaging providers) is optional and fails gracefully at
  its own call site; don't add those to `validateEnv()`'s required list without also removing their
  graceful-fallback handling.
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the one intentionally client-exposed secret-shaped var; every
  other credential in `.env.example` must stay server-only (never add a `NEXT_PUBLIC_` prefix to it).
- `server.js` exists solely for GoDaddy cPanel/Phusion Passenger hosting (`npm run start:passenger`),
  which requires a plain Node.js entry point instead of `next start`. Standard hosts (Vercel,
  Railway, Render, or any Node host that runs `npm start`) should ignore it and use `npm run build`
  + `npm run start` normally.

## Project status docs — read before assuming a page/route exists

Several markdown files at the repo root are the actual source of truth for what's wired up versus
what only exists as an unused Server Action, and should be checked before assuming a page calls a
given action or a route is real:
- `PROJECT_STATUS.md` — what's converted to a real page vs. still only a Server Action with no UI
- `WIRING.md` — which Server Action/route backs which piece of UI, file by file
- `SECURITY.md` — where CSRF, rate limiting, hashing, webhook verification actually live
- `AUDIT.md` — the production-readiness audit this project was built against
- `DEPLOYMENT_GUIDE.md` / `DEPLOYMENT_READINESS.md` — GoDaddy/Passenger deploy steps and the
  pre-launch checklist

These docs are written incrementally per development phase (see the `PHASE_*.md` and `PHASE_*_REPORT.md`
files) and some describe intermediate states later superseded by subsequent phases — prefer the most
recently dated/highest-numbered phase doc when they conflict, and verify against actual code
(e.g. `Glob`/`Grep` for the route or action in question) rather than trusting a status doc alone.
