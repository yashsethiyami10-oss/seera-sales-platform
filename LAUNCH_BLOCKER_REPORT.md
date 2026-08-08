# MUV Digital Flagship™ — Launch Blocker Report

Companion to `WEBSITE_COMPLETION_AUDIT.md`. Every item below was confirmed directly against
current code, current git state, or this repository's own most recent, dated, live-verified
deployment reports — not assumed from a stale checklist. Ranked by actual severity to a real
customer launch, not by document age.

**No implementation was performed to produce this report.** Every fix described below is a
recommendation for a future, separately-authorized execution phase.

---

## Tier 1 — Blocks real customers from completing real transactions

### 1. Razorpay production credentials are not set — online payment is completely non-functional
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` are confirmed absent
from Vercel Production (`vercel env ls production` returns zero Razorpay entries, per
`FOUNDER_FINAL_POLISH_REPORT.md`). Live evidence: **4 real customer orders** currently sit at
`paymentMethod: UPI, paymentStatus: PENDING, razorpayOrderId: null`, with zero `PaymentAttempt`
rows anywhere in the database — the exact signature of a request that never reached Razorpay.
The webhook, signature verification, and refund code are all real and correct; this is purely a
missing-credential problem. **Cash on Delivery is unaffected and verified working end-to-end.**
**Action:** Founder adds real live-mode Razorpay keys to Vercel Production from the MUV Razorpay
account, then registers the webhook URL in the Razorpay dashboard. External account action, not
an engineering task.

### 2. The production domain (`muvcare.in`) is not attached to the live deployment
The application is live today at `muv-platform.vercel.app`, not `muvcare.in`. `vercel domains ls`
returns zero domains for the project (`MUV_FINAL_CUSTOMER_EXPERIENCE_REPORT.md`). `NEXTAUTH_URL`/
`NEXT_PUBLIC_SITE_URL` were previously pointed at two different domains neither of which serves
this app (a real, already-fixed bug); they now correctly point at `muv-platform.vercel.app`. This
is fine for continued internal/staging use but is **not the intended public launch domain**.
**Action:** Founder decision — attach `muvcare.in` as a custom domain in the Vercel dashboard,
point its DNS accordingly, then re-point `NEXTAUTH_URL`/`NEXT_PUBLIC_SITE_URL` to the real domain
and update the Google OAuth redirect URI to match again.

### 3. No real human has ever clicked through this site on a real device or browser
This is the single most repeated caveat across every dated engineering report reviewed for this
audit (`PHASE_1D_RELEASE_READINESS.md`, `PHASE_1_KNOWN_ISSUES.md`, `MUV_FINAL_CUSTOMER_EXPERIENCE_REPORT.md`,
`FOUNDER_FREEZE_SPRINT_2_REPORT.md`, `FOUNDER_FINAL_POLISH_REPORT.md`) — every one of them states,
independently, that the engineering environment they ran in has **no browser automation and no
real device access**, so every mobile-viewport, touch-gesture, cart/checkout click-through, and
keyboard/screen-reader claim in this codebase's history is "verified by code review and a clean
build," never "verified by a person actually using the site." Several real defects (mobile
overlap swallowing taps, a cart-quantity bug, a coupon that vanished between pages) were **only**
ever found the one time this did happen (a real Founder click-through pass, Phase 1D). This
strongly suggests more such defects remain undiscovered simply because the one method that has
reliably found them hasn't been repeated since.
**Action:** a real person, on a real phone (Standard **and** Express delivery, both COD and — once
item 1 is resolved — a real online payment, refunded immediately) and a real desktop browser,
walks the full customer journey end to end before any public launch announcement. This is people/
process work, not an engineering task, and should not be skipped in favor of "the build is clean."

---

## Tier 2 — Real, code-confirmed gaps that a launch should not ship without

### 4. Favicon and social-share image are genuinely absent
Confirmed directly (`Glob` against `app/icon.*`, `public/favicon.*`, `public/og-default.*` —
zero matches; `public/` contains only `logo.png`, two AI-widget logo assets, `hero`, and
`transparent.png`). `lib/seo.ts:19` references `${SITE_URL}/og-default.png` for every page that
doesn't supply a custom image — every such share link on WhatsApp/social media renders a broken
image today. Trivial to fix (add two image assets), high relevance given how much Indian D2C
traffic arrives via WhatsApp link shares.

### 5. Zero analytics or conversion tracking exists anywhere in the codebase
Confirmed by source grep and `package.json` dependency inspection — no GA4, no Vercel Analytics,
no Tag Manager, no pixel of any kind. Not called out in any prior document as a blocker, but a
genuine gap for a commerce launch: there is currently no way to measure traffic, funnel drop-off,
or conversion once real customers arrive.

### 6. `MUV_GSTIN` and `SELLER_STATE` are not set to real values
Invoices currently show a placeholder `"GSTIN_NOT_CONFIGURED"` string instead of a real GSTIN;
the CGST/SGST-vs-IGST split logic uses a `SELLER_STATE` value that needs Founder confirmation.
This is a legal/tax-compliance requirement for a real Indian e-commerce business, not a cosmetic
gap — real invoices should not be issued until this is set correctly.

### 7. In-memory rate limiting may already be weaker in production than every prior document assumed
Every existing document (`SECURITY.md`, `AUDIT.md`, `DEPLOYMENT_READINESS.md`) frames
`lib/rate-limit.ts`'s in-memory counters as "correct for a single server instance, needs Redis
before horizontal scaling" — written when the deployment target was assumed to be a single
persistent GoDaddy VPS process. **The actual live deployment target is now Vercel serverless
functions**, where separate invocations can run on different, ephemeral instances with no shared
memory between them. This means the 5-attempts/5-minute login limiter, the signup limiter, and
the coupon-validation limiter may **already** be materially weaker in production today than the
codebase's own security documentation believes — this is a newly-surfaced elevated-priority
finding of this audit, not a restatement of an old one.
**Action:** Founder Review Required — either confirm Vercel's actual function-instance reuse
behavior is sufficient in practice, or move to Redis-backed limiting (`@upstash/ratelimit`,
already the documented target architecture, same function signature) sooner than "before scaling"
implies.

### 8. Google OAuth is broken in production (`error=Configuration`)
Confirmed live (`/api/auth/signin/google` returns `error=Configuration`). Most likely cause:
Google Cloud Console's Authorized redirect URIs don't yet list the real callback URL. Requires
access to the Google Cloud Console this audit does not have — Founder or whoever holds that
account needs to update it. Email/password login is unaffected and confirmed working.

### 9. No monitoring, error tracking, or confirmed database backup/restore drill
`lib/logger.ts` writes structured stdout only — nothing pipes to Sentry, and no uptime monitor is
configured. Both have zero-cost free tiers and close a real visibility gap; there is no reason not
to add both regardless of budget. Separately, no automated backup schedule or restore drill has
been confirmed at the Neon database-host level — an untested backup is a hope, not a backup.

### 10. Stock is decremented before payment is confirmed, with no cleanup job
`createOrder` decrements inventory immediately, before `initiatePayment` runs. If a customer
abandons an online payment (as already happened for the 4 stuck production orders), that stock
stays held indefinitely. A scheduled job to auto-cancel and restock stale `PENDING` orders is
documented in the code's own comments but not implemented. Low risk today (COD-only, low volume);
becomes a real revenue/inventory risk the moment Razorpay is turned back on (item 1) at any
meaningful order volume.

### 11. CMS blog editor has no admin UI
`app/admin/cms/blog/` is a literal empty directory with no nav entry, while `actions/blog.ts` and
the `BlogPost` model are fully implemented and already power the live `/journal` pages. Staff
cannot create or edit blog posts through the admin panel today — not a customer-facing defect, but
blocks any post-launch content operations until built.

### 12. Founder OS is functionally complete but disabled, and internally inconsistent
`ENTERPRISE_FOUNDER_OS_ENABLED` seeds to `false`; the real dashboard is gated off by default.
Separately, two differently-scoped functions both named `getFounderDashboard()` compute different
numbers, and Founder-facing data is fragmented across 4 non-linked surfaces. Needs an explicit
Founder decision on activation and consolidation — not a launch blocker for the public storefront,
but should not be left in this state indefinitely.

---

## Tier 3 — Genuine, but correctly non-blocking

- **Shipping webhook signature scheme** is a generic HMAC default, unconfirmed against each real
  courier's actual signing method — verify once a real provider account is live.
- **`requestPickup`** needs a real warehouse pickup location configured on the shipping provider's
  side before fulfillment can actually work; per-unit shipping weight is a 500g placeholder not
  tied to real product weight.
- **WhatsApp message templates** (if messaging is enabled at launch) need Meta/provider-dashboard
  approval, which has real lead time — start this early if wanted, skip entirely if email is
  judged sufficient at launch.
- **Cloudinary credential provenance** (dev sandbox vs. needs rotation) is an open item the
  Founder has not yet ruled on (`PHASE_1_KNOWN_ISSUES.md`).
- **`AUTH_SECRET`** — one older document (`PHASE_1_KNOWN_ISSUES.md`) states it is still the repo
  placeholder value; this could not be independently re-verified without reading a live secret
  (correctly out of scope for this audit). Given the app is demonstrably live and functioning on
  Vercel, this may already be resolved — **recommend the Founder explicitly confirm** the value in
  Vercel Production is a real rotated secret, not the checked-in default, before treating this as
  closed.
- **No CSP header** — deliberately deferred pending safe testing against live Razorpay/Cloudinary,
  a reasonable sequencing choice, not an oversight.
- **AI Widget / external LLM provider** — correctly, deliberately inactive by explicit Founder
  decision (Stage 6/7/8 frozen). Not a launch blocker; do not activate as part of this launch.
- **No dedicated `/search` page** and **no in-app customer notification inbox** — both functional
  today via existing alternate paths (embedded filtering; email/SMS/WhatsApp) — Founder Review
  Required only if a dedicated version is actually wanted for launch, not a defect.
- **Repository hygiene**: uncommitted local changes exist (see `WEBSITE_COMPLETION_AUDIT.md` §0)
  that are not part of what's currently deployed — worth resolving (commit, stash, or discard
  deliberately) before the next deploy so nothing is lost or accidentally shipped half-finished.

---

## Summary ranking (top 5 for the Founder's immediate attention)

1. Razorpay production credentials (Tier 1 #1)
2. A real human device/browser QA pass — has never happened (Tier 1 #3)
3. Domain attachment decision — `muvcare.in` vs. continuing on the Vercel subdomain (Tier 1 #2)
4. Favicon + OG image + GSTIN/SELLER_STATE — small, concrete, fast to close (Tier 2 #4, #6)
5. Analytics/monitoring wiring — zero-cost, currently completely absent (Tier 2 #5, #9)
