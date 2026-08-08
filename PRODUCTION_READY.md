# MUV — Production Readiness Report

Session date: 2026-07-19. This documents an actual production-hardening pass
against a real `npm install`, a real PostgreSQL database, a real `next build`,
and a real `next start` — every claim below was verified by running the
command or driving the app with a headless browser, not inferred from reading
code. Companion to `DEPLOYMENT_READINESS.md` (the pre-existing, still-valid
checklist for what to do *at* deploy time) and `AUDIT.md`/`WIRING.md`/
`SECURITY.md` (earlier structural documentation) — this file is the record of
what changed in this pass and the current, verified state.

**No deployment happened.** Everything below was run locally.

---

## 1. Build status

```
npm run build   → exit code 0
npm run start   → clean start, no errors
npm audit       → 0 vulnerabilities
npx tsc --noEmit → 0 errors
```

Route table (30 routes, `next build` output):

```
○  Static   : /, /cart, /shop, /login, /signup, /journal, /robots.txt, /sitemap.xml
ƒ  Dynamic  : /account/*, /admin/*, /checkout/*, /collections/[category],
              /products/[slug], /journal/[slug], /api/*
```

**One remaining build warning, judged not worth working around:**

```
A Node.js API is used (CompressionStream/DecompressionStream) which is not
supported in the Edge Runtime — from node_modules/jose/dist/webapi/lib/deflate.js,
via next-auth's middleware bundle.
```

This is not application code — `jose` (Auth.js's JWT library) statically
imports its JWE compression helper as part of the same module that encrypts
every session token. Session tokens in this app are signed+encrypted
(`session: { strategy: "jwt" }`) but never use JWE's optional `zip`
compression, so the flagged functions are bundled but never actually called
at runtime. Confirmed by reading `jose`'s source directly (not assumed).
Eliminating this warning would mean either patching `jose`/`next-auth`
internals (breaks on every reinstall) or replacing Auth.js's built-in session
encryption with hand-rolled JWT signing — too much risk to the authentication
path for a cosmetic warning. `CompressionStream`/`DecompressionStream` are
real, supported Web APIs in actual Edge Runtimes (Vercel Edge, Cloudflare
Workers) despite Next.js's static checker flagging them — this is a widely
reported, upstream-acknowledged false positive in the Next.js + Auth.js
combination, not a defect in this codebase.

---

## 2. What was fixed this session

### Dependencies / security advisories
- `next` `15.0.0` → `15.5.20` — the original pin's peer dependency only
  accepted a React 19 *release candidate* tag, not the stable release
  actually installed; also carries every 15.x security/bug fix since 15.0.0.
- `next-auth` `5.0.0-beta.25` → `5.0.0-beta.31` — fixes a published moderate
  advisory (email misdelivery, GHSA-5jpx-9hw9-2fx4) present in the pinned
  version.
- `lucide-react` `0.383.0` → `0.400.0` — the pinned version's peer deps
  didn't accept React 19 at all; moved to the first 0.x release that does,
  deliberately staying pre-1.0 to avoid v1's breaking icon-export renames.
- `postcss` pinned to `^8.5.20` (was effectively `8.4.31`, bundled inside
  Next.js's own dependency tree) via an `overrides` entry in `package.json`
  — fixes a moderate XSS advisory (GHSA-qx2v-qp2m-jg93) in PostCSS's
  stringifier.
- **Result: `npm audit` went from 3 moderate vulnerabilities to 0.**

### Correctness bugs (would have shipped broken)
- **Every page returned HTTP 500.** `app/layout.tsx` configured the Fraunces
  font with both `axes: ["opsz"]` and a fixed `weight` array — `next/font`
  rejects that combination outright. Fixed by setting `weight: "variable"`.
  This was the single highest-impact bug: nothing in the app worked until it
  was fixed.
- **Every server action's success/failure check was broken.** 13 files under
  `actions/` return `{ success: true, data }` object literals with no
  explicit return-type annotation — TypeScript widens `true` to `boolean` in
  that position, which silently breaks every `if (!result.success)`
  discriminated-union check across the entire app (signup, cart, checkout,
  wishlist, admin CRUD — everywhere a Server Action result is checked).
  Fixed by annotating `success: true as const` at all 60 call sites.
  **Self-correction, logged for transparency:** the first pass at this fix
  used a PowerShell read/write that silently corrupted em-dashes and other
  non-ASCII characters in 12 of those 13 files (Windows PowerShell 5.1's
  default `Get-Content` encoding misreads UTF-8 without a BOM). This was
  caught by a later `tsc`/grep sweep and fully corrected by re-deriving clean
  copies from the original archive and reapplying the fix with proper UTF-8
  handling — verified with a project-wide mojibake scan afterward.
- **`Category.description` field didn't exist** but three places in
  `app/(storefront)/collections/[category]/page.tsx` read it — added the
  column to `schema.prisma` (safe: no migrations existed yet at the time).
- **Shipping webhook handler couldn't work.** `app/api/webhooks/shipping/[provider]/route.ts`
  looks shipments up via `findUnique({ where: { awbNumber } })`, but
  `awbNumber` wasn't a unique column — Prisma requires uniqueness for
  `findUnique`. Added `@unique` (safe on a nullable column; Postgres allows
  multiple NULLs under a unique constraint).
- **`verifyPaymentSignature` could throw instead of rejecting a bad
  signature.** `crypto.timingSafeEqual` throws on mismatched buffer lengths
  rather than returning `false` — its sibling function
  (`verifyWebhookSignature`, three lines below it in the same file) already
  guards against this with a try/catch; `verifyPaymentSignature` didn't. A
  malformed/forged signature of the wrong length would skip the intended
  "mark payment attempt FAILED with reason" bookkeeping and fall through to
  a generic 500. Fixed to match its sibling.
- **Order numbers had an unhandled collision path.** `generateOrderNumber()`
  picks a random 6-digit number (900,000 possibilities) against a `@unique`
  column with no retry — low-probability but real; a collision would have
  failed checkout with a raw constraint-violation error instead of silently
  retrying. Added a bounded retry (`withOrderNumberRetry`, 5 attempts) that
  only engages on an actual `orderNumber` unique-constraint conflict.
- `prisma/seed.ts`, `components/ui/reveal.tsx` — minor `noUncheckedIndexedAccess`
  / possibly-undefined type gaps that `tsc --noEmit` caught; fixed with
  explicit guards.

### Production-mode-only bugs (worked in dev, broke in `next build`/`next start`)
- **`/login` failed the entire build.** It calls `useSearchParams()` directly
  in a page component with no Suspense boundary — Next.js requires this to
  prerender; without it, `next build` fails outright rather than warns.
  Fixed by wrapping the form in `<Suspense>`.
- **Every route using auth broke when built for the Edge Runtime.**
  `middleware.ts` imported the full `lib/auth.ts`, which pulls in `bcryptjs`
  (Node-only APIs) via the Credentials provider's `authorize()` — Edge
  Runtime (what middleware compiles to) can't load it. Split into
  `lib/auth.config.ts` (edge-safe: no providers, no adapter, just the
  session `jwt`/`session` callbacks) used by `middleware.ts` directly, and
  `lib/auth.ts` (the full config, providers + Prisma adapter) used only in
  Node-runtime code (Server Components, Route Handlers, Server Actions).
- **Login/signup were completely broken in production mode** (not dev) with
  a `[auth][error] UntrustedHost` error on every `/api/auth/*` call. Auth.js
  v5 refuses requests from a Host header it doesn't recognize once running
  in production, unless the platform is auto-detected (Vercel) or this is
  explicitly opted into — required for any self-hosted deployment. Fixed by
  setting `trustHost: true` in the shared auth config. **This was the
  critical blocker reported by the user and the last thing standing between
  "builds successfully" and "actually works in production mode."**

### Security hardening
- Added standard security response headers via `next.config.ts`:
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, and `Strict-Transport-Security` (HSTS) — verified
  present on live responses.
- `poweredByHeader: false` — removes the `X-Powered-By: Next.js` header.
- Hardened `.gitignore`: was only excluding `.env`/`.env.local`; now also
  excludes every `.env*.local` variant, `.env.production`, `.env.development`,
  `*.pem`, `coverage/`, `out/`, `build/` — reduces the chance of a real
  secret ever getting committed.
- Confirmed (didn't need to fix): payment signature verification uses
  constant-time comparison, Razorpay/shipping webhooks verify HMAC
  signatures against the *raw* request body before trusting any payload,
  every mutating Server Action is gated by `requireUser`/`requireStaff`/
  `requireAdmin` from `lib/rbac.ts`, passwords are bcrypt-hashed at 12
  rounds, no raw SQL string interpolation anywhere (`$queryRaw` usage is
  tagged-template-only, no `$queryRawUnsafe`), no secrets or API keys
  hardcoded anywhere in the source.
- **Considered and deliberately not added:** a Content-Security-Policy
  header. This app loads Razorpay's `checkout.js` from an external origin
  and renders inline JSON-LD via `dangerouslySetInnerHTML` — a CSP strict
  enough to matter would need real testing against the live checkout flow
  (which needs real Razorpay keys) to avoid silently breaking payments.
  Flagged as a follow-up, not attempted blind.

### Performance
- Confirmed font loading is already optimal: self-hosted via `next/font`
  (no runtime Google Fonts request), `display: "swap"`.
- Confirmed image usage: no raw `<img>` tags anywhere in the app; every
  image goes through `next/image`.
- Confirmed the existing caching strategy (`lib/cache.ts`) is sound:
  tag-based `unstable_cache` + `revalidateTag`/`revalidatePath` called from
  every relevant mutation (verified for CMS/homepage specifically) — the
  static homepage correctly regenerates on admin edits, not just on a timer.
- `next.config.ts`'s `output: "standalone"` was tried and **reverted** — it
  makes this project's own `npm run start` refuse to serve correctly
  (Next.js explicitly warns `next start` doesn't work with standalone
  output; it needs `node .next/standalone/server.js` plus a manual copy of
  `public/`/`.next/static/` instead). Since the task required `npm run
  start` to work, and this project doesn't have a Docker-based deploy
  pipeline (yet) to make use of it, keeping the simpler default was the
  right tradeoff. Left a comment in `next.config.ts` explaining this for
  whoever revisits it when a containerized deploy is actually set up.
- Confirmed 0 unused top-level dependencies — every package in
  `package.json` (`next`, `react`, `react-dom`, `next-auth`,
  `@auth/prisma-adapter`, `@prisma/client`, `bcryptjs`, `zod`,
  `lucide-react`, `clsx`) is actually imported somewhere. `sharp` (flagged
  in `npm install` output) is Next.js's own optional dependency for
  self-hosted image optimization, not dead weight.

---

## 3. What was verified live (not assumed)

All of the following were driven with a real headless Chromium session
(Playwright) against the actual production build (`next start`), not the dev
server, with a real seeded PostgreSQL database:

| Flow | Result |
|---|---|
| Admin login (`admin@muv.co.in`) | ✅ succeeds, session persists |
| `/admin` dashboard | ✅ loads, shows real revenue/order/customer counts from Postgres |
| `/admin/products` | ✅ loads, "Add Product" modal opens, **product creation actually writes to the DB** (confirmed the new product appeared in the list) |
| `/admin/orders` | ✅ loads, shows real orders; status-change control is wired to the real `updateOrderStatus` Server Action; **attempted an invalid status jump (PLACED→DELIVERED) and confirmed the server-side `ALLOWED_TRANSITIONS` guard correctly rejected it** without mutating the order |
| Unauthenticated access to `/admin` | ✅ still correctly redirects (307) to `/login` in the production build |
| Customer signup | ✅ creates a real user+customer row, auto-signs-in, redirects to `/account` |
| Add to cart | ✅ real client-side cart state, badge count updates |
| Checkout — Address step | ✅ saves a real address via `addAddress` |
| Checkout — Shipping/Payment/Review steps | ✅ all four steps navigate correctly |
| Checkout — COD order placement | ✅ **places a real order, decrements real inventory, redirects to `/checkout/success?order=...`** |
| Public API routes (`/api/products`, `/api/categories`, `/api/homepage`, `/api/blog`) | ✅ all return 200 with real data |
| Security response headers | ✅ confirmed present (`X-Frame-Options`, HSTS, etc.) on live responses; `X-Powered-By` confirmed absent |
| All 14 spot-checked routes | ✅ 200 in production mode |

All test data created during this verification (5 test user accounts, 1 test
product, 1 test order) was deleted afterward — the database is back to only
the original seed data (plus whatever legitimate orders already existed
before this session, which were not touched).

**Not tested (requires real credentials this environment doesn't have):**
Razorpay online payment (UPI/Card/Netbanking — only COD was tested, since
`RAZORPAY_KEY_ID`/`SECRET` are unset), transactional email delivery
(`RESEND_API_KEY` unset — confirmed the code path fails gracefully and
logs, doesn't crash checkout), SMS/WhatsApp notifications, and any shipping
provider's live rate/label API.

---

## 4. Remaining issues

Ranked by what actually blocks a real launch vs. what's safe to defer.

### Should fix before going live
1. **5 dead footer links** — `/about`, `/contact`, `/shipping`, `/returns`,
   `/faq` (in `components/storefront/footer.tsx`) all 404; confirmed via
   both browser console errors and server response codes. **Deliberately
   not fixed in this pass** — three of these (Shipping, Returns, Contact)
   are policy/legal-adjacent pages for a real Indian e-commerce business;
   writing that copy myself risks stating something factually wrong about
   MUV's actual return window, shipping terms, or contact details. This
   needs real content from the MUV team, not fabricated placeholder text.
2. **Payment/notification provider credentials are all unset**
   (`RAZORPAY_*`, `RESEND_API_KEY`, shipping provider keys, messaging
   provider keys). The app degrades gracefully without them (confirmed —
   COD checkout works, missing-email is logged not thrown) but online
   payment, transactional email, SMS, and live shipping rates don't
   function until these are set to real production credentials.
3. **`MUV_GSTIN` is unset** — invoices will show `GSTIN_NOT_CONFIGURED`
   instead of a real GSTIN. This is a tax-compliance requirement for India,
   not just a cosmetic gap.
4. **`next.config.ts`'s `images.remotePatterns`** still points at the
   placeholder `cdn.example.com` — needs the real image/CDN host once
   `lib/media.ts`'s upload provider is wired to one.

### Safe to defer (documented, single-instance-appropriate for now)
5. Rate limiting (`lib/rate-limit.ts`) and caching (`lib/cache.ts`) are both
   in-memory — correct and sufficient for one server instance, but won't
   share state across multiple instances/regions. Both already have
   Redis-based upgrade paths documented in their own file comments; revisit
   before horizontal scaling, not before a single-instance launch.
6. No scheduled job exists for abandoned-payment cleanup or scheduled blog
   post auto-publishing beyond the request-time check — both documented
   inline in `actions/payments.ts` and `actions/blog.ts` with the exact
   query needed once a scheduler (Vercel Cron or equivalent) is wired up.
7. CSP header not added — see Security Hardening section above for why.
8. `output: "standalone"` not enabled — revisit if/when this deploys via
   Docker rather than a plain `npm run start` process.

### Cosmetic, not fixable by this codebase
9. The one `jose`/Edge Runtime build warning — see Section 1. Confirmed
   harmless, upstream-only.

---

## 5. Required environment variables

Full reference: `.env.example` (37 variables, already present and accurate
— not duplicated here). Grouped by what actually breaks if missing:

| Required to boot at all | If missing |
|---|---|
| `DATABASE_URL` | App doesn't start |
| `AUTH_SECRET` | Auth.js throws on boot (by design) |
| `NEXTAUTH_URL` (set to the real production origin, e.g. `https://www.muv.co.in`) | Auth callback URLs resolve incorrectly |

| Required before that feature works | If missing |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Only COD checkout works; online payment can't create orders |
| `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` | No transactional emails send (order confirmation, password reset, etc.) — logged, doesn't crash anything |
| `MUV_GSTIN` | Invoices show a placeholder instead of a real GSTIN |
| `SHIPPING_PROVIDER` + that provider's keys, `WAREHOUSE_*` | Shipping rate calculation and fulfillment throw |
| `MESSAGING_PROVIDER` + that provider's keys | SMS/WhatsApp sends throw (caught, non-blocking) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional) | Google login silently unavailable, not a crash |
| `NEXT_PUBLIC_SITE_URL` | Emails/sitemap/Open Graph tags get wrong or empty absolute URLs |

**Not in `.env.example` but relevant to this session's fixes:** no new
environment variable was introduced. `trustHost: true` (the fix for the
critical auth blocker) is set directly in code (`lib/auth.config.ts`), not
via an env var — this was a deliberate choice so a misconfigured/missing env
var can't silently disable it once deployed.

---

## 6. Deployment checklist (delta on top of `DEPLOYMENT_READINESS.md`)

`DEPLOYMENT_READINESS.md` already has the exhaustive checklist (migrations,
backups, monitoring, DR runbooks) — still fully valid, read it before
deploying. This is only what's new or India/GoDaddy-specific given this
session's findings:

- [ ] **`trustHost: true` is safe only behind a reverse proxy you control.**
  It makes Auth.js trust whatever `Host` header the incoming request
  presents. If this ends up directly exposed to the internet without Nginx/
  Apache (or the hosting platform's equivalent) pinning `server_name` to
  the real domain, a forged Host header could manipulate callback URLs.
  Standard GoDaddy VPS/hosting setups with Nginx in front are fine; a raw
  `node server.js` bound directly to a public IP with no proxy is not.
- [ ] **PostgreSQL hosting**: GoDaddy's standard shared/managed hosting does
  not offer PostgreSQL — this needs either a GoDaddy VPS with self-managed
  Postgres, or an external managed Postgres (Supabase, Neon, Railway,
  RDS) reachable from wherever the app is hosted. Confirm which before
  attempting to deploy; this determines the actual `DATABASE_URL`.
  `DEPLOYMENT_READINESS.md`'s connection-pooling note applies either way.
- [ ] Set every env var from Section 5 above in the hosting platform's own
  secret/env config — not by uploading a `.env` file.
  `NEXTAUTH_URL`/`NEXT_PUBLIC_SITE_URL` must be the real HTTPS production
  domain, not `localhost`.
- [ ] Run `npx prisma migrate deploy` (not `db push`, which is what this
  local session used for speed) against the production database — see
  `DEPLOYMENT_READINESS.md` Section 3 for the full migration discipline.
- [ ] Run `npm run db:seed` only if the production database should start
  with the same demo categories/products/coupon/admin account — otherwise
  create the real initial catalog and a real admin account (then change the
  seeded `ChangeMe123` password immediately if the seed does run).
- [ ] Confirm HTTPS/SSL is terminated correctly (GoDaddy or Let's Encrypt)
  before setting `NEXTAUTH_URL` to `https://` — Auth.js's secure-cookie
  behavior depends on this being accurate.
- [ ] Resolve the 5 dead footer links (Section 4, item 1) with real content
  before launch — broken links on a live storefront are a real UX/SEO cost.
- [ ] Everything in `DEPLOYMENT_READINESS.md` Sections 1–7 (webhooks
  registered against the real domain, live-mode Razorpay keys, backup/
  monitoring/DR setup) still applies in full.

---

## 7. Summary

Started this pass with: 3 npm security advisories, a build that failed
outright (missing Suspense boundary), every page 500ing (font config bug),
every Server Action's error handling silently broken (TS widening bug), and
— once the build was fixed — authentication completely non-functional in
production mode (`UntrustedHost`). All of the above are now fixed and
verified against a real production build with a real database.

**Current state: builds cleanly, starts cleanly, and every core flow
(auth, admin CRUD, cart, COD checkout) has been driven end-to-end against
the actual production server and confirmed working.** What's left — real
provider credentials, real footer-page content, a GSTIN, and the
infrastructure-level items in `DEPLOYMENT_READINESS.md` — are launch
prerequisites that require business decisions or real third-party accounts,
not further engineering against this codebase.
