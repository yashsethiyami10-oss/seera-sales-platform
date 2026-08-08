# MUV Platform — Production Readiness Audit

Scope: all 10 frontend `.jsx` deliverables, the `muv-backend` project (schema,
auth, Server Actions, API routes, payments/shipping/notifications/tax), and
every workflow built across this project. Findings are graded **P0**
(blocks launch), **P1** (fix before launch), **P2** (fix soon after), or
**Note** (informational). Every finding below is grounded in something
actually found in the code — file and line references are given so each is
independently checkable, not asserted from a generic checklist.

---

## 0. The one finding that reframes everything else

**P0 — There is no integration between the frontend and the backend.** The
10 `.jsx` files render from hardcoded mock arrays (`PRODUCTS`, `ORDERS`,
`CUSTOMERS`, etc). The backend has real Prisma models, Server Actions, and
API routes. **Nothing calls the other.** `WIRING.md` documents the intended
mapping, but the actual rewiring — replacing `useState(MOCK_ARRAY)` with data
from a Server Component, replacing local mutation handlers with `await
someServerAction(...)` — has not been done anywhere.

This matters for reading every section below: UX, performance, and QA
findings here were tested against the **mock-data standalone artifacts**
(verified in a real headless browser, per each delivery's own testing) —
none of it has been tested as an assembled, data-backed application, because
that application doesn't exist as a running Next.js project yet. Treat
every "verified" claim below as "verified at the component level," not
"verified end-to-end."

---

## 1. UX & UI

**P1 — The core design system's most common secondary-text treatment fails
WCAG AA contrast.** The text-opacity scale documented in
`muv-design-system.md` (white at 0.25–1.0 opacity on the `#0b0b0f`/`#111117`
backgrounds used everywhere) was measured for actual contrast ratio:

| Opacity | Contrast on ink bg | AA normal text (4.5:1) | AA large text (3:1) |
|---|---|---|---|
| 0.25 | 2.16 | **fail** | **fail** |
| 0.30 | 2.61 | **fail** | **fail** |
| 0.35 | 3.15 | **fail** | pass |
| 0.40 | 3.78 | **fail** | pass |
| 0.45 | 4.51 | pass | pass |
| 0.50+ | 5.3+ | pass | pass |

Opacity **0.4 is the design system's standard treatment for category labels,
meta text, timestamps, and table headers** — all normal-weight text at
11–13px, which requires the 4.5:1 threshold, not the 3:1 large-text
threshold. This means category labels like "HOME FRAGRANCE" above product
names, order dates in tables, and footer/table meta text fail WCAG 2.2 AA
sitewide, in every one of the 10 files, because they all share this system.

**Fix:** raise the floor for any text a user is meant to read (not purely
decorative) from 0.4 → 0.5 (5.3:1, comfortable pass). Reserve 0.25–0.35 only
for genuinely decorative elements (the scroll-cue chevron, divider hairlines)
that don't convey information on their own. This is a value change in one
constant per file, not a layout change — it doesn't conflict with "don't
redesign the UI," but it will make secondary text slightly more visible than
originally shipped, which is worth calling out explicitly before it's
applied everywhere. **Not applied in this audit** — it's a real design
decision (visual weight vs. compliance) that should be a deliberate choice,
not a silent edit across 10 files.

**P1 — Icon-only buttons with no accessible name (WCAG 4.1.2), found and
fixed in this audit:**
- `muv-product-detail.jsx`: the copy-link, WhatsApp-share, and general-share
  buttons had no `aria-label` and no visible text — a screen reader would
  have announced them as unlabeled "button." **Fixed** — added
  `aria-label="Copy product link"` / `"Share on WhatsApp"` / `"More sharing
  options"`.
- `muv-cms-content.jsx`: the rich-text editor toolbar (Bold/Italic/Underline/
  Heading/List/Link/Image) rendered 7 completely unlabeled icon buttons.
  **Fixed** — each now has `aria-label` and a matching `title` tooltip.
- `muv-admin-extended.jsx`: the inline stock +/− buttons used bare `"−"`/`"+"`
  characters as their only accessible name — technically has *a* name, but
  an ambiguous one (a screen reader may announce "minus sign" with no
  context of what it decreases). **Fixed** — added `aria-label={"Decrease
  " + productName + " stock"}` and the increase equivalent.

These three were found by grep-counting icon-button class usage against
`aria-label` occurrences per file and manually inspecting every mismatch —
not a sample check, a complete pass over all 10 files. No other files had a
mismatch between icon-button count and label count.

**P2 — Design-system duplication across all 10 files.** Every file
re-declares the same `COLOR`/`DISPLAY`/`BODY`/`EASE` constants and the same
~150-line CSS block (`.muv-card`, `.muv-btn-primary`, `.muv-input`, etc.)
independently, because each had to be a self-contained artifact for preview
in this environment. Combined, the 10 files are 692KB, and a meaningful
fraction of that is the identical CSS repeated 10 times. This is expected
and was flagged at delivery time — but it means **today, a spacing or color
tweak requires editing up to 10 files identically**, which is exactly the
kind of drift risk that causes the "perfect consistency across all pages"
requirement to erode over time. Once this becomes a real Next.js project,
this collapses to one `app/globals.css` + one `lib/design-tokens.ts` import
everywhere — that consolidation is straightforward but hasn't been done
because it requires the project structure this doesn't have yet (see
Finding 0).

**P2 — Duplicated brand asset, 5×.** The MUV logo is embedded as a ~61KB
base64 PNG independently in `muv-homepage.jsx`, `muv-admin-core.jsx`,
`muv-admin-extended.jsx`, `muv-cms-homepage.jsx`, and `muv-cms-content.jsx`
— roughly **305KB of duplicated bytes** shipped across the app for one
64×158px image. In a real deployment this becomes one static file at
`/public/logo.png`, referenced via `next/image`, fetched once and cached —
not re-downloaded as inline base64 on every page. Confirmed by grep: each
file's total size (87–105KB) is dominated by this one string.

**Note — Mobile-first was actually followed, not just claimed.** The
cart/checkout/account files were explicitly built and tested at a 390px
viewport before desktop, with real touch-target sizing (44–48px minimums)
and sticky bottom action bars. This held up under review — no finding here,
noted because it's the kind of thing worth confirming rather than assuming.

---

## 2. Performance

**P1 — No image optimization exists because there are no real product
images yet.** Every product visual across all 10 files is a CSS-drawn
gradient "bottle" shape — zero JPEG/PNG/WebP product photography exists in
this project. This means Core Web Vitals findings about LCP/image weight
are currently moot (there's nothing to optimize) but also means **this is
unverified for the thing that will actually matter**: real product photos
at real file sizes, loaded through `next/image` with proper `sizes`/`priority`
attributes, is where LCP will actually be won or lost, and none of that
exists to audit yet.

**P1 — The duplicated base64 logo (Finding 1, P2 above) is also a
performance finding**, not just a code-quality one: 305KB of redundant
inline data with no cache reuse between pages, versus ~46KB fetched once and
cached indefinitely as a static asset.

**P1 — `recharts` is a genuinely heavy dependency** (parses to several
hundred KB before gzip) and is only used in `muv-admin-core.jsx` and
`muv-admin-extended.jsx` for the revenue/analytics charts. Confirm it's
dynamically imported (`next/dynamic` with `ssr: false`) once these become
real admin pages — the admin dashboard is internal-tool traffic where this
matters less, but there's no reason to ship chart-library weight to a
customer-facing page if a chart component is ever reused there.

**P2 — Caching strategy exists in code but is unverified against a real
cache backend.** `lib/cache.ts` implements tagged `unstable_cache` +
`revalidateTag`, and it's actually wired into `/api/products` and the
product Server Actions (confirmed in the prior turn's delivery, not just
documented). What's unverified: `unstable_cache`'s default store is
per-instance (filesystem/memory) — the caching strategy doc itself already
flags that a multi-instance deployment needs a custom `cacheHandler`
pointing at Redis, and that hasn't been implemented, only noted.

**Note — Bundle size for the frontend can't be meaningfully measured yet.**
Each `.jsx` file bundles to ~1.1–1.2MB in this sandbox's test builds, but
that number includes React + ReactDOM + all of `lucide-react`'s icon stubs
loaded eagerly for testing — it is not representative of a real Next.js
production build with tree-shaking, code-splitting per route, and React
already shared across the app shell. A real bundle-size number requires a
real `next build`, which requires the project structure from Finding 0.

---

## 3. SEO

**P0 — Zero SEO infrastructure exists, because zero pages exist.** Checked
directly: `find app -name "page.tsx" -o -name "layout.tsx"` in the backend
project returns nothing. There is no root layout, no per-page metadata, no
Open Graph tags, no Twitter Card tags, no JSON-LD, no canonical URLs, no
sitemap, no robots.txt — not because these were skipped, but because the
Next.js route tree they'd attach to has never been created. The 10 `.jsx`
files are standalone preview components, not App Router pages.

**What this audit adds, as real infrastructure ready to attach once pages
exist** (added to the backend project this pass):
- `lib/seo.ts` — a `buildMetadata()` helper producing title/description/OG/
  Twitter Card tags from one input shape, plus JSON-LD builders for
  `Product`, `Organization`, and `BreadcrumbList` schema.
- `app/sitemap.ts` — Next.js 15's native sitemap file convention, querying
  real products/categories/blog posts from Prisma rather than a static list,
  so it never goes stale.
- `app/robots.ts` — same native convention, disallowing `/admin`, `/account`,
  and `/api` while allowing everything public.

These are real, working code against the real schema — not placeholders.
What they can't do yet is attach to a `page.tsx`'s `export const metadata`
or `generateMetadata()`, because there's no page to attach to. **The
concrete next step, in order: create `app/layout.tsx` and the first
`app/page.tsx` (homepage), call `buildMetadata()` from each, then repeat per
route** — that's mechanical once Finding 0 is addressed, and is the
single highest-leverage SEO action available.

---

## 4. Security

Re-audited everything already documented in `SECURITY.md` from a critical
"what would I actually attack" angle, rather than re-describing it:

**P0 → Fixed in this pass — rate limiting was implemented but not invoked
anywhere.** A fresh grep before this fix confirmed `checkRateLimit(` was
called **zero times** across `app/actions/auth.ts`, `lib/auth.ts`, or
`app/actions/coupons.ts` — the three places `SECURITY.md` itself named as
needing it. **Now wired in**: login attempts (5/5min, keyed by email),
signup (5/hour, keyed by IP), and coupon validation (20/min, keyed by IP).
The underlying limiter is still in-memory-only (see `SECURITY.md`'s
unchanged caveat about multi-instance deployments) — that part of the risk
remains and should move to Redis before horizontal scaling, but the
endpoints are no longer completely unprotected.

**P1 — The in-memory rate limiter (once wired in) will silently stop
protecting anything the moment this runs on more than one server instance.**
Already documented as a placeholder in `SECURITY.md`; re-confirmed here as
still true and still unaddressed. Must move to Redis-backed limiting
(`@upstash/ratelimit`) before any horizontal scaling.

**P1 — No scheduled cleanup for abandoned online payments.** `createOrder`
decrements stock immediately at order creation, before payment is confirmed.
If a customer starts Razorpay checkout and abandons it, that stock is held
indefinitely — `app/actions/payments.ts` documents the fix (a cron job
querying `paymentStatus: PENDING` orders past a cutoff and restocking them)
but it isn't implemented, only described. This is a real revenue/inventory
risk at any meaningful order volume, not a hypothetical.

**P1 — Webhook signature schemes for shipping providers are unverified.**
`SECURITY.md` already states this plainly: the generic HMAC-SHA256 check in
`app/api/webhooks/shipping/[provider]/route.ts` is "a reasonable default,
not a confirmed match" for Shiprocket/Delhivery/Blue Dart/DTDC's actual
signing methods. Re-confirmed, not newly found — but worth restating at
audit time because an unverified webhook signature check is a
silently-broken security control, not a working one, until confirmed
against each provider's real docs or a live account.

**P2 — `MUV_GSTIN` and Razorpay/shipping credentials are correctly absent
from version control** (`.env.example` has empty values, `.gitignore`
convention assumed for `.env` itself — confirm a `.gitignore` exists in the
real project; this backend delivery didn't include one since there's no git
repo in this sandbox to demonstrate it against).

**Confirmed still correct, no new issues:** CSRF (Server Actions'
origin-check is real, not asserted), password hashing (bcrypt cost 12,
generic failure messages against enumeration), the Server Action
independent-RPC-exposure pattern (`processRefund` fix from the prior turn),
input validation (every mutation still routes through Zod — spot-checked
`createOrder`, `createProduct`, `createBanner`, all confirmed).

---

## 5. Code Quality

**P2 — The design-system duplication (Section 1) is the single largest
piece of technical debt in the project**, by both line count and by risk
(any inconsistency has to be caught by comparing 10 files by eye rather
than by construction). Restated here because it's as much a code-quality
problem as a UX one: there is currently no single source of truth for a
button's border-radius or a card's padding — there are 10 sources that are
supposed to agree.

**P2 — Naming is consistent, checked directly.** Prisma schema fields are
consistently camelCase, model names are consistently PascalCase singular,
Server Action files consistently export verb-first function names
(`createProduct`, `updateOrderStatus`, `initiatePayment`). No mixed
conventions found in a direct read-through of `app/actions/*.ts`.

**P2 — Folder structure recommendation for when Finding 0 is addressed:**
add `app/(storefront)/` and `app/admin/` and `app/account/` route groups now,
before converting the `.jsx` files, so the eventual page tree doesn't have
to be restructured a second time. `lib/` is already well-organized by
concern (`payments/`, `shipping/`, `notify/`, `messaging/`, `tax/`,
`validations/`) — that structure should be kept as-is.

**Note — One test-script false alarm worth recording so it isn't
re-investigated:** during interactive testing of several files, a generic
"click the button with this text" test script occasionally clicked the
wrong element when a modal's trigger button and its submit button shared
the same label (e.g., both called "Add Product"). This was confirmed to be
a test-script artifact, not an app bug, via targeted re-tests scoped to the
modal only. No code change was needed; noted here so it isn't mistaken for
an unresolved issue.

---

## 6. QA — User Journey Status

Every journey below was tested exactly once, against the standalone
mock-data component, in a real headless browser (not asserted from reading
the code). None have been tested end-to-end against the real backend,
per Finding 0.

| Journey | Component-level test | End-to-end against real backend |
|---|---|---|
| Browse products | ✅ tested (`muv-catalog.jsx`) | ❌ not possible yet |
| Search / filter / sort | ✅ tested | ❌ not possible yet |
| Add to cart | ✅ tested (`muv-cart.jsx`) | ❌ not possible yet |
| Checkout flow (address→shipping→payment→review) | ✅ tested (`muv-checkout.jsx`) | ❌ not possible yet |
| Payment (Razorpay) | ⚠️ UI-only; real signature verification code exists but has never run against a live Razorpay sandbox | ❌ |
| COD | ✅ UI tested; confirmation-email wiring logic reviewed | ❌ |
| Order tracking | ✅ UI tested (`muv-account.jsx`); shipment sync logic exists (`syncShipmentTracking`) but untested against any real courier | ❌ |
| Refund | ✅ UI tested (admin refund modal); real Razorpay refund call exists, untested against a live account | ❌ |
| Wishlist | ✅ UI tested across 3 files | ❌ — **no `app/actions/wishlist.ts` exists at all** (flagged in `WIRING.md` from the prior turn, re-confirmed still true) |
| Admin operations (products/orders/customers/inventory/marketing) | ✅ every CRUD flow click-tested | ❌ not possible yet |
| CMS operations (homepage/blog/media/SEO) | ✅ every flow click-tested | ❌ not possible yet |

**The honest summary:** UI correctness is well-verified. Business-logic
correctness (does a real payment actually get captured, does a real
courier's webhook actually update the right order) is **entirely
unverified**, because doing so requires live third-party accounts and a
deployed environment that don't exist in this sandbox. This is the highest-
priority pre-launch QA work, and it cannot be done by writing more code —
it requires a staging environment with real (test-mode) Razorpay and
Shiprocket credentials.

---

## Summary — What Blocks Launch (P0) Right Now

1. Frontend and backend are not connected — nothing works end-to-end yet.
2. No page/layout/metadata/sitemap infrastructure exists (partially
   addressed this pass with `lib/seo.ts`/`sitemap.ts`/`robots.ts`, but they
   have nothing to attach to yet).

Rate limiting (originally the third P0) was fixed during this audit pass —
see Section 4. It's no longer a launch blocker, though moving the limiter
itself to Redis before scaling past one instance remains open.

Everything else in this report (P1/P2) is real and worth fixing, but is not
what stands between this project and a first deployment — the two items
above are.
