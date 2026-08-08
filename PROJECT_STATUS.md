# Project Assembly Status

> **Note (Phase 1C, 2026-07-26):** this document describes the state after the very first
> frontend/backend assembly pass and has not been kept current through Phases 7–18 or the Phase 1
> (Knowledge Book stabilization) work — most items listed below as "not converted yet" (CMS,
> marketing, inventory, customers admin pages) are real and live today. For current status, prefer
> `docs/phase-1/PHASE_1C_IMPLEMENTATION_REPORT.md` (most recent) and the `PHASE_*_REPORT.md` files at
> the repo root over this document, per `CLAUDE.md`'s own "highest-numbered phase doc wins" rule.
> Left unedited below as a historical record, not rewritten.

This is the direct fix for `AUDIT.md`'s Finding 0 ("frontend and backend
have never been connected"). This document says exactly how far that fix
goes in this pass — read it before assuming any page not listed here works.

## What's real and wired end-to-end

**Infrastructure (fixes the audit's duplication findings):**
- `app/globals.css` — the ~150-line CSS block previously duplicated across
  all 10 `.jsx` files now exists exactly once
- `public/logo.png` — the 61KB base64 logo previously embedded 5 times
  (~305KB duplicated) is now one 45KB static file, fetched once, cached
- `components/ui/*` — Button, Card, Modal, Toast, ToggleSwitch, Aura,
  BottleVisual: shared primitives instead of each page reimplementing them
- `next/font/google` for Fraunces/Inter, replacing the runtime Google Fonts
  `<link>` injection every original file used — self-hosted, no
  render-blocking third-party request, no font-swap layout shift
- `lib/cart-context.tsx` — real client-side cart state (localStorage-backed,
  per `WIRING.md`'s reasoning for not adding a Cart database table)

**Pages that fetch real Prisma data and call real Server Actions —
no mock arrays:**
- `/` (homepage) — real banners, categories, best-sellers from the CMS models
- `/shop`, `/collections/[category]` — real product queries, real
  in-stock/price data
- `/products/[slug]` — real product detail, real reviews, real Product +
  Breadcrumb JSON-LD
- `/cart` — real coupon validation via `validateCoupon`
- `/checkout` — the full real flow: `createOrder` → (non-COD)
  `initiatePayment` → actual Razorpay `checkout.js` → `verifyPayment`.
  This is the single most important page in this pass — it's the one place
  the payments work from three turns ago actually gets exercised by a UI.
- `/login`, `/signup` — real NextAuth `signIn` and the real `signup` action
- `/account`, `/account/orders`, `/account/wishlist`, `/account/profile` —
  real per-customer Prisma queries; order cancellation calls the real
  `cancelOrder` action, wishlist removal calls the real `removeFromWishlist`
  action (see below — this was the one genuinely-missing piece, now built)
- `/journal`, `/journal/[slug]` — real published/scheduled-due posts,
  real per-post metadata (falls back to the post's own title/excerpt when
  no explicit meta title/description was set)
- `/admin`, `/admin/products` (now including the real **Add/Edit modal**,
  calling `createProduct`/`updateProduct`), `/admin/orders` — real aggregate
  queries (including the low-stock `$queryRaw`), real `deleteProduct` and
  `updateOrderStatus` (respecting `ALLOWED_TRANSITIONS` — try jumping an
  order straight to DELIVERED and watch it get rejected with the real
  server-side reason, not just a disabled button)
- **Wishlist is now fully real, not just read-only.** `app/actions/wishlist.ts`
  (`addToWishlist`/`removeFromWishlist`/`isProductWishlisted`) didn't exist
  in the previous pass — it does now, wired into both `/account/wishlist`
  (remove) and the product detail page's heart button (add/remove, with the
  correct initial filled/unfilled state fetched server-side per visitor,
  not just local component state that resets on reload).
- `prisma/seed.ts` now exists — real categories, 6 products with real
  variants/inventory/HSN codes, homepage CMS content (hero banner, section
  order, announcement bar, newsletter copy), one coupon (`MUV10`), and a
  seed admin account. **Run this before anything above will show real
  content** — see the Realistic Path section below.

## What still follows the pattern but isn't converted yet

Everything below has the exact Server Actions/API routes it needs already
built (from earlier turns) — converting it is the same mechanical pattern
demonstrated above (Server Component fetches via Prisma → passes to a
Client Component → Client Component calls the existing action), not new
backend work:

- **CMS pages** (`/admin/cms/homepage`, `/admin/cms/blog`, media library,
  SEO settings) — `app/actions/cms.ts`, `blog.ts`, `media.ts` are fully
  real; no pages call them yet
- **Marketing, Inventory, Customers admin sections** — same story, real
  actions, no pages yet
- **Refund UI**, **shipment tracking UI**, **return-request UI** — all real
  Server Actions (`refundOrder`, `syncShipmentTracking`,
  `initiateReturnShipment`), no page calls them yet

## What's still genuinely missing (not a conversion gap — actual absence)

- No `RecentlyViewed` tracking, no `SiteSettings` singleton for
  logo/favicon/social/legal (both noted in `WIRING.md` from earlier)
- No background job for scheduled blog-post publishing beyond the
  due-date check already in `/api/blog`, and no cron for abandoned-payment
  cleanup — both documented as needing a real scheduler, neither has one

## Verification performed — and its real limit

Every new `.ts`/`.tsx` file (80+ files) was parsed with `esbuild` to confirm
there are zero syntax errors — no unclosed JSX, no malformed TypeScript,
across the entire new project. **This is not the same as a real `next
build`** — esbuild strips types rather than checking them, so a wrong prop
name or a Prisma relation typo would parse fine here and still fail a real
build. The honest next step, unchanged from every prior turn's own
verification notes: `npm install`, `npx prisma generate`, `next build`,
against a real Postgres database, is what actually proves this runs.

## The realistic path from here

1. `npm install && cp .env.example .env` (fill in `DATABASE_URL` at minimum)
2. `npx prisma migrate dev --name init`
3. Write and run `prisma/seed.ts` — nothing will look right without it
4. `npm run dev` — walk through Login → Shop → Add to Cart → Checkout (COD
   first, it needs no external account) end-to-end for the first time ever
5. Add Razorpay test-mode keys, repeat checkout with a real (test) payment
6. Convert the CMS/admin pages listed above, following the exact pattern
   already demonstrated in `/admin/products` and `/admin/orders`
