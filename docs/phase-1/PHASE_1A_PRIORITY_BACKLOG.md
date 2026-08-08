# Phase 1A — Priority Backlog

24 issues found this pass, grouped by priority. Every issue includes DB impact, regression risk, and
whether it blocks later Institutional Sales or MUV AI integration, in addition to the fields the
Phase 1A brief requires. No issue in this backlog was fixed — this is analysis only.

---

## P0 — Critical

### GAP-001 — `AUTH_SECRET` is still the literal placeholder value
- **Description:** `.env`'s `AUTH_SECRET` is the string `"replace-with-a-long-random-string"`, not a real secret. NextAuth uses this to sign session JWTs.
- **Evidence:** `.env` line 5, re-confirmed via `Grep` during Phase 0 validation.
- **Knowledge Book reference:** Part XII, Chapter 60, "Digital Experience Governance" §5 "privacy and security review"; general Founder-direction expectation of a secure, trustworthy platform (Ch.60 §3.3 "secure and privacy-aware").
- **Recommended solution:** Generate a real secret (`npx auth secret`) before any non-local deployment; document as a hard pre-launch gate.
- **Dependencies:** None — a config change, no code change.
- **Acceptance criteria:** `AUTH_SECRET` in the deployed environment is a real, unique, non-placeholder value; sessions signed with the placeholder are invalidated on rotation.
- **DB impact:** None.
- **Regression risk:** None (rotating it invalidates existing sessions, forcing re-login — expected, not a regression).
- **Blocks Institutional Sales:** No, but any future B2B portal/CRM login would inherit the same risk.
- **Blocks MUV AI:** No.

### GAP-008 — Seeded admin credential is a real risk if reused
- **Description:** `npm run db:seed` creates `admin@muv.co.in` / `ChangeMe123`. `CLAUDE.md` already documents this must change immediately outside local dev — re-flagged here as a formal backlog item, not just prose.
- **Evidence:** `CLAUDE.md` "Commands" section; `prisma/seed.ts`.
- **Knowledge Book reference:** Part XII, Chapter 60, "Decision Points": *"What operational process supports the promise?"* — a default credential with no forced-rotation process is exactly the kind of unconfirmed operational gap Ch.60 asks to be resolved before calling a capability production-ready.
- **Recommended solution:** Either force a password change on first login for the seeded account, or make seeding refuse to run against a non-development `DATABASE_URL`.
- **Dependencies:** None.
- **Acceptance criteria:** The seeded admin account cannot reach a production database without an explicit, deliberate override; documented in the deploy runbook.
- **DB impact:** None (process change, not schema).
- **Regression risk:** Low — only affects the seed script's guard conditions.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

---

## P1 — High

### GAP-002 — Brand name rendered "MUV" (all-caps) in customer-facing running text instead of "Muv"
- **Description:** The Knowledge Book's Written Identity rule requires customer-facing text to use "Muv" (capital M, lowercase uv), reserving all-caps "MUV" for formal Knowledge Library/registered-system titles. The live site uses all-caps "MUV" in the page `<title>`, the default SEO meta description, the footer copyright line, "Explore MUV" nav text, and prose on the About and Brand Story sections.
- **Evidence:** `app/layout.tsx:34` (`"MUV — Keep Muving"`), `lib/seo.ts:18` (`DEFAULT_DESCRIPTION`), `components/storefront/footer.tsx:59,66,99`, `components/storefront/nav.tsx:258`, `components/storefront/brand-story.tsx`, `app/(storefront)/about/page.tsx`.
- **Knowledge Book reference:** Part III, Chapter 13 — Language, Pronunciation & Tagline, "Written Identity": *"Use Muv in customer-facing text where the approved brand form requires a capital M and lowercase uv."*
- **Recommended solution:** Update running/prose text (title tags, meta descriptions, footer copy, nav link text, About/brand copy) to "Muv"; leave the `/logo.png` image itself untouched (a visual-asset/logo question, separate governance chapter, not assessed this pass).
- **Dependencies:** None — pure copy change, several small files.
- **Acceptance criteria:** No customer-facing running text renders all-caps "MUV" except where the Knowledge Book's own exception applies (formal Knowledge Library/system titles); logo image unchanged.
- **DB impact:** None (all instances found are in code/components, not `StoreSettings` or seeded content — though `prisma/seed.ts`'s CMS seed content should be checked in the same pass since it's the source of some homepage text).
- **Regression risk:** Very low — text-only change, no logic touched.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

### GAP-003 — Footer uses "moving" instead of "Muving"
- **Description:** Footer copy reads *"Care that keeps moving"* — standard English spelling, not the brand-mandated "Muving."
- **Evidence:** `components/storefront/footer.tsx:72`.
- **Knowledge Book reference:** Part III, Chapter 13, §9 "Keep Muving™ Philosophy," "Incorrect Use": *"Changing the spelling to match generic grammar."* / "Correct Use": *"Preserve the spelling **Muving**."*
- **Recommended solution:** Change the line to use "Muving" (e.g., "Care that keeps Muving") or remove the near-duplicate tagline echo entirely, since the footer already carries "Keep Muving." immediately above it.
- **Dependencies:** None.
- **Acceptance criteria:** No customer-facing instance of "moving" appears where "Muving" is intended; verified by a full-site text search for the word.
- **DB impact:** None.
- **Regression risk:** Very low.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

### GAP-004 — Checkout shipping/COD pricing is hardcoded, ignoring admin-configurable `StoreSettings`
- **Description:** `StoreSettings` has real, admin-editable `shippingFee` (default 49), `freeShippingThreshold` (default 999), `codEnabled`, and `codFee` fields, exposed in `/admin/settings`. `createOrder` never reads them — it computes `subtotal - discount >= 999 ? 0 : 49` inline, and (per the schema's own comment) does not consult `codEnabled`/`codFee` either. An admin changing these settings has **no effect** on real checkout pricing.
- **Evidence:** `actions/orders.ts:145-146`; `prisma/schema.prisma` lines 547–556 (the schema's own comment already documents this exact gap, dated to Phase 13B).
- **Knowledge Book reference:** Part XII, Chapter 60, §3.7 "Commerce, Orders, and Fulfilment": *"The digital commerce flow should maintain consistency among: product selection; displayed price; availability..."*; Part II, Chapter 8, "Integration Rule": *"Which source is authoritative?"*
- **Recommended solution:** Read `shippingFee`/`freeShippingThreshold`/`codEnabled`/`codFee` from `StoreSettings` inside `createOrder` (and the cart page's shipping estimate), replacing the inline constants.
- **Dependencies:** None new — the settings already exist and are already admin-editable; this is purely wiring.
- **Acceptance criteria:** Changing `StoreSettings.shippingFee` in `/admin/settings` changes the real fee shown in cart and charged at checkout; disabling `codEnabled` removes COD as a real payment option, not just a display toggle.
- **DB impact:** None (no schema change — the fields already exist).
- **Regression risk:** Medium — touches live pricing logic in `createOrder`; must be tested against the existing `ALLOWED_TRANSITIONS`/payment-method validation paths before shipping.
- **Blocks Institutional Sales:** Yes, indirectly — any future institutional/bulk pricing tier will need this same settings-driven pricing pattern to already be real, not hardcoded.
- **Blocks MUV AI:** No.

### GAP-005 — "Coming Soon" vs. "Muving Soon™" inconsistency on the Skin Care category page
- **Description:** The homepage's Skin Care category card correctly shows "Muving Soon™". The actual Skin Care category landing page (`/collections/skin-care`) — what a customer reaches by clicking that same card — shows plain "Coming Soon" instead.
- **Evidence:** `app/(storefront)/page.tsx:312` (correct) vs. `app/(storefront)/collections/[category]/page.tsx:43` (incorrect).
- **Knowledge Book reference:** Part III, Chapter 13, §9 "Correct Use" (preserve "Muving" spelling); Part II, Chapter 7, "Common Mistakes" (consistency across the journey).
- **Recommended solution:** Change the literal string in `collections/[category]/page.tsx` to "Muving Soon™", matching the homepage.
- **Dependencies:** None.
- **Acceptance criteria:** Both surfaces show identical wording for the same category state.
- **DB impact:** None.
- **Regression risk:** Very low.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

### GAP-006 — No admin UI to view or manage `BusinessInquiry` submissions
- **Description:** `/contact`'s business-inquiry form, `submitBusinessInquiry`, the `BusinessInquiry` model, and its `InquiryStatus` (`NEW`/`CONTACTED`/`CLOSED`) enum are all real and wired — an admin email alert fires on submission. There is no `/admin/inquiries` page or equivalent to list, view, or update the status of a submission. If the alert email is missed, the lead has no durable, browsable staff-side record.
- **Evidence:** `actions/inquiries.ts`, `prisma/schema.prisma` (`BusinessInquiry`, `InquiryStatus`); confirmed via `Glob`/`Grep` — no admin route or component references `BusinessInquiry`.
- **Knowledge Book reference:** Part II, Chapter 7, "Business Engagement": *"Institutional, wholesale, distributor, and franchise interests require distinct enquiry paths."* — the path exists on the way in, but not on the way out to staff action.
- **Recommended solution:** Add an `/admin/inquiries` list/detail page reusing the existing `InquiryStatus` workflow, following the same pattern as `/admin/customers`.
- **Dependencies:** None new — all backend pieces already exist.
- **Acceptance criteria:** Staff can list, filter by status, and transition a `BusinessInquiry` through `NEW` → `CONTACTED` → `CLOSED` from `/admin`.
- **DB impact:** None (no schema change needed).
- **Regression risk:** Low — purely additive new admin page.
- **Blocks Institutional Sales:** **Yes, directly** — this is a named, explicit prerequisite before any real Institutional Sales workflow can operate; leads currently have no operational home.
- **Blocks MUV AI:** No.

### GAP-007 — Shipping webhook signature scheme is an unconfirmed generic default
- **Description:** `app/api/webhooks/shipping/[provider]/route.ts` verifies a generic HMAC-SHA256 signature for all four couriers (Shiprocket/Delhivery/BlueDart/DTDC), but `SECURITY.md` itself states the actual signature scheme varies by provider and this is "a reasonable default rather than a confirmed match for all four."
- **Evidence:** `SECURITY.md` "Webhook verification" section (project's own documentation, unchanged since Phase 0 read).
- **Knowledge Book reference:** Part II, Chapter 8, "Validation Gate": *"Data updates are confirmed"*; Part XII, Chapter 60, "WARNING": do not publish a customer promise (accurate shipment tracking) that operations cannot fulfil.
- **Recommended solution:** Verify each configured provider's actual current webhook-signing documentation before going live with that specific `SHIPPING_PROVIDER`; add provider-specific verification if schemes differ.
- **Dependencies:** Requires live courier account/documentation access — cannot be fully resolved from code alone.
- **Acceptance criteria:** The active `SHIPPING_PROVIDER`'s webhook signature verification is confirmed against that provider's current, real documentation, not a generic assumption.
- **DB impact:** None.
- **Regression risk:** Low if scoped to the single actually-configured provider.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

---

## P2 — Medium

### GAP-009 — Footer social links are hardcoded to generic platform homepages
- **Description:** `SOCIAL_LINKS` in `footer.tsx` hardcodes `https://instagram.com`, `https://facebook.com`, `https://x.com`, `https://youtube.com` — the platforms' own homepages, not MUV's actual profiles. `StoreSettings.instagramUrl`/`facebookUrl`/`twitterUrl`/`whatsappNumber` exist and are admin-editable but are never read here.
- **Evidence:** `components/storefront/footer.tsx:35-40`.
- **Knowledge Book reference:** Part II, Chapter 7, "Content Control": product/contact/availability information "must come from controlled sources."
- **Recommended solution:** Fetch `StoreSettings` in `Footer()` (already does, for `newsletterContent`) and use its social URL fields; hide an icon whose URL isn't configured rather than link to a generic homepage.
- **Dependencies:** None — fields already exist.
- **Acceptance criteria:** Every footer social icon either links to MUV's real profile (as configured in `/admin/settings`) or does not render.
- **DB impact:** None.
- **Regression risk:** Very low.
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** No.

### GAP-010 — No automated test suite configured
- **Description:** `package.json` has no `test` script and no test framework dependency anywhere.
- **Evidence:** `package.json` (re-confirmed via `Grep` during Phase 0 validation).
- **Knowledge Book reference:** Part XII, Chapter 60, "Digital Experience Governance" §3 "functional validation."
- **Recommended solution:** Introduce a test framework (Vitest/Jest/Playwright) starting with the highest-risk flows (checkout, RBAC, webhook verification) — out of scope to implement in this analysis-only phase.
- **Dependencies:** New devDependency decision — a scope call for Phase 1B, not silent.
- **Acceptance criteria:** N/A this phase (tracked for planning only).
- **DB impact:** None.
- **Regression risk:** N/A (adding tests is additive).
- **Blocks Institutional Sales:** No.
- **Blocks MUV AI:** Indirectly — any AI-assisted change would benefit from regression coverage before being trusted.

### GAP-011 — No ESLint configuration
- **Description:** `lint` script exists in `package.json` but no `.eslintrc*`/`eslint.config.*` or `eslint`/`eslint-config-next` dependency exists at the project root.
- **Evidence:** `Glob` for `.eslintrc*`/`eslint.config.*` (Phase 0, re-confirmed).
- **Knowledge Book reference:** Part XII, Chapter 60, "Digital Experience Governance" §3.
- **Recommended solution:** A deliberate decision to install and configure ESLint, left to the Founder per prior phase reports.
- **Dependencies:** New devDependency decision.
- **Acceptance criteria:** N/A this phase.
- **DB impact:** None. **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-012 — In-process-memory rate limiting won't survive horizontal scaling
- **Description:** `lib/rate-limit.ts` stores counters in process memory — correct for one server instance, silently ineffective across multiple.
- **Evidence:** `SECURITY.md`, `lib/rate-limit.ts` (read during Phase 0, unchanged).
- **Knowledge Book reference:** Part XII, Chapter 60, §3.3 "secure and privacy-aware."
- **Recommended solution:** Swap in Upstash Redis (or equivalent) before deploying more than one instance, keeping the same `checkRateLimit(key, limit, windowMs)` signature.
- **Dependencies:** New provider account/credentials.
- **Acceptance criteria:** N/A this phase.
- **DB impact:** None. **Regression risk:** Low if the function signature is preserved.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-013 — No Content-Security-Policy header
- **Description:** Deliberately deferred in Phase 16 due to real risk of breaking live Razorpay/Cloudinary integrations without a way to test that live in this environment. Other security headers are present.
- **Evidence:** `PHASE_16_PRODUCTION_READINESS_REPORT.md`.
- **Knowledge Book reference:** Part XII, Chapter 60, §3.3.
- **Recommended solution:** Add a CSP with an explicit test pass against live Razorpay checkout + Cloudinary upload before shipping.
- **Dependencies:** A real test environment for payment/media flows.
- **Acceptance criteria:** N/A this phase. **DB impact:** None. **Regression risk:** Medium (payment/media-breaking if done carelessly — exactly why it was deferred).
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-014 — WhatsApp notification templates are provider-unapproved placeholders
- **Description:** `payment_confirmed`, `order_delivered`, `order_shipped` template names are real code paths, correctly gated by `StoreSettings` toggles, but not yet created/approved in whichever messaging provider's dashboard is configured.
- **Evidence:** `PHASE_18_CUSTOMER_EXPERIENCE_REPORT.md` §12.
- **Knowledge Book reference:** Part II, Chapter 8, "Automation": labelled planned/deferred until provider confirmation.
- **Recommended solution:** Get the three template names approved in the live provider's dashboard before relying on sends succeeding.
- **Dependencies:** External provider action, not code.
- **Acceptance criteria:** N/A this phase. **DB impact:** None. **Regression risk:** None.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-015 — No unified marketing-campaign system
- **Description:** Banners and coupons are both real and independently CMS-managed; no shared campaign/scheduling concept ties them together.
- **Evidence:** `PHASE_18_CUSTOMER_EXPERIENCE_REPORT.md` §7 (deliberately deferred, named).
- **Knowledge Book reference:** Part VIII (Sales, Pricing, Distribution & Marketplaces), Ch.5 area (not deep-read this pass — TOC-level citation only).
- **Recommended solution:** Scope as a genuine Phase 1B/2 feature decision, not a bug fix.
- **Dependencies:** Product/schema design work.
- **Acceptance criteria:** N/A this phase. **DB impact:** Likely (new model). **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-016 — No admin-toggleable personalized homepage rail
- **Description:** The Phase 14A recommendation rail ("Continue Shopping"/"Recommended for You"/"Trending Now") is always-on, not a `HomepageSection` an admin can toggle.
- **Evidence:** `PHASE_14A_AI_FOUNDATION_REPORT.md` §13.
- **Knowledge Book reference:** Part XII, Chapter 60, §3.5 "Content Management" (ownership/publication control).
- **Recommended solution:** Extend `HomepageSection` to cover it, if admin control becomes a real requirement.
- **Dependencies:** Schema extension.
- **Acceptance criteria:** N/A this phase. **DB impact:** Yes (new/extended model). **Regression risk:** Low.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** Indirectly — this *is* one of the site's few real "AI-shaped" surfaces; any future MUV AI personalization work would likely extend this exact code path.

### GAP-017 — No cross-device `Cart` table
- **Description:** Deliberate design choice (cart is client-side/localStorage), documented as intentional and deferred until cross-device recovery is a real requirement.
- **Evidence:** `prisma/schema.prisma` comment; `CLAUDE.md`.
- **Knowledge Book reference:** Part XII, Chapter 60, §3.7.
- **Recommended solution:** No action needed unless the Founder makes cross-device cart a real requirement.
- **Dependencies:** N/A. **Acceptance criteria:** N/A. **DB impact:** Would require a new model if ever built. **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-018 — No background job scheduler/cron
- **Description:** Scheduled blog publishing self-corrects only on next `/api/blog` request; no cron for abandoned-payment cleanup.
- **Evidence:** `PROJECT_STATUS.md`, confirmed still true (no scheduler dependency in `package.json`).
- **Knowledge Book reference:** Part II, Chapter 8, "Automation Control Sheet."
- **Recommended solution:** Add a real scheduler (platform cron, or a hosted job runner) if these become operationally material.
- **Dependencies:** Hosting-platform decision.
- **Acceptance criteria:** N/A this phase. **DB impact:** None. **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-019 — Stale code comments claiming no business-inquiry backend exists
- **Description:** `components/storefront/business-section.tsx` and `components/storefront/footer.tsx` both carry comments stating "no dedicated business-inquiry page or backend exists yet" — false today; `actions/inquiries.ts`, the `BusinessInquiry` model, and the `/contact` form all exist (only the admin-side view is missing, GAP-006).
- **Evidence:** Both files' own inline comments.
- **Knowledge Book reference:** N/A (code-hygiene finding, not a Knowledge Book requirement).
- **Recommended solution:** Update or remove the stale comments when GAP-006 is addressed, so future engineering work doesn't get misled into re-building something that already exists.
- **Dependencies:** None. **Acceptance criteria:** Comments accurately reflect current state. **DB impact:** None. **Regression risk:** None (comment-only).
- **Blocks Institutional Sales:** No (but could cause wasted duplicate work if left uncorrected). **Blocks MUV AI:** No.

### GAP-020 — Live-looking Cloudinary credentials in the checked-in `.env`
- **Description:** `.env` has real-looking `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` populated, unlike every other provider (blank). Provenance (dev sandbox vs. live production account) is unconfirmed.
- **Evidence:** `.env` (Phase 0 read; values not reproduced here).
- **Knowledge Book reference:** Part XII, Chapter 60, §3.3 "secure and privacy-aware."
- **Recommended solution:** Founder/owner confirms whether this is an intentional dev account; rotate if it is a live production credential that shouldn't be in a shared package.
- **Dependencies:** Founder confirmation.
- **Acceptance criteria:** N/A this phase. **DB impact:** None. **Regression risk:** None (config-only).
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

---

## P3 — Low

### GAP-021 — Apple Sign-In inactive
- **Description:** Code-complete and correctly hidden until `APPLE_ID`/`APPLE_CLIENT_SECRET` are real. Not a defect — listed for completeness.
- **Evidence:** `lib/auth.ts`; `PHASE_18_CUSTOMER_EXPERIENCE_REPORT.md`.
- **Knowledge Book reference:** N/A. **Recommended solution:** Provision Apple Developer credentials if/when desired. **Dependencies:** External. **Acceptance criteria:** N/A. **DB impact:** None. **Regression risk:** None.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-022 — Admin "Coming Soon" badge wording differs from customer-facing "Muving Soon™"
- **Description:** `components/admin/categories-table-client.tsx` shows "Coming Soon" as an internal status badge/label.
- **Evidence:** `components/admin/categories-table-client.tsx:128,170`.
- **Knowledge Book reference:** Ch.13 §9 (customer-facing rule; admin tooling is internal, lower stakes).
- **Recommended solution:** Optional — align wording for internal consistency, purely cosmetic.
- **Dependencies:** None. **Acceptance criteria:** N/A. **DB impact:** None. **Regression risk:** None.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-023 — Category color differentiation not implemented
- **Description:** Knowledge Book explored lavender/pink/emerald/orange per-category colors, but explicitly states this is "not a complete final colour specification." Site uses one lavender accent globally.
- **Evidence:** Ch.14 §13 "Color Philosophy" (see Knowledge References doc).
- **Knowledge Book reference:** Part III, Chapter 14, §13.
- **Recommended solution:** No action required unless/until the Founder formally locks a per-category palette.
- **Dependencies:** Founder decision. **Acceptance criteria:** N/A. **DB impact:** None. **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** No.

### GAP-024 — No customer-facing "Your Shopping Profile" view
- **Description:** `getCustomerPreferences()` is real and computed but internal-only; no account page surfaces it.
- **Evidence:** `PHASE_14A_AI_FOUNDATION_REPORT.md` §13.
- **Knowledge Book reference:** Part XII, Chapter 60, §3.6 "Customer Accounts."
- **Recommended solution:** A genuine future feature, not a defect.
- **Dependencies:** UI design work. **Acceptance criteria:** N/A. **DB impact:** None. **Regression risk:** N/A.
- **Blocks Institutional Sales:** No. **Blocks MUV AI:** Indirectly — a natural extension point for a future MUV AI–driven experience.

---

## Backlog Summary

| Priority | Count | Blocks Institutional Sales | Blocks MUV AI |
|---|---|---|---|
| P0 | 2 | 0 | 0 |
| P1 | 6 | 2 (GAP-004, GAP-006) | 0 |
| P2 | 12 | 0 | 2 (GAP-010, GAP-016, indirect) |
| P3 | 4 | 0 | 1 (GAP-024, indirect) |
| **Total** | **24** | **2 direct** | **0 direct / 3 indirect** |
