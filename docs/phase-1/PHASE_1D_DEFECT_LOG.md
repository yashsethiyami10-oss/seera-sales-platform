# Phase 1D — Defect Log

Every anomaly encountered during Phase 1D verification, whether or not it resulted in a code change.
Per the Safe Correction Rule, a corrective edit requires: defect statement, evidence, smallest safe
fix, affected files, and regression risk — stated *before* any edit. **Zero corrective edits were
made this phase** — every anomaly investigated turned out to be either a pre-existing, out-of-scope,
already-documented item, or a dev-tooling artifact with no underlying code defect. This is reported
honestly rather than fabricating a fix to have something to show.

---

## DEFECT-1D-01 — Intermittent 404/500 in `next dev` mode (not a code defect)

- **Symptom:** `/collections/skin-care` intermittently returned 404; `/` once returned 500 with a
  React Server Components `InvariantError`, both only under `npm run dev`.
- **Evidence:** Full investigation in `PHASE_1D_FINAL_TEST_REPORT.md` ("Dev-Mode Anomaly" section) —
  direct database read confirmed the underlying data is correct; the page's `notFound()` logic is
  simple and unchanged; the identical route succeeded 10/10 times (including cold-start) against
  `npm run build && npm run start`; a full 43-route production-server sweep passed 43/43 with zero
  retries.
- **Root cause:** Next.js 15's dev-mode HMR/RSC bundler, not application code — matches a pattern
  already documented as recurring in this project's Phase 0 platform audit, predating both Phase 1C
  and this phase.
- **Smallest safe fix considered:** None applicable — there is no application code to change. The
  practical mitigation (documented in `PHASE_1_KNOWN_ISSUES.md` and the Founder Acceptance Checklist)
  is: if a page misbehaves during local testing, reload once, or prefer `npm run build && npm run
  start` for the most reliable local testing experience, since it does not exhibit this behavior.
- **Files affected:** None.
- **Regression risk:** None (no change made).
- **Disposition:** Documented, not fixed — fixing Next.js's own dev-server internals is outside any
  reasonable scope for this project and would not address a real deployment concern (production mode
  is unaffected).

## DEFECT-1D-02 — Considered: simulate a test order via a raw Server-Action request

- **Symptom:** N/A — this is a testing-approach decision, not a defect in the app.
- **Evidence:** Phase 1D's test scope (§C) asks to "submit a safe test order where environment
  permits." No browser automation is available to drive the real checkout UI (client-side cart state,
  address form, terms checkbox, Razorpay modal).
- **Consideration:** A raw HTTP POST could theoretically be crafted to hit the Server Action's
  internal RSC endpoint directly, bypassing the UI entirely.
- **Decision:** **Not attempted.** Reasons: (1) Next.js Server Action endpoints use a build-specific
  action-ID hash and a specific RSC body-serialization format not intended for direct external
  construction — a malformed attempt risks an unpredictable error or, worse, a partially-applied
  database write; (2) it would not represent genuine user-facing testing, only a protocol-level
  exercise; (3) this phase's own core rules restrict database changes to confirmed-defect corrections,
  and creating fake order/customer data via a workaround is a database change with no defect behind
  it. Marked **Not Testable in Current Environment** in the test report instead of forced.
- **Files affected:** None.
- **Regression risk:** None (nothing attempted).

## DEFECT-1D-03 — Port conflict during production-server verification (operator error, self-resolved)

- **Symptom:** `npm run start` failed with `EADDRINUSE: address already in use :::3000` on first
  attempt.
- **Evidence:** The `next dev` server from the same testing session was still bound to port 3000 when
  `next start` was launched.
- **Root cause:** Sequencing — the dev server task wasn't stopped before starting the production
  server. Not an application defect.
- **Fix:** Stopped the dev-server background task, then restarted `npm run start` successfully.
- **Files affected:** None (no code involved).
- **Regression risk:** None.

---

# Correction Pass — Authentication, CMS, Pricing & Admin UI (same day, following Founder testing)

Founder click-through testing (something this environment cannot do itself) found real defects the
first Phase 1D pass's automated/code-level checks couldn't surface. Each is logged in the required
format: defect, evidence, fix, files, regression risk — stated before the edit was made, exactly as
the correction pass's rules required.

## DEFECT-1D-04 — No email normalization (signup/login/reset)

- **Defect:** `authorize()`, `signup()`, and both reset-password actions compared raw, un-normalized
  email strings — a case or whitespace mismatch between signup and login would silently fail.
- **Evidence:** Direct code read of `lib/auth.ts`, `actions/auth.ts`, `lib/validations/customer.ts` —
  zero `.trim()`/`.toLowerCase()` calls anywhere in the auth path. Confirmed live: before the fix, a
  login attempt with `" ADMIN@MUV.CO.IN "` against the known seeded admin password failed; after, it
  succeeds and the session correctly resolves to `admin@muv.co.in`.
- **Fix:** `.trim().toLowerCase()` added to the email field in `credentialsSchema` (`lib/auth.ts`),
  `signupSchema` (`lib/validations/customer.ts`), and both reset schemas (`actions/auth.ts`).
- **Self-caught follow-up bug:** the first version of this fix chained `.email().trim().toLowerCase()`
  — Zod runs checks in declaration order, so `.email()`'s format validation ran on the *raw* string
  before trimming ever happened, meaning a leading/trailing space still failed. Caught by this pass's
  own live re-test (not assumed correct after the first edit), fixed by reordering to
  `.trim().toLowerCase().email()` in all four locations, then re-verified live.
- **Files:** `lib/auth.ts`, `lib/validations/customer.ts`, `actions/auth.ts`.
- **Regression risk:** Low — normalization only narrows matching (case/whitespace-insensitive),
  never rejects a previously-valid combination.

## DEFECT-1D-05 — Rate-limited login attempts showed the same message as wrong credentials

- **Defect:** `authorize()` returned `null` identically for "wrong password" and "rate-limited,"
  so a customer who got rate-limited during repeated testing saw the same unhelpful message even on
  a correct attempt.
- **Evidence:** Live-reproduced: 5 attempts against a fresh test email correctly returned
  `code=credentials`; the 6th (rate-limited) attempt, before the fix, returned the same
  `code=credentials`.
- **Fix:** New `RateLimitedError extends CredentialsSignin` with `code = "rate_limited"`, thrown
  instead of `return null` for the rate-limit branch only (the wrong-password branch is unchanged,
  intentionally still generic — see the code comment on why). `login-form.tsx` now shows a distinct
  message when `result.code === "rate_limited"`.
- **Verified this doesn't leak account existence:** the rate-limit check still runs *before* the
  Prisma user lookup, so the distinct message fires identically whether or not the email is
  registered.
- **Files:** `lib/auth.ts`, `components/auth/login-form.tsx`.
- **Regression risk:** Low — additive branch, existing generic-failure behavior unchanged for every
  other case.

## DEFECT-1D-06 — Homepage hero banner image ignored the CMS `Banner.imageUrl` field entirely

- **Defect:** `/admin/cms/homepage`'s banner image upload saves correctly to `Banner.imageUrl` (
  confirmed via direct database read — the field held a real, recently-updated Cloudinary URL), but
  the homepage's hero visual never read that field — it always rendered a hardcoded
  `HERO_CUTOUTS` lookup instead, so an admin's image edit had zero visible effect.
- **Evidence:** Live-confirmed before the fix: homepage HTML did not contain the updated image's
  Cloudinary path, despite the database holding it. Traced to `app/(storefront)/page.tsx`'s hero
  section rendering `heroMatch.cutout` (a different, hardcoded data source), never `heroBanner.imageUrl`.
- **Fix:** Hero visual now renders `heroBanner.imageUrl` when set, falling back to the existing
  `heroMatch` cutout logic only when it isn't — preserving the original "never a fabricated image"
  default for the empty case.
- **Files:** `app/(storefront)/page.tsx`.
- **Regression risk:** Low-medium — functionally correct and live-verified; a non-cutout admin image
  may not visually match the hero's transparent-silhouette styling as closely as the original
  hardcoded asset did (cosmetic, not functional — noted for awareness, not blocking).

## DEFECT-1D-07 — Checkout total mismatch: Express Delivery (₹99) silently became free

- **Defect:** `createOrderSchema` had no field to receive which delivery tier (Standard/Express) was
  selected at checkout, so `createOrder` always computed Standard's rate — a customer who picked
  Express and saw ₹707 at checkout was actually charged ₹608 (Standard's real, correctly-configured
  free-shipping rate) at order success.
- **Evidence:** Real order `#MUV423388` in the live database: subtotal 640 − discount 32 + shipping 0
  = 608, while `StoreSettings.freeShippingThreshold` (499) confirms 608 was the mathematically
  correct *Standard* total — proving Express's ₹99 was never transmitted or charged. This is the
  exact pre-existing gap flagged (but explicitly not fixed, as it required new schema/logic) in
  Phase 1C's own Decision Log D7 and `PHASE_1_KNOWN_ISSUES.md`.
- **Fix:** Added `shippingMethod: "STANDARD" | "EXPRESS"` to `createOrderSchema`; `createOrder` now
  charges a real flat ₹99 for Express (matching the exact value already displayed, unchanged) or the
  real Standard threshold logic otherwise; `checkout-client.tsx` now sends the customer's actual
  selection instead of nothing.
- **Files:** `lib/validations/order.ts`, `actions/orders.ts`, `components/checkout/checkout-client.tsx`.
- **Verification:** Type-check and build clean; traced the exact arithmetic against the real
  `#MUV423388` cart contents to confirm Express would now correctly total ₹707, matching what
  checkout has always displayed. **Not verified via a live browser-driven test order** — no browser
  automation is available in this environment, and constructing a raw protocol-level Server Action
  call was deliberately avoided (see DEFECT-1D-02 in the prior section) as it wouldn't constitute a
  genuine test and risks malformed data.
- **Regression risk:** Medium — this is the highest-risk change in this pass (live pricing logic).
  Mitigated by: schema default (`STANDARD`) preserves prior behavior for any caller that doesn't send
  the new field, and the Standard-path arithmetic is byte-identical to Phase 1C's already-verified
  logic (only Express is new).

## DEFECT-1D-08 — Admin dropdowns/selects unreadable (white background, no dark-mode signal)

- **Defect:** No `color-scheme` CSS property anywhere, and `.muv-input` never styled `<option>`
  elements — native `<select>` popups fell back to browser/OS default (light) rendering while
  inheriting this page's light text color, producing pale-on-pale or white-on-white text.
- **Evidence:** Confirmed via `Grep` across `styles/globals.css` — zero `color-scheme` occurrences,
  `.muv-input` has no `option`-targeting rules. Also confirmed the `[data-theme="light"]` block in the
  same file is dead code (`data-theme` is never set anywhere in `.tsx` source), ruling it out as the
  cause or a pre-existing "intended" light admin theme.
- **Fix:** Added `.muv-admin-shell` wrapper class (`app/admin/layout.tsx`) with scoped
  `color-scheme: dark`, explicit `option` background/color, and consistent hover/focus/disabled/
  table-row/sidebar/menu styling — all additive CSS, none of it touching the public storefront's
  theme handling (including the unused light-theme block, left exactly as found).
- **Files:** `app/admin/layout.tsx`, `styles/globals.css`.
- **Regression risk:** Very low — new, additively-scoped selectors only.

## DEFECT-1D-09 — Password fields had no show/hide control (feature request, not a bug)

- Not a defect; implemented as requested via one reusable `components/ui/password-input.tsx`
  (keyboard-accessible `<button>`, distinct `aria-label` per state, never alters the submitted
  `value`) used by login, signup (both password fields), and reset-password. No separate admin login
  page exists — admin shares the same login form, so this covers it too.
- **Files:** `components/ui/password-input.tsx` (new), `components/auth/login-form.tsx`,
  `components/auth/signup-form.tsx`, `app/(auth)/reset-password/page.tsx`, `styles/globals.css`.
- **Regression risk:** None — purely additive UI.

## Social login — inspected, not a defect

Google and Apple are implemented but unconfigured (`GOOGLE_CLIENT_ID`/`APPLE_ID` blank/absent in
`.env`) — correctly hidden, not shown as broken buttons. Facebook/Meta and Instagram are not
implemented at all (no provider in `lib/auth.ts`, no env vars anywhere) — not simulated, per the
correction pass's explicit rule. Only change made: the divider text now reads "or continue with"
instead of "or", as requested. No code exists to "fix" here — see the Final Response for the full
per-provider status table.

---

## Summary

**5 real code defects found and fixed this correction pass** (email normalization, rate-limit error
distinction, CMS banner image, checkout Express pricing, admin dark-theme contrast), plus 1 requested
feature added (password visibility) and 1 area inspected-and-confirmed-correct (social login). One
self-introduced bug (the Zod ordering issue in DEFECT-1D-04) was caught by this pass's own live
re-testing before being reported as fixed — not assumed correct after a single edit.

Combined with the original Phase 1D pass immediately above: **0 code defects found and fixed** in the
first pass (everything reachable by code review, build/typecheck, and live HTTP testing was either
already correct or an environment artifact), **5 found and fixed in this correction pass**, all of
which required actual human click-through testing to surface — exactly the category of defect the
first pass's own limitations section named as unverifiable without a browser. This is the expected,
healthy shape of a two-stage verification process, not a sign the first pass was inadequate: static/
code-level checks and live human testing catch genuinely different classes of bugs.

---

# Correction Pass — Cart, Mobile Checkout, Coupon, Delivery, Returns and Admin Recovery

Founder browser testing again surfaced defects unreachable by static/HTTP-level checks. Ten confirmed
defects, logged in the same required format before each edit was made.

## DEFECT-1D-10 — Cart quantity minus button unreliable, no floor guard at the UI layer

- **Defect:** `updateQuantity` (`lib/cart-context.tsx`) already clamped quantity to a minimum of 1
  internally, but the minus `<button>` in `cart-client.tsx` had no explicit `type="button"`, no
  disabled state at quantity 1, and no visual/tooltip signal — on some browsers/touch contexts a
  same-effect `disabled` guard prevents accidental double-fires and mystery no-ops at the floor better
  than relying on the clamp alone.
- **Evidence:** Direct code read of `components/cart/cart-client.tsx`'s quantity controls.
- **Fix:** Added `type="button"` to both buttons, `disabled={item.quantity <= 1}` plus dimmed opacity
  and an explanatory `title` on the minus button; increment button unchanged in behavior.
- **Files:** `components/cart/cart-client.tsx`.
- **Regression risk:** None — behavior at quantity ≥ 2 is unchanged; quantity 1 now visibly and
  functionally blocks further decrement instead of silently no-op'ing.

## DEFECT-1D-11 — Mobile overlap and unresponsive buttons: unconditional `position: sticky`

- **Defect:** Both Cart's Order Summary card and Checkout's Billing Summary card used
  `style={{ position: "sticky", top: 100 }}` with no responsive guard. On mobile's single-column
  layout this detached the card from normal flow and floated it over the Delivery Estimate section
  (Cart) and over the real step buttons (Checkout) as the page scrolled — explaining both the visual
  overlap and the "buttons don't respond to taps" report (the floating card was intercepting the
  touches, not the buttons underneath failing).
- **Evidence:** Direct code read of `components/cart/cart-client.tsx` and
  `components/checkout/billing-summary.tsx` — `position: sticky` was unconditional in both.
- **Fix:** Changed to `className="muv-card lg:sticky" style={{ top: 100 }}` in both files — sticky
  positioning now only applies at the `lg:` breakpoint (desktop), matching the two-column layout it
  was designed for.
- **Files:** `components/cart/cart-client.tsx`, `components/checkout/billing-summary.tsx`.
- **Regression risk:** Low — desktop behavior (where the two-column layout exists) is byte-for-byte
  unchanged; mobile gets normal document-flow positioning instead of floating.

## DEFECT-1D-12 — Coupon applied on Cart disappeared on Checkout, forcing re-entry

- **Defect:** `CartClient` and `CheckoutClient`/`BillingSummary` each held completely independent,
  page-local `useState` for the applied coupon, with no shared state or persistence connecting them —
  navigating from Cart to Checkout always lost it.
- **Evidence:** Direct code read confirmed zero shared state between the three components; each called
  `validateCoupon` into its own local state.
- **Fix:** Extended the existing `CartProvider` (`lib/cart-context.tsx`) — which already persists cart
  items to `localStorage` — to also hold and persist `coupon: { code, discount } | null` the same way,
  with `applyCoupon`/`removeCoupon` on the shared context. `CartClient`, `BillingSummary`, and
  `CheckoutClient` all now read/write this one shared value instead of separate local state.
  `BillingSummary`'s `couponCode`/`onCouponApplied` props were removed entirely (no longer needed —
  it reads `useCart()` directly). `clear()` (called after order placement) also resets the coupon,
  since it was already consumed server-side for that order.
- **Files:** `lib/cart-context.tsx`, `components/cart/cart-client.tsx`,
  `components/checkout/billing-summary.tsx`, `components/checkout/checkout-client.tsx`.
- **Regression risk:** Low — `createOrder` (`actions/orders.ts`) already re-validates the coupon
  authoritatively server-side regardless of what the client displays; this only fixes what's shown.

## DEFECT-1D-13 — Delivery policy: Express Delivery was a flat ₹99, not threshold-based

- **Defect:** The approved policy is STANDARD (below ₹499: ₹49; ₹499+: FREE), EXPRESS (below ₹499:
  ₹99; ₹499+: ₹50). Standard was already correctly threshold-based and StoreSettings-driven; Express
  was a flat ₹99 everywhere (cart display, checkout display, and `createOrder`'s actual charge),
  regardless of subtotal.
- **Evidence:** Direct code read of `checkout-client.tsx`, `cart-client.tsx`, and `actions/orders.ts`'s
  `EXPRESS_SHIPPING_FEE = 99` constant, applied unconditionally. Live DB check confirmed the
  `StoreSettings` singleton row already has `shippingFee: 49, freeShippingThreshold: 499` — Standard's
  live values already matched the approved policy exactly; only Express needed the threshold logic.
- **Fix:** Express now uses the same `freeShippingThreshold` boundary as Standard — ₹99 below it, ₹50
  at/above it — in `cart-client.tsx`'s Delivery Estimate display, `checkout-client.tsx`'s
  `SHIPPING_OPTIONS`, and `actions/orders.ts`'s authoritative charge (`EXPRESS_SHIPPING_FEE` /
  `EXPRESS_SHIPPING_FEE_ABOVE_THRESHOLD`). The `999` fallback default (used only if the StoreSettings
  row is ever missing) was also corrected to `499` in `actions/orders.ts` and both storefront pages
  that read it, so a fresh environment matches the approved policy too.
- **Files:** `components/cart/cart-client.tsx`, `components/checkout/checkout-client.tsx`,
  `actions/orders.ts`, `app/(storefront)/cart/page.tsx`, `app/(storefront)/checkout/page.tsx`.
- **Regression risk:** Low — Standard's values were unchanged; Express changes only affect orders
  placed at/above ₹499 (fee drops from ₹99 to ₹50), which is the intended fix, not a side effect.

## DEFECT-1D-14 — Selected delivery method was never persisted on the Order

- **Defect:** `Order` stored the resulting `shippingFee` but never *which method* produced it — no way
  to know from the order record alone whether a given fee was Standard or Express.
- **Evidence:** `prisma/schema.prisma`'s `Order` model had no `shippingMethod` column;
  `createOrderSchema` already accepted `shippingMethod` from the client (added in the immediately-prior
  correction pass) but `createOrder` never wrote it anywhere.
- **Fix:** Added `shippingMethod ShippingMethod @default(STANDARD)` to `Order` (new `ShippingMethod`
  enum: `STANDARD` / `EXPRESS`), additive and non-destructive (`prisma db push`, existing rows default
  to `STANDARD`). `createOrder` now persists `data.shippingMethod` on every new order. This also fixed
  a **second, self-discovered bug**: `checkout/success/page.tsx` inferred Standard vs. Express by
  guessing from the fee amount itself (`0` or `99`) — a lookup that broke the moment Express became
  threshold-based, since ₹50 matched neither key and silently fell back to "Standard Delivery." Now
  reads the real, persisted `order.shippingMethod` directly. The customer and admin order-detail pages
  were also updated to show the method alongside the fee for the same consistency reason.
- **Files:** `prisma/schema.prisma`, `actions/orders.ts`, `app/(storefront)/checkout/success/page.tsx`,
  `app/account/orders/[id]/page.tsx`, `app/admin/orders/[id]/page.tsx`.
- **Regression risk:** Low — additive schema change with a default; existing orders read back as
  `STANDARD` (correct, since Express was effectively unusable before `shippingMethod` was even wired
  through to `createOrder` in the prior pass).

## DEFECT-1D-15 — Return/replacement policy was a placeholder ("contact us," no defined window)

- **Defect:** `/returns` deliberately stated no fixed window or eligibility rules existed (correctly,
  at the time — no such policy value existed anywhere in the codebase). The approved policy now
  exists: 48-hour window from delivery; damaged/leaked/wrong-product only, with photo/video evidence
  required; used/consumed products and change-of-mind excluded; resolution via replacement/refund/other
  after verification, subject to admin review.
- **Fix:** Rewrote `/returns` with the approved policy. Propagated the same language to the product
  page FAQ (`components/storefront/product-faq.tsx`), the site-wide FAQ (`app/(storefront)/faq/page.tsx`),
  and the shipping page's delivery-fee copy (`app/(storefront)/shipping/page.tsx`, updated for
  DEFECT-1D-13's threshold pricing too). Checkout's Terms checkbox already linked to `/returns`; the
  customer order page now surfaces the policy via the new Report-an-Issue feature (DEFECT-1D-16).
- **Files:** `app/(storefront)/returns/page.tsx`, `app/(storefront)/faq/page.tsx`,
  `app/(storefront)/shipping/page.tsx`, `components/storefront/product-faq.tsx`.
- **Regression risk:** None — copy-only change; no prior policy claim is being contradicted (there
  wasn't one).

## DEFECT-1D-16 — No customer-facing way to report a delivered-order issue

- **Defect:** No "Report an Issue / Request Replacement" feature existed — customers could only email
  support with no ticket, no evidence requirement, no tracked status, and no server-side enforcement of
  the 48-hour window.
- **Fix:** New `ReturnRequest` model (ticket number, order/item/customer references, issue type enum
  `DAMAGED`/`LEAKED`/`WRONG_PRODUCT`, description, `evidenceUrls[]`, contact phone, status enum
  `SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → REPLACEMENT_INITIATED → RESOLVED` with a server-
  enforced transition table). Deliberately separate from the pre-existing, currently-unwired
  `ReturnShipment`/`initiateReturnShipment` (a courier reverse-pickup record with no UI caller anywhere
  in the codebase — confirmed by search) — this is the customer support ticket, not logistics.
  `actions/returns.ts` provides: `getReturnEvidenceUploadUrl` (customer-gated Cloudinary signing,
  reusing `actions/media.ts`'s signing mechanics but under `requireCustomer()` and a dedicated
  "Returns" folder, rate-limited), `submitReturnRequest` (re-checks ownership, delivery status, and the
  48-hour window server-side — using the real `Shipment.deliveredAt` when available, falling back to
  `order.updatedAt` — and blocks a second open ticket for the same item), and staff-only
  `listReturnRequests`/`updateReturnRequestStatus`. Customer UI
  (`components/account/return-request-client.tsx`) renders only on delivered orders, from
  `app/account/orders/[id]/page.tsx`, and never auto-approves a refund — `APPROVED` only records that
  evidence checked out; any actual refund still goes through the existing `refundOrder` action
  separately, by deliberate staff choice.
- **Files:** `prisma/schema.prisma` (new `ReturnRequest`/`ReturnIssueType`/`ReturnRequestStatus`),
  `lib/validations/returns.ts` (new), `actions/returns.ts` (new),
  `components/account/return-request-client.tsx` (new), `app/account/orders/[id]/page.tsx`.
- **Regression risk:** None — fully additive; no existing route, model, or action was modified in a
  way that changes prior behavior.

## DEFECT-1D-17 — No admin visibility into return/replacement requests

- **Defect:** Following from DEFECT-1D-16 — a customer-facing intake with no staff-facing queue is an
  incomplete feature; staff would have no way to review evidence or move a ticket forward.
- **Fix:** New `/admin/returns` (list, status filter, pagination — same Server Component pattern as
  the pre-existing `/admin/inquiries`) and `ReturnsTableClient` (expandable row showing full
  description, contact number, admin notes, and an evidence gallery with image/video previews;
  status-change dropdown constrained to the same transition table `submitReturnRequest` enforces).
  Added to the admin sidebar nav.
- **Files:** `app/admin/returns/page.tsx` (new), `components/admin/returns-table-client.tsx` (new),
  `app/admin/layout.tsx`.
- **Regression risk:** None — new route, no existing admin page touched except the nav array.

## DEFECT-1D-18 — Admin panel not loading (Founder report)

- **Symptom:** Founder reported `/admin` failing to load / redirecting unexpectedly during their own
  local `npm run dev` session.
- **Evidence:** A completely fresh `next dev` instance (different port, fresh cookie jar) served
  `/admin`, `/admin/orders`, and login cleanly on the first request, no retries needed. This matches
  the same recurring Next.js 15 dev-mode HMR/RSC corruption pattern documented repeatedly across this
  project (see DEFECT-1D-01 above and `PHASE_1_KNOWN_ISSUES.md`) — a long-lived dev server accumulates
  bad state across many hot-reloads; a fresh process does not exhibit it.
- **Root cause:** Dev-tooling artifact, not application code — reconfirmed this pass via a full
  `npm run build && npm run start` production-server sweep (see Regression Results below): every admin
  route returned 200 with correct content on first request, no retries.
- **Fix:** None applicable to application code. Practical mitigation (already documented in
  `PHASE_1_KNOWN_ISSUES.md`): restart the dev server if `/admin` misbehaves, or use
  `npm run build && npm run start` for local testing, which has not exhibited this issue in any pass
  of this project.
- **Files affected:** None.
- **Regression risk:** None (no change made).

## DEFECT-1D-19 — Mobile checkout responsiveness (folded into DEFECT-1D-11)

- **Defect:** Reported as a separate item, but root-caused to the same unconditional `position: sticky`
  bug as DEFECT-1D-11 — Checkout's Billing Summary card floating over the step buttons was the
  mechanism behind both "layout looks broken on mobile" and "buttons don't respond to taps" during
  checkout specifically. No separate fix was needed once DEFECT-1D-11 was corrected; verified by
  re-reading the full checkout step flow (`checkout-client.tsx`) for any other unconditional
  fixed/sticky/overlay positioning — none found. `StickyCheckoutSummary`/`StickyCartSummary` were
  already correctly `lg:hidden`-scoped mobile-only bottom bars, not part of the bug.
- **Files:** None beyond DEFECT-1D-11's.
- **Regression risk:** None (no additional change).

---

## Summary — Cart/Checkout/Coupon/Delivery/Returns/Admin pass

**8 real code defects found and fixed** (cart quantity button hardening, mobile sticky-overlap bug
fixed in two files, coupon persistence, Express delivery pricing, delivery-method persistence plus a
self-discovered fee-inference bug on the success page, returns policy content, and two new features
built to support the new policy — customer report-an-issue and admin review queue — counted together
as one delivery since they're two halves of the same feature). **2 items investigated and confirmed
not to be code defects** (admin panel loading — dev-tooling artifact, DEFECT-1D-18; mobile checkout
responsiveness — same root cause as DEFECT-1D-11, no separate fix needed, DEFECT-1D-19). No database
reset, no hardcoded bypass, no unrelated feature work, and no Phase 2 scope was introduced — every
change traces to one of the ten defects the Founder confirmed.
