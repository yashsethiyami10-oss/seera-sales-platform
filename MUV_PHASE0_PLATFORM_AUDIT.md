# MUV Platform — Phase 0 Platform Audit Report

**Scope:** Read-only audit of `c:\Users\HP\muv-platform-deployment-package`. No files were modified. No git repo present in this checkout — findings are based on direct code inspection, a live `npx tsc --noEmit`, a live `npm run build`, and the project's own `PHASE_*.md`/`*_REPORT.md` docs (verified against actual code, not taken at face value).

> **Note (added during Phase 0 validation):** this report was originally produced and published only
> as a Claude.ai Artifact (not saved to the repository). This is the persisted, repo-committed copy,
> created during the Phase 0 review pass so this audit follows the same durable-documentation
> convention as every other `PHASE_*.md` file in this project (per `CLAUDE.md`'s own stated rule that
> these files are the change record). Content is unchanged from the original; see
> `MUV_PHASE0_VALIDATION_REPORT.md` for what was independently re-verified and what, if anything,
> needed correction.

**Bottom line:** This is a mature, single-codebase Next.js 15 commerce platform (storefront + admin + CMS) that is substantially complete — 18 development phases have shipped, the app type-checks cleanly, and a fresh production build succeeds with all 41 routes generated and zero errors. The main outstanding items are configuration/operational (payment, email, SMS, OAuth credentials all unset), not code defects.

---

## 1. Project Architecture

- **Type:** Single Next.js 15 application (App Router) containing storefront, customer account, admin dashboard, and CMS — not separate services/microservices.
- **Stack:** Next.js `15.5.20` · React `19.0.0` · TypeScript (strict) · PostgreSQL via Prisma `5.20.x` · Auth.js / NextAuth `5.0.0-beta.31` · Tailwind CSS `3.4.x` · Server Actions as the primary mutation layer.
- **Mutation boundary:** Nearly all writes go through `actions/*.ts` Server Actions (one file per domain), which get automatic CSRF protection (Next.js checks `Origin` against the deployment host). `app/api/*` is reserved for read-only GETs and two inbound webhooks.
- **Layered security model:** `middleware.ts` (edge, UX fast-path only) → `lib/rbac.ts` (`requireUser`/`requireStaff`/`requireAdmin`/`requireCustomer`, the actual enforcement boundary, called independently inside every exported action).
- **Pluggable providers:** Shipping (`lib/shipping/index.ts` — Shiprocket/Delhivery/BlueDart/DTDC) and messaging (`lib/messaging/index.ts` — Twilio/MSG91/Interakt/WhatsApp Cloud API) both swap by env var behind a shared interface. Payments (Razorpay) is a single, non-pluggable integration.
- **Deployment target:** Designed for both standard Node hosts (`npm run build && npm run start`) and GoDaddy cPanel/Phusion Passenger (`server.js` / `npm run start:passenger`).
- **No git history in this checkout** — the `PHASE_*.md` and `*_REPORT.md` files at the repo root are the de facto change log (18 phases, dated 2026-07-19 through 2026-07-22).

## 2. Folder Structure

```
app/                    Next.js App Router routes (see §3)
actions/                18 Server Action files — one per domain (products, orders,
                         payments, shipping, coupons, customers, reviews, wishlist,
                         blog, media, cms, auth, settings, recently-viewed, search,
                         inquiries, inventory, cart)
lib/                     Cross-cutting: auth, rbac, prisma client, validations/*,
                         shipping/*, messaging/*, payments/razorpay, notify/*,
                         tax/*, analytics, recommendations, preferences, cache,
                         rate-limit, errors, logger, seo, env
components/              ui/ (shared primitives), storefront/, admin/, admin/products/,
                         checkout/, account/, auth/, cart/, order-success/
prisma/                  schema.prisma (full data model), seed.ts
public/                  Static assets (logo, images)
styles/                  globals.css — single design-system stylesheet
types/                   Shared TypeScript types
archive/                 Superseded/historical files (not part of the live app)
.claude/                 Claude Code project config + docs (incl. MUV Knowledge Library)
```
Root also holds ~30 markdown docs: architecture/brand/design "frozen" specs (`PHASE_1`–`PHASE_6B`), implementation reports (`PHASE_7A`–`PHASE_18`), and operational docs (`README.md`, `CLAUDE.md`, `SECURITY.md`, `AUDIT.md`, `WIRING.md`, `PROJECT_STATUS.md`, `DEPLOYMENT_GUIDE.md`, `DEPLOYMENT_READINESS.md`, `PRE_LAUNCH_CHECKLIST.md`, `PRODUCTION_READY.md`).

**Note:** `PROJECT_STATUS.md` (dated 2026-07-19, before Phase 13A onward) is now stale — it describes CMS/marketing/inventory/customers admin pages as "not converted yet," but all of them exist and are wired today (confirmed directly against `app/admin/**`). Treat the phase reports as authoritative over this file, per `CLAUDE.md`'s own guidance.

## 3. Routes

Confirmed via `npm run build` (41 routes, clean):

**Storefront `(storefront)` group** — `/`, `/shop`, `/collections/[category]`, `/products/[slug]`, `/cart`, `/checkout`, `/checkout/success`, `/journal`, `/journal/[slug]`, `/about`, `/contact`, `/faq`, `/shipping`, `/returns`, `/privacy`, `/terms`.

**Auth `(auth)` group** — `/login`, `/signup`, `/reset-password` (all statically prerendered).

**Account** (middleware + `requireCustomer` gated) — `/account`, `/account/orders`, `/account/orders/[id]`, `/account/wishlist`, `/account/profile`.

**Admin** (middleware + `requireStaff`/`requireAdmin` gated) — `/admin`, `/admin/products`, `/admin/orders`, `/admin/orders/[id]`, `/admin/customers`, `/admin/customers/[id]`, `/admin/inventory`, `/admin/marketing`, `/admin/media`, `/admin/analytics`, `/admin/settings`, `/admin/cms/homepage`, `/admin/cms/categories`, `/admin/cms/blog`.

**API (`app/api/*`)** — read-only GETs: `/api/products`, `/api/products/[slug]`, `/api/categories`, `/api/blog`, `/api/blog/[slug]`, `/api/homepage`; plus `/api/auth/[...nextauth]` and two webhook receivers: `/api/webhooks/razorpay`, `/api/webhooks/shipping/[provider]`.

**SEO routes** — `app/robots.ts`, `app/sitemap.ts` (dynamic, includes all real static pages as of Phase 16).

**Route-level access confirmed live:** `/admin/*` and `/account/*` return `307` unauthenticated; `/checkout` and `/checkout/success` are intentionally open (guest checkout, Phase 18).

## 4. Admin Panel

Full CRUD dashboard under `/admin`, gated to `ADMIN`/`STAFF` roles:

| Section | Capability |
|---|---|
| Dashboard (`/admin`) | Aggregate KPIs, low-stock query, best-sellers |
| Products (`/admin/products`) | Add/Edit modal, variants, images, SEO fields, `createProduct`/`updateProduct`/`deleteProduct` |
| Orders (`/admin/orders`, `/orders/[id]`) | Status transitions via `ALLOWED_TRANSITIONS` state machine, refunds |
| Customers (`/admin/customers`, `/[id]`) | Profile, notes (`CustomerNote`), order history |
| Inventory (`/admin/inventory`) | Stock adjustment, `StockHistory` audit trail, low-stock thresholds |
| Marketing (`/admin/marketing`) | Coupon CRUD (percent/flat, min order, max uses, expiry) |
| Media (`/admin/media`) | Cloudinary-backed media library, folders, size-limit validation |
| Analytics (`/admin/analytics`) | Revenue KPIs, GST summary, per-product/category/fragrance/size breakdowns (`lib/analytics.ts`) |
| Settings (`/admin/settings`) | Business info, GSTIN, shipping fee/free-shipping threshold, COD toggle, social links, admin notification toggles (5 independent alert types) |
| CMS → Homepage | Banners (Hero/Promo), section visibility/order, announcement bar, newsletter copy |
| CMS → Categories | Category CRUD, images, "coming soon" flag |
| CMS → Blog | `BlogPost`/`BlogCategory` CRUD, scheduled publishing |

**Gap confirmed:** `BusinessInquiry` submissions (the `/contact` B2B form) have no admin list/management UI — only `submitBusinessInquiry` (create) and an admin email alert exist. There's no `/admin/inquiries` page to view, mark `CONTACTED`/`CLOSED`, or browse past submissions despite the `InquiryStatus` enum existing in the schema for exactly that purpose.

## 5. Product Management

- **Model:** `Product` → `ProductVariant` (size/price/MRP/SKU) → `Inventory` (quantity, low-stock threshold, warehouse location) → `StockHistory` (audit trail with reason enum: `RESTOCK`/`ORDER_FULFILLMENT`/`ORDER_CANCELLED`/`MANUAL_ADJUSTMENT`/`RETURN`).
- Fields cover full storefront + compliance needs: fragrance notes, ingredients, directions, benefits, safety copy, HSN code (tax), GST rate, meta title/description, multiple images/videos, `ProductStatus` (`ACTIVE`/`DRAFT`/`ARCHIVED`), featured flag, best-seller rank.
- Admin product form (`/admin/products`) handles create/edit including variants and images; `deleteProduct` is real (not a stub).
- Storefront-side: real filters (size/category/price/fragrance/in-stock/rating/discount), 6 sort orders, fuzzy search (Levenshtein-based typo tolerance) matching name/brand/category/fragrance/SKU.
- Only one file flagged oversized in prior audits: `components/storefront/product-grid.tsx` (555 lines) — judged cohesive, not split.

## 6. Authentication

- **Provider:** NextAuth v5 (Auth.js), JWT sessions, `role` embedded in the token.
- `lib/auth.ts` — full config (Node-only: bcryptjs cost-factor-12 hashing + Prisma adapter). Credentials (email/password) + Google OAuth (conditional, only rendered when `GOOGLE_CLIENT_ID` is set) + Apple OAuth (wired in code, inactive — no credentials provisioned).
- `lib/auth.config.ts` — edge-safe subset used by `middleware.ts` (decodes an existing JWT only, never runs `authorize()`).
- **Roles:** `ADMIN`, `STAFF`, `CUSTOMER` (Prisma `Role` enum).
- **Enforcement:** `middleware.ts` is a UX fast-path (redirects at the edge); `lib/rbac.ts`'s `requireUser`/`requireRole`/`requireStaff`/`requireAdmin`/`requireCustomer` is the real boundary, called independently inside every Server Action — confirmed as a documented, previously-real bug class (`processRefund` originally trusted its caller's check) that was fixed and is now called out as a standing rule in both `CLAUDE.md` and `SECURITY.md`.
- **Guest checkout** (Phase 18): `/checkout` is intentionally ungated; `createOrder`/`initiatePayment`/`verifyPayment` branch on session presence via a shared `requireOrderAccess()` helper rather than trusting client-supplied flags.
- **Rate limiting:** login (5/5min by email), signup (5/hour by IP), password reset request/confirm (5/hr, 10/hr by IP) — all via `lib/rate-limit.ts`, **in-process memory only** (see §14, Technical Risks).
- **Seeded credentials:** `admin@muv.co.in` / `ChangeMe123` (per `CLAUDE.md` — must be changed before any real deployment).

## 7. Database

- **Engine:** PostgreSQL, accessed exclusively through Prisma (`prisma/schema.prisma`, single file, ~800 lines; independently re-counted during Phase 0 validation at 33 `model` blocks and 24 `@@index` directives).
- **Live and connected in this environment** — confirmed via `dev-server.log`, which shows real, successful queries against a local Postgres instance (products, categories, orders, reviews, recently-viewed, etc.), not mock data.
- **Model groups:** Auth (`User`/`Account`/`Session`/`VerificationToken`), Customer/`Address`/`CustomerNote`, Catalog (`Category`/`Product`/`ProductVariant`), Inventory (`Inventory`/`StockHistory`), Orders (`Order`/`OrderItem`/`PaymentAttempt`), `Wishlist`, `RecentlyViewedItem`, `SearchQuery`, `Coupon`, `Review`, CMS (`Banner`/`HomepageSection`/`AnnouncementBar`/`NewsletterContent`/`StoreSettings`), Blog (`BlogCategory`/`BlogPost`), `MediaAsset`, Shipping (`Shipment`/`ShipmentEvent`/`ReturnShipment`), `NotificationLog`, `BusinessInquiry`.
- **Money stored as `Int`** (whole rupees) by deliberate design choice, documented at the top of the schema — avoids float rounding, not a bug.
- **No `Cart` table by design** — cart state is client-side/localStorage (`lib/cart-context.tsx`), only sent to the server at checkout. Documented as intentional; a `Cart` table is deferred until cross-device cart recovery becomes a real requirement.
- **Indexing:** hardened in Phase 16 — join keys and hot filter/sort columns (`OrderItem.orderId/variantId`, `Order.paymentStatus+createdAt`, `Order.createdAt`, `Address.customerId`, `CustomerNote.customerId`, `Product.status`) all have indexes added with inline comments explaining the specific query pattern each serves.

## 8. APIs

- **Server Actions (18 files, primary API surface)** — CSRF-protected automatically by Next.js; each exported function independently enforces its own RBAC (see §6).
- **REST routes (`app/api/*`)** — 6 read-only GET endpoints (products, categories, blog, homepage) plus the NextAuth handler.
- **Webhooks** — `app/api/webhooks/razorpay` and `app/api/webhooks/shipping/[provider]` (one path handling Shiprocket/Delhivery/BlueDart/DTDC). Both verify an HMAC signature against the **raw** request body before trusting any payload field, and both return HTTP 200 even on internal-processing failure (to avoid provider retry-storms), logging failures for manual follow-up instead.
- **Validation:** every action/route parses `input: unknown` through a Zod schema (`lib/validations/*.ts`) before touching Prisma — confirmed no gaps found in the Phase 16 security audit pass.
- **Known caveat (documented, not fixed):** the shipping webhook's HMAC-SHA256 check is a generic default — actual signature schemes vary by courier and should be verified against each provider's current docs before going live.

## 9. Existing AI-Related Code

- **`lib/recommendations.ts`** — `getSimilarProducts` (category + fragrance-overlap), `getCoPurchasedProducts` (real order co-occurrence — powers both "Customers Also Bought" and "Frequently Bought Together"), `getTrendingProducts` (trailing-30-day order volume), `getNewArrivals`, `getStaffPicks` (reuses `Product.isFeatured`), `getRecommendedForYou` (blends preference signals, falls back to Trending for new accounts).
- **`lib/preferences.ts`** — `getCustomerPreferences()`: favorite categories/fragrances, average budget, preferred sizes, shopping frequency (median inter-order days), wishlist-to-purchase conversion — computed live from `Order`/`OrderItem`/`Wishlist` on every read, not a separately stored/driftable table.
- **`lib/utils/fuzzy-search.ts`** — hand-written Levenshtein-distance typo tolerance for search (substring match first, edit-distance fallback scaled to query length).
- **Personalized homepage rail** — "Continue Shopping" (logged-in, has history) / "Recommended for You" (logged-in, no history) / "Trending Now" (guest), always followed by "New Arrivals."
- **Important characterization:** none of this is a chatbot, LLM integration, or external AI/ML service — every "AI" feature is a plain Prisma query or a small, self-contained algorithm running on real transactional data. No `OpenAI`/`GPT`/LLM/chatbot references exist anywhere in the *website codebase* (the separate MUV AI Sutra™ knowledge-book document, discovered and audited in the follow-up Knowledge Library pass, is a governance/strategy text, not code — see `MUV_PHASE1_KNOWLEDGE_AUDIT.md`).
- **Known limitation, self-documented:** search runs client-side over the already-loaded product list — fine at current catalog scale (tens of SKUs), would need a server-side/indexed approach (e.g., Postgres `pg_trgm`) at materially larger scale.
- **Not yet built (named as future extension points in Phase 14A):** similar-products/co-purchase rails on `/shop`/`/collections` (currently Product Detail only); admin-toggleable personalized homepage rail; a customer-facing "Your Shopping Profile" view of `getCustomerPreferences`.

## 10. Existing Sales / Institutional-Related Code

- **`BusinessInquiry` model** (Prisma) — companyName, contactPerson, email, phone, businessType, city, state, message, `InquiryStatus` (`NEW`/`CONTACTED`/`CLOSED`).
- **`actions/inquiries.ts`** — `submitBusinessInquiry()`: public, unauthenticated, IP-rate-limited (5/hour, same pattern as signup), triggers an admin email alert (`sendAdminNewInquiryAlert`) on submit, gated by `StoreSettings.notifyAdminNewInquiry`.
- **UI surface:** `components/storefront/business-section.tsx` ("For Business" homepage panel — targets hotels, hospitals, restaurants, offices, car washes, laundry operations), plus links from the footer and `why-choose-muv.tsx`; the actual form lives on `/contact` (`app/(storefront)/contact/page.tsx`), confirmed wired to `submitBusinessInquiry`.
- **Gap:** as noted in §4, there is no admin-side list/detail view for these inquiries — submissions land in the database and trigger an email, but staff can't browse/triage them inside `/admin` today. `business-section.tsx`'s own code comment ("no dedicated business-inquiry page or backend exists yet") is now partially stale — the backend and public-facing form exist; only the admin management UI is still missing.
- No wholesale pricing tiers, bulk-order minimums, or B2B-specific checkout flow exist — institutional interest is captured as a lead (inquiry), not self-served through commerce.

## 11. Build Status

Verified live, from a cold state, in the session that produced this report:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Clean — zero errors** |
| `npm run build` | **Clean — succeeded**, all 41 routes generated (matches every prior phase report's route count) |
| Route mix | 15 statically prerendered (`○`) marketing/auth pages, 26 dynamic (`ƒ`) — matches expected pattern (data-driven storefront/account/admin pages must be dynamic) |
| `npm run lint` | **Not runnable** — `lint` script exists in `package.json`, but no ESLint config or `eslint`/`eslint-config-next` dependency is installed anywhere in the project (re-confirmed during Phase 0 validation via `Glob` for `.eslintrc*`/`eslint.config.*` — only `node_modules`-internal configs exist, none at the project root). This has been true since at least Phase 16 and was a deliberate "left to you" decision, not an oversight. |
| Database connectivity | Live and working — `dev-server.log` shows real successful Prisma queries against a running local Postgres instance |

## 12. Current Errors

- **No current build or type errors** — both `tsc --noEmit` and `next build` completed clean in this session.
- **`dev-server.log` (stale, last written 2026-07-23) contains historical, non-blocking entries**, all already self-resolved or expected:
  - Notification send failures (`RESEND_API_KEY is not set`, `MSG91_SENDER_ID is not set`) — **expected**, not bugs: these are the graceful-fallback failure paths for optional providers with no credentials configured in `.env` (see §14).
  - A short burst of `InvariantError: Expected clientReferenceManifest to be defined`, `ENOENT ... _document.js`, and `Cannot read properties of undefined (reading '/_app')` around one dev-server session — a known Next.js dev-mode/Windows hot-reload cache corruption pattern (self-recovered: a `500` on `/admin/cms/homepage` was immediately followed by a `200` on reload, and this session's fresh `npm run build` shows no trace of it). Not a code defect; see §14 for the operational note.
  - One `EPERM: operation not permitted, rename ...\.next\cache\webpack\...pack.gz` — a Windows file-locking quirk in webpack's dev cache, cosmetic.
- No `console.error`/stack traces were found in any currently-open route during this audit's live build.

## 13. Missing Features

Cross-referenced against `PROJECT_STATUS.md`, `WIRING.md`, and every phase report through Phase 18, then verified against actual code:

- **Admin UI for `BusinessInquiry` management** (§4/§10) — real gap, backend-only today.
- **Apple Sign-In** — code wired (`lib/auth.ts`), UI conditional and correctly hidden, but inactive: no `APPLE_ID`/`APPLE_CLIENT_SECRET` (needs a paid Apple Developer enrollment + `.p8` key, can't be provisioned in this environment).
- **No background job scheduler** — scheduled blog-post publishing only self-corrects on next `/api/blog` request (due-date check, no cron); no automated abandoned-payment cleanup.
- **No cross-device cart recovery** (`Cart` table) — deliberate deferral, not an oversight.
- **No admin-toggleable personalized homepage rail** — the Phase 14A recommendation rail is always-on, not one of the CMS's curated `HomepageSection` entries.
- **No customer-facing "Your Shopping Profile"** view of computed preferences (`getCustomerPreferences` is internal-only).
- **No unified marketing-campaign system** — banners and coupons are both real and CMS-managed, but independently; no shared campaign/scheduling concept ties them together (deliberately deferred, named in Phase 18).
- **No Content-Security-Policy header** — deliberately not added in Phase 16 due to real risk of breaking the live Razorpay/Cloudinary integrations without a way to test that live in this environment; other security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS) are present.
- **No ESLint configuration** — see §11.
- **No test runner/test suite configured** at all (`package.json` has no `test` script, no Jest/Vitest/Playwright dependency) — confirmed absent, not just unrun.
- **WhatsApp template names are placeholders** (`payment_confirmed`, `order_delivered`, `order_shipped`) — code is real, but these must actually be created and approved in whichever messaging provider's dashboard is configured before they will send.
- **Guest-checkout live payment flow was never click-tested** end-to-end in a real browser (per Phase 18's own admission — no browser automation tooling was available to that phase).

## 14. Technical Risks

Ranked by what would actually bite first in a real deployment:

1. **`AUTH_SECRET` is still the placeholder value** (`"replace-with-a-long-random-string"`) in `.env` (re-confirmed during Phase 0 validation). This is fine for local dev but would be a critical session-forgery risk if deployed as-is — must be replaced with a real random secret (`npx auth secret`) before any non-local deployment.
2. **Every external integration is unconfigured in `.env`**: Razorpay (payments), Resend (email), Google OAuth, all four shipping providers, all four messaging providers, `MUV_GSTIN`. The app is architected to fail gracefully at each call site (confirmed — this is not a crash risk), but as-is: no real payments can be captured, no transactional email/SMS/WhatsApp will send, and invoices will show `GSTIN_NOT_CONFIGURED`. This is an operational readiness gap, not a code defect — `lib/env.ts`'s `validateEnv()` deliberately only hard-requires `DATABASE_URL`/`AUTH_SECRET` and leaves the rest optional by design.
3. **In-process rate limiting** (`lib/rate-limit.ts`) — correct for a single server instance, silently ineffective the moment the app scales horizontally (multiple instances each get their own counter). Documented and understood, with a stated swap-in path (Upstash Redis) that keeps the same function signature — but it's a real gap today if deployed behind a load balancer.
4. **Windows dev-mode `.next` cache fragility** (§12) — the historical `InvariantError`/`ENOENT`/webpack `EPERM` cluster suggests the dev server's build cache can get into a bad state on this OS (self-recovers on reload, but worth a documented "if dev server misbehaves, stop it and delete `.next`" runbook step, especially before demos).
5. **No automated test coverage anywhere** — every verification claim in the phase reports (and in this audit) rests on `tsc`, `next build`, and manual/log-based checks, not regression tests. A future change has no automated safety net against silently breaking an existing flow (e.g., the exact class of regression Phase 14A caught by hand — a root-layout change that flipped 10 static pages to dynamic — would not be caught automatically today).
6. **Shipping webhook signature scheme is an unconfirmed generic default** (§8/§9) per `SECURITY.md`'s own admission — must be verified against each courier's actual current docs before relying on it in production; a wrong assumption here means shipment status webhooks could silently fail signature verification (or worse, be trusted incorrectly if a provider's scheme differs enough).
7. **Seeded admin credentials** (`admin@muv.co.in` / `ChangeMe123`) are a real risk only if `db:seed` is ever run against a production database without changing the password immediately after — flagged in `CLAUDE.md` already, worth re-flagging operationally.
8. **No admin UI for `BusinessInquiry`** (§10/§13) means a real operational blind spot exists today: institutional leads are captured and emailed once, but there's no durable, browsable staff-side record if that email is missed — the `InquiryStatus` workflow (`NEW`→`CONTACTED`→`CLOSED`) exists in the schema but nothing drives it.
9. **Single environment file (`.env`) contains what look like live Cloudinary credentials** committed directly in this checkout (cloud name/API key/secret populated, not blank like every other provider). Worth confirming with the user whether this is an intentional dev-only account or something that should be rotated/removed from the checked-in file before this package is shared further — flagged rather than assumed either way.
10. **This report itself was not persisted to the repository when first produced** (see the note at the top of this file) — a process risk for a project whose own convention is that `PHASE_*.md` files are the durable record. Closed by creating this file during Phase 0 validation.

---

## Summary

The MUV platform is a well-architected, single-codebase Next.js 15 commerce system in a genuinely advanced state — not a prototype. Eighteen phases of documented, self-audited work have produced a real admin dashboard, real CMS, real payments/shipping/messaging integrations (pluggable, currently unconfigured), a real (non-LLM) personalization layer, and hardened security/performance/SEO baselines. The codebase compiles and builds clean today. What remains is overwhelmingly **operational** (real provider credentials, a production `AUTH_SECRET`, test coverage, a horizontally-scalable rate limiter) rather than **architectural** — plus one concrete UI gap (business inquiry management) and a small number of consciously-deferred features named throughout the phase reports themselves.
