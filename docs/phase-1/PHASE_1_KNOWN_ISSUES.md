# Phase 1 — Known Issues

Consolidated, current-as-of-Phase-1D list of everything still open. Supersedes the "remaining issues"
sections scattered across the individual phase docs — this is the one list to check.

---

## Pre-Deployment Blockers (not blocking Founder Acceptance of the current state)

| Issue | Why it's open | Action needed |
|---|---|---|
| `AUTH_SECRET` is still the placeholder value | Every phase's own rules forbid changing secrets without explicit direction | Run `npx auth secret` and set it in the real deployment environment before going live |
| Seeded admin credential guard only checks for `localhost` in `DATABASE_URL` | A reasonable heuristic, not a perfect one | Review the guard (`prisma/seed.ts`) before pointing it at any non-local database, regardless of what its URL contains |
| Cloudinary credentials in `.env` — provenance unconfirmed | Rotating a credential is out of scope without Founder confirmation | Founder confirms whether these are an intentional dev sandbox or need rotation |

## Resolved in the Phase 1D Correction Pass (2026-07-26)

| Issue | Resolution |
|---|---|
| ~~Checkout's Express Delivery price (₹99) was never actually charged~~ | **Fixed** — `createOrderSchema` now carries `shippingMethod`; `createOrder` charges a real flat Express surcharge or real Standard/threshold pricing based on what the customer actually selected. Verified via type-check, build, and arithmetic tracing against a real order; not verified via a live browser-driven test order (no browser automation in this environment). See `PHASE_1D_DEFECT_LOG.md` DEFECT-1D-07. |
| No email normalization at signup/login/reset | **Fixed** — email is now trimmed and lowercased consistently everywhere it's compared. Live-verified: a mixed-case, whitespace-padded email now logs in correctly. DEFECT-1D-04. |
| Rate-limited login attempts showed the same error as wrong credentials | **Fixed** — a distinct, safe (non-account-confirming) message now shows when rate-limited. Live-verified via 6 real attempts. DEFECT-1D-05. |
| Homepage hero banner image ignored the CMS's `Banner.imageUrl` field | **Fixed** — the hero visual now uses the admin-uploaded image when set. Live-verified. DEFECT-1D-06. |
| Admin dropdowns/selects showed unreadable white-on-white text | **Fixed** — scoped `color-scheme: dark` + explicit option/hover/focus styling added to the admin shell only. DEFECT-1D-08. |
| No password show/hide control | **Added** — login, signup, and reset-password all now have an accessible toggle. DEFECT-1D-09. |

## Resolved in the Cart/Mobile Checkout/Coupon/Delivery/Returns/Admin Pass (2026-07-26)

| Issue | Resolution |
|---|---|
| Cart quantity minus button unreliable, no floor guard at the UI layer | **Fixed** — `type="button"`, `disabled` at quantity 1 with visual/tooltip signal, on both quantity buttons. DEFECT-1D-10. |
| Mobile cart/checkout overlap and unresponsive buttons | **Fixed** — root cause was unconditional `position: sticky` on the Order Summary/Billing Summary cards, now `lg:`-only. Explains the reported overlap and "buttons don't respond to taps" together (the floating card was intercepting touches). DEFECT-1D-11, DEFECT-1D-19. |
| Coupon applied on Cart disappeared on Checkout | **Fixed** — coupon state moved into the shared `CartProvider` (persisted the same way cart items already are), replacing three independent local `useState`s. DEFECT-1D-12. |
| Express Delivery was a flat ₹99, not threshold-based per the approved policy | **Fixed** — Express now follows the same ₹499 threshold as Standard (₹99 below, ₹50 at/above), consistent across cart, checkout, and `createOrder`'s actual charge. DEFECT-1D-13. |
| Selected delivery method (Standard/Express) was never persisted on the Order | **Fixed** — new `Order.shippingMethod` column; also fixed a self-discovered bug where the success page guessed the method from the fee amount (broken by the Express threshold change). DEFECT-1D-14. |
| Return/replacement policy was a placeholder with no defined window | **Fixed** — approved policy (48-hour window, damaged/leaked/wrong-product only, evidence required, used/change-of-mind excluded, admin review) now live on `/returns`, product FAQ, site FAQ, and shipping page. DEFECT-1D-15. |
| No customer-facing return/replacement request workflow | **Added** — "Report an Issue / Request Replacement" on delivered orders within 48 hours, with mandatory photo/video evidence, ticket numbers, and a server-enforced status workflow. Server-side re-checks ownership, delivery status, and the 48-hour window independent of the UI. DEFECT-1D-16. |
| No admin visibility into return/replacement requests | **Added** — `/admin/returns` queue with evidence review and status transitions. DEFECT-1D-17. |
| Admin panel reported not loading | **Investigated, not a code defect** — reconfirmed as the same recurring `next dev` HMR artifact (DEFECT-1D-01, DEFECT-1D-18); a fresh dev process and a full production-server sweep both served every admin route cleanly on first request. |

## Real, Evidenced Functional Gap

*(none currently open)*

## Deferred by Explicit Rule (secrets/external dependencies)

- Shipping webhook signature scheme unconfirmed per-provider (requires live courier documentation access)
- WhatsApp notification templates pending provider-dashboard approval (external action, code is ready)

## Deferred as Out-of-Scope for Phase 1 (new features / tooling decisions, not stabilization)

- No automated test suite
- No ESLint configuration
- In-process rate limiting (fine for one server instance; needs Redis before horizontal scaling)
- No Content-Security-Policy header (deliberately deferred pending a safe way to test against live Razorpay/Cloudinary)
- No unified marketing-campaign system (banners + coupons remain independently managed)
- Personalized homepage rail is not admin-toggleable
- No cross-device `Cart` table (deliberate design choice)
- No background job scheduler/cron
- No customer-facing "Your Shopping Profile" view

## Environment/Tooling Limitations (not application defects)

- **This environment has no browser automation** — every visual, interactive, mobile-device, and
  accessibility (keyboard/screen-reader) test in Phase 1's scope requires a human in a real browser.
  See `PHASE_1D_FOUNDER_ACCEPTANCE_CHECKLIST.md`.
- **`next dev` exhibits intermittent, self-resolving 404/500 errors** on a small number of routes
  under certain conditions — confirmed, through direct investigation, to be a Next.js dev-server/HMR
  artifact, not an application defect (the identical routes passed 100% against the production
  server, `npm run build && npm run start`, across a full 43-route sweep). If this is seen during
  local testing: reload once, or prefer testing against `npm run build && npm run start` for the most
  reliable experience.
- **No real payment-gateway transaction has been run** in this environment (no sandbox/browser
  access) — the checkout code path has been verified at the code level only.
- **The corrected Express Delivery pricing was not verified via a live browser-driven test order** —
  verified by type-check, build, and direct arithmetic tracing against a real existing order instead.
  A live click-through test order (Standard and Express, both payment paths) is still recommended as
  part of the Founder Acceptance pass.
- **Cart quantity controls, mobile layout at real device widths (360/375/390/400/430px), coupon
  apply/persist/remove, and the new Report-an-Issue evidence upload were all verified at the code and
  schema/action level (build, type-check, direct Prisma-level workflow test, HTTP content checks) but
  not through an actual touchscreen/browser session** — no browser automation is available in this
  environment. These are the items most in need of the Founder's own device/browser re-test.

## Social Login — Current Status (Phase 1D correction pass)

| Provider | Implemented | Configured | Status |
|---|---|---|---|
| Google | Yes | No (`GOOGLE_CLIENT_ID`/`SECRET` blank) | Correctly hidden — will appear automatically once real credentials are set in `.env` |
| Apple | Yes | No (`APPLE_ID` not present in `.env`) | Correctly hidden — requires Apple Developer Program enrollment, a Services ID, and a `.p8` key to configure |
| Facebook/Meta | No | N/A | Not implemented — would require adding a Facebook provider to `lib/auth.ts`, a Meta for Developers app, and `FACEBOOK_CLIENT_ID`/`SECRET` |
| Instagram | No | N/A | Not implemented, and not recommended as a standalone method — Instagram's direct login API for this use case is deprecated; real "Instagram" sign-in today goes through Facebook Login |

## Explicitly Not an Issue (checked and confirmed fine)

- "MAGIC IN MUV" — confirmed absent from all website content, correctly preserved only where it may
  already exist on physical product labels (untouched, out of scope).
- Detergent-only positioning — confirmed not present; the brand is consistently framed across all
  five live categories.
- Approved category list — confirmed to match exactly, including which one is correctly flagged
  "Muving Soon™."
- Order-status persistence between admin and customer — no caching or logic bug found;
  `/account/orders/[id]` reads live, uncached data directly from the same `Order` row the admin
  updates. The original report was correctly attributed to customer login being blocked, not to a
  real status-sync defect — confirmed once login was fixed.
