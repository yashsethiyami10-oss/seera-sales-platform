# Phase 1B — Master Implementation Blueprint

### Status: Planning complete · No website code, database, or business logic modified · Built directly from the Phase 0 Audit, Phase 1A Gap Analysis, and MUV Knowledge Book

> This is a plan, not an implementation. Every module below cites the `GAP-0xx` ID from
> `docs/phase-1/PHASE_1A_PRIORITY_BACKLOG.md` it resolves (full evidence/Knowledge Book citations
> live there — not repeated in full here to keep this document scannable). Modules with no open gap
> still get a full entry, stating explicitly that the required action is verification/no-change.
>
> Companion documents: `PHASE_1B_FILE_MODIFICATION_MATRIX.md` (every file, cross-referenced by
> module), `PHASE_1B_DEPENDENCY_GRAPH.md` (sequencing + why), `PHASE_1B_ACCEPTANCE_CRITERIA.md`
> (consolidated, QA-ready criteria per gap).

**Two items are handled outside the 25-module list, as Stage 0 (Pre-flight)**, because they are
config/credential changes with no code-file target and no page-module home: `AUTH_SECRET` rotation
(GAP-001) and the seeded-admin-credential guard (GAP-008). Both are P0 and block real deployment,
independent of every module below.

**Seven items are handled as a Cross-Cutting / Infrastructure bucket** (end of this document)
because they don't belong to a single page module: no test suite (GAP-010), no ESLint (GAP-011),
in-memory rate limiting (GAP-012), no CSP header (GAP-013), no `Cart` table (GAP-017, deliberately
deferred), no job scheduler (GAP-018), no customer shopping-profile view (GAP-024).

---

## Stage 0 — Pre-flight (before any module work)

**GAP-001 / GAP-008 — Credential hygiene**
1. **Current implementation:** `.env`'s `AUTH_SECRET` is the literal placeholder string; `db:seed` creates `admin@muv.co.in`/`ChangeMe123` with no guard against a production target.
2. **Required implementation:** A real, unique `AUTH_SECRET` per environment; seeding either forces a password change or refuses to run against a non-development `DATABASE_URL`.
3. **Gap summary:** Config/process gap, not application logic.
4. **Files to modify:** `.env` (not source-controlled — deployment-environment config only), `prisma/seed.ts` (guard condition).
5. **Dependencies:** None — can happen before any other stage.
6. **Risk level:** Low (config change).
7. **Regression risk:** None to app logic; rotating `AUTH_SECRET` invalidates existing sessions (expected).
8. **Acceptance criteria:** See `PHASE_1B_ACCEPTANCE_CRITERIA.md` AC-001/AC-008.
9. **Estimated implementation order:** Stage 0 (first, blocks nothing else, blocked by nothing).
10. **Required testing:** Confirm login still works after `AUTH_SECRET` rotation (new sessions only); confirm seed script refuses/warns against a non-dev `DATABASE_URL`.
- **Definition of Done:** Real secret in every non-local `.env`; seed script has an explicit environment guard.
- **Rollback considerations:** Reverting `AUTH_SECRET` is safe but re-invalidates sessions again — avoid rotating twice in short succession in production.
- **Testing checklist:** [ ] New sessions issue and validate correctly · [ ] Old sessions signed with the placeholder are rejected, not silently accepted · [ ] Seed script exits with a clear error against a non-dev `DATABASE_URL`.

---

## 1. Homepage

1. **Current implementation:** Real CMS-driven (banners, categories, featured, brand story, personalized rail, social proof). Correctly shows "Muving Soon™" on the Skin Care category card.
2. **Required implementation:** Same, with two prose strings corrected to the approved "Muv" casing.
3. **Gap summary:** GAP-002 — two customer-facing strings render all-caps "MUV" instead of "Muv": `components/storefront/brand-story.tsx` ("MUV exists because...") and `components/storefront/social-proof.tsx` ("...people live with MUV every day").
4. **Files to modify:** `components/storefront/brand-story.tsx`, `components/storefront/social-proof.tsx`.
5. **Dependencies:** None.
6. **Risk level:** Low.
7. **Regression risk:** Very low — static text only, no logic/props touched.
8. **Acceptance criteria:** See AC-002 (Homepage instances).
9. **Estimated implementation order:** Stage 1.
10. **Required testing:** Visual diff of the two sections; confirm no layout shift from the text change.
- **Definition of Done:** Both strings read "Muv," not "MUV"; homepage's existing "Muving Soon™" badge left untouched (already correct).
- **Rollback considerations:** Trivial single-file text revert.
- **Testing checklist:** [ ] Brand Story section renders correctly · [ ] Social Proof section renders correctly · [ ] No other homepage section regressed (visual spot-check).

## 2. Header

1. **Current implementation:** Logo image (`/logo.png`, `alt="MUV"`) + CMS-managed `AnnouncementBar`.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None. The logo's `alt` attribute is a visual-asset/logo question (Knowledge Book Ch.12, not Ch.13's written-identity rule) and was deliberately not touched — see Phase 1A's scoping note.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 2 (verification pass, no change).
10. **Required testing:** Confirm `AnnouncementBar` CMS toggle still governs visibility correctly (regression check only, since Header is untouched by this phase).
- **Definition of Done:** Confirmed no action needed; recorded here so a future phase doesn't re-audit it from scratch.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Logo renders · [ ] Announcement bar shows/hides per CMS toggle (unchanged behavior, spot-checked only).

## 3. Navigation

1. **Current implementation:** Real category links, "Explore MUV" link text, "Keep Muving" tagline in nav.
2. **Required implementation:** "Explore MUV" corrected to the approved casing.
3. **Gap summary:** GAP-002 — `components/storefront/nav.tsx:258`.
4. **Files to modify:** `components/storefront/nav.tsx`.
5. **Dependencies:** None.
6. **Risk level:** Low.
7. **Regression risk:** Very low — single text node.
8. **Acceptance criteria:** See AC-002 (Navigation instance).
9. **Estimated implementation order:** Stage 3.
10. **Required testing:** Desktop + mobile nav render check (text change only, but nav is a shared/high-traffic component — verify on both breakpoints).
- **Definition of Done:** "Explore MUV" reads "Explore Muv"; all links/behavior otherwise unchanged.
- **Rollback considerations:** Trivial single-line revert.
- **Testing checklist:** [ ] Desktop nav renders correctly · [ ] Mobile nav renders correctly · [ ] All nav links still resolve to the correct routes (regression check, unrelated to this text change).

## 4. Footer

1. **Current implementation:** Real link columns (Shop/Company/Support/Business), CMS-driven newsletter heading, hardcoded social icon URLs, "Keep Muving." tagline followed by "Care that keeps moving," all-caps "MUV"/"KEEP MUVING" copyright line, a stale comment about the business-inquiry backend.
2. **Required implementation:** Social icons read `StoreSettings.instagramUrl`/`facebookUrl`/`twitterUrl`/`whatsappNumber` (hiding an icon if unconfigured); "moving" → "Muving"; "MUV" → "Muv" in prose; stale comment corrected or removed.
3. **Gap summary:** GAP-002, GAP-003, GAP-009, GAP-019.
4. **Files to modify:** `components/storefront/footer.tsx` (all four gaps land in this one file).
5. **Dependencies:** `StoreSettings.instagramUrl`/`facebookUrl`/`twitterUrl`/`whatsappNumber` already exist and are admin-editable — no schema/admin work needed first.
6. **Risk level:** Low-Medium (the social-links change is a real logic change — conditional rendering — not pure text).
7. **Regression risk:** Low — footer is presentational and appears on every page, so a mistake here is highly visible (which is also why it should be tested on more than one page template before shipping).
8. **Acceptance criteria:** See AC-002, AC-003, AC-009, AC-019.
9. **Estimated implementation order:** Stage 4.
10. **Required testing:** Render footer with all four `StoreSettings` social fields populated, with none populated, and with a partial mix — confirm icons show/hide correctly in each case; confirm on at least the homepage and one other page template (footer is a shared component).
- **Definition of Done:** No hardcoded generic social URL remains; no "MUV"/"moving" casing violation remains in footer prose; comment accurately reflects that the business-inquiry backend and form already exist.
- **Rollback considerations:** The social-links change touches a `prisma` read inside `Footer()` (already does this for `newsletterContent` — extending the same query, not adding a new one) — low risk, but revert by restoring the static `SOCIAL_LINKS` array if the settings-read approach causes any issue.
- **Testing checklist:** [ ] All 4 social icons hide correctly with no URL configured · [ ] All 4 show and link correctly with a URL configured · [ ] Newsletter section unaffected (shares the same component) · [ ] Text renders "Muv"/"Muving" correctly · [ ] Footer renders correctly on homepage, shop, and one admin-adjacent customer page.

## 5. Shop

1. **Current implementation:** Real filters (size/category/price/fragrance/in-stock/rating/discount), 6 sort orders, fuzzy search.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A — but Shop should be regression-tested after Stage 4 (Footer) and Stage 1 (Homepage), since it shares layout/footer components.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 6 (verification pass alongside Product Detail/Search/Wishlist).
10. **Required testing:** Filter/sort/search smoke test after any shared-component change lands (Footer, Nav).
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Filters still function · [ ] Sort still functions · [ ] Search still functions (regression checks only).

## 6. Category Pages

1. **Current implementation:** 5 live categories render correctly. The Skin Care landing page (`comingSoon: true`) shows plain "Coming Soon."
2. **Required implementation:** Skin Care landing page shows "Muving Soon™," matching the homepage's own category-card badge for the same category.
3. **Gap summary:** GAP-005.
4. **Files to modify:** `app/(storefront)/collections/[category]/page.tsx:43`.
5. **Dependencies:** None — the correct wording already exists elsewhere in the codebase (`app/(storefront)/page.tsx:312`) to copy exactly.
6. **Risk level:** Low.
7. **Regression risk:** Very low — single string in a conditional branch already gated by `category.comingSoon`.
8. **Acceptance criteria:** See AC-005.
9. **Estimated implementation order:** Stage 5.
10. **Required testing:** Visit `/collections/skin-care` directly; visit each of the 5 live category pages to confirm no regression from the same file's other branches.
- **Definition of Done:** Skin Care page and homepage card show identical wording.
- **Rollback considerations:** Trivial single-line revert.
- **Testing checklist:** [ ] `/collections/skin-care` shows "Muving Soon™" · [ ] All 5 live category pages unaffected · [ ] Wording matches the homepage card exactly (including trademark symbol).

## 7. Product Detail

1. **Current implementation:** Real data, reviews with verified-purchase + filters, related/co-purchased products, JSON-LD.
2. **Required implementation:** Unchanged — no gap found (the one "MUV" match in `product-specs.tsx` is inside a code comment, not rendered text — confirmed by direct read, excluded from scope).
3. **Gap summary:** None.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 6.
10. **Required testing:** Smoke-test one product page after Stage 4/5 land, since it shares Nav/Footer.
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Product page renders correctly · [ ] Reviews section unaffected · [ ] Related products unaffected.

## 8. Search

1. **Current implementation:** Levenshtein fuzzy search, name/brand/category/fragrance/SKU matching, popular/recent searches.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None (known client-side scale limit is pre-existing and out of this phase's scope).
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 6.
10. **Required testing:** Smoke-test search after Stage 4 (Footer)/Stage 3 (Nav), since search UI is nav-adjacent.
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Search returns results · [ ] Suggestions dropdown unaffected.

## 9. Wishlist

1. **Current implementation:** Real add/remove, correct initial filled/unfilled state per visitor.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 6.
10. **Required testing:** Smoke-test add/remove after Stage 1/6 land.
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Add to wishlist works · [ ] Remove from wishlist works · [ ] Heart icon state correct on reload.

## 10. Cart

1. **Current implementation:** Real coupon validation; shipping estimate computed from the same hardcoded ₹999/₹49 constants checkout uses.
2. **Required implementation:** Shipping estimate reads the same `StoreSettings`-derived value Checkout will use after Stage 8, so the two never disagree.
3. **Gap summary:** GAP-004 (shared with Checkout — see Stage 8 for the actual pricing-logic fix; this entry is the display-side consumer of it).
4. **Files to modify:** `app/(storefront)/cart/page.tsx` (or wherever the estimate is rendered — depends on the shared helper Stage 8 introduces).
5. **Dependencies:** **Depends on Stage 8 (Checkout)** — the shared pricing source must exist before Cart can consume it; do not fix Cart's display in isolation, or a second hardcoded copy risks being created.
6. **Risk level:** Low (display-only, once the shared source exists).
7. **Regression risk:** Low, contingent on Stage 8 being correct first.
8. **Acceptance criteria:** See AC-004 (Cart display consistency clause).
9. **Estimated implementation order:** Stage 7 — **sequenced immediately before Stage 8's checkout fix lands**, but implemented as one coordinated change with it in practice (see `PHASE_1B_DEPENDENCY_GRAPH.md`).
10. **Required testing:** Change `StoreSettings.shippingFee` in `/admin/settings`; confirm Cart's estimate and Checkout's charged amount move together, never independently.
- **Definition of Done:** Cart and Checkout are provably reading one shared source, not two copies of the same constant.
- **Rollback considerations:** If the shared-source approach is reverted, Cart and Checkout must be reverted together — reverting only one re-creates the original inconsistency risk in the opposite direction.
- **Testing checklist:** [ ] Cart estimate matches Checkout's final charge under free-shipping threshold · [ ] Cart estimate matches Checkout's final charge below threshold · [ ] Changing admin settings changes both consistently.

## 11. Checkout

1. **Current implementation:** Full real flow (guest + logged-in, Razorpay, COD) works end-to-end; shipping fee/free-shipping threshold/COD availability/COD fee are hardcoded in `actions/orders.ts`, not read from `StoreSettings`.
2. **Required implementation:** `createOrder` reads `shippingFee`/`freeShippingThreshold`/`codEnabled`/`codFee` from `StoreSettings` at order-creation time; COD is genuinely unavailable as a payment method when `codEnabled` is false, not just visually hidden.
3. **Gap summary:** GAP-004 — the single highest-value functional fix in this blueprint.
4. **Files to modify:** `actions/orders.ts` (primary), `components/checkout/**` (if COD availability is currently rendered from a separate hardcoded assumption rather than derived from the server response), `prisma/schema.prisma` (no change — fields already exist).
5. **Dependencies:** None new — `StoreSettings` and its admin UI already exist and are already correct; this is pure wiring, not new capability.
6. **Risk level:** **Medium-High** — this is the one module change in this blueprint that touches live payment/pricing logic.
7. **Regression risk:** **Medium** — must be tested against every existing payment method (UPI/Card/Netbanking/COD), the `ALLOWED_TRANSITIONS` order-status machine, and the coupon-discount interaction (shipping is computed from `subtotal - discount`, so order of operations must not change).
8. **Acceptance criteria:** See AC-004.
9. **Estimated implementation order:** Stage 8 — the highest-priority functional (non-brand-copy) fix in this blueprint; deliberately sequenced after the low-risk brand/copy stages (1–6) so the team is "warmed up" on this codebase's actual checkout code before touching the highest-regression-risk item, per Phase 1A's own risk-ordering logic.
10. **Required testing:** Full checkout run for all 4 payment methods, both above and below the free-shipping threshold, both with `codEnabled` true and false, both with and without an active coupon — this is the one module in the blueprint that warrants a full manual regression pass, not just a smoke test.
- **Definition of Done:** Every value `/admin/settings` exposes for shipping/COD has a real, verified effect on a real checkout run; no hardcoded ₹999/₹49 (or COD-always-on) constant remains in `actions/orders.ts`.
- **Rollback considerations:** **Highest-stakes rollback in this blueprint.** Keep the original hardcoded constants available as a documented fallback (e.g., in a comment or the `StoreSettings` model's own `@default` values, which already match — 49/999) so a revert restores exactly the pre-Phase-1B behavior, not an undefined state. Test the rollback path itself before shipping the forward change.
- **Testing checklist:** [ ] UPI checkout, above threshold · [ ] UPI checkout, below threshold · [ ] Card checkout · [ ] Netbanking checkout · [ ] COD checkout with `codEnabled=true` · [ ] COD correctly unavailable with `codEnabled=false` (both UI and server-side enforcement) · [ ] Coupon + shipping interaction unchanged · [ ] `ALLOWED_TRANSITIONS` order-status machine unaffected · [ ] Cart's estimate (Stage 7) matches the final charge in every case above.

## 12. Customer Account

1. **Current implementation:** Credentials + Google OAuth live, Apple OAuth correctly inactive, guest checkout, RBAC solid; account/login flows depend on `AUTH_SECRET` (Stage 0) and the seeded-credential risk (Stage 0) as their real exposure, not account-module logic itself.
2. **Required implementation:** Unchanged at the module level — Stage 0 already resolves the only real gap in this area.
3. **Gap summary:** GAP-001/GAP-008 (resolved in Stage 0, cross-referenced here); GAP-021 (Apple Sign-In) requires no action — correctly gated.
4. **Files to modify:** None at this module (see Stage 0 for the actual files).
5. **Dependencies:** Stage 0 must complete first.
6. **Risk level:** N/A for this module's own code.
7. **Regression risk:** Low — login/session regression risk is entirely carried by Stage 0's `AUTH_SECRET` rotation, already scoped there.
8. **Acceptance criteria:** See AC-001/AC-008.
9. **Estimated implementation order:** Stage 9 (verification pass, confirming Stage 0 didn't regress login).
10. **Required testing:** Full login/signup/OAuth/password-reset regression pass after Stage 0's `AUTH_SECRET` rotation specifically (this is the one place that change is actually felt by a user).
- **Definition of Done:** Confirmed login/account flows unaffected by Stage 0's credential changes.
- **Rollback considerations:** Tied to Stage 0's rollback plan.
- **Testing checklist:** [ ] Email/password login · [ ] Google OAuth login · [ ] Signup · [ ] Password reset request + confirm · [ ] Guest checkout still bypasses account requirement correctly (unrelated regression check).

## 13. Orders

1. **Current implementation:** Real status machine, tracking, cancellation, refunds; shipping-webhook signature verification uses an unconfirmed generic HMAC-SHA256 scheme across all four courier providers.
2. **Required implementation:** The actually-configured `SHIPPING_PROVIDER`'s webhook signature scheme is verified against that provider's real, current documentation.
3. **Gap summary:** GAP-007.
4. **Files to modify:** `app/api/webhooks/shipping/[provider]/route.ts` (only if the confirmed scheme differs from the current generic implementation — this stage may conclude "confirmed correct, no change needed" for the actually-configured provider).
5. **Dependencies:** Requires live courier-account/documentation access — cannot be fully resolved from code inspection alone; may require a decision-point pause for provider-account credentials.
6. **Risk level:** Medium (webhook logic is security-sensitive).
7. **Regression risk:** Low if scoped to only the one actually-configured provider (`SHIPPING_PROVIDER` env var), not all four speculatively.
8. **Acceptance criteria:** See AC-007.
9. **Estimated implementation order:** Stage 10.
10. **Required testing:** A real (or provider-sandboxed) webhook call against the verified scheme, confirming both a valid-signature success path and an invalid-signature rejection path.
- **Definition of Done:** The active provider's signature verification is confirmed correct against real, current documentation — or explicitly documented as still-generic-and-accepted-risk if the Founder chooses not to invest further here.
- **Rollback considerations:** Keep the current generic implementation as the fallback if a provider-specific scheme investigation is inconclusive — never ship an unverified "improvement" that could reject legitimate webhooks.
- **Testing checklist:** [ ] Valid webhook signature accepted · [ ] Invalid/tampered signature rejected · [ ] No legitimate courier update is dropped after the change.

## 14. CMS

1. **Current implementation:** Homepage/Categories/Blog admin-manageable; `StoreSettings` (including shipping/COD fields) is real and admin-editable, but not fully consumed downstream (see Stage 8).
2. **Required implementation:** Unchanged at the CMS/admin-input level — CMS already correctly captures every value Stage 8 needs; no CMS-side change required.
3. **Gap summary:** None directly in CMS — the gap is entirely on the consuming side (Checkout, Stage 8). Recorded here so it isn't mistakenly re-scoped as a CMS fix.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A — but CMS/`StoreSettings` admin forms should be regression-tested once Stage 8 starts reading from them, to confirm the admin save path still works exactly as before.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 11 (verification pass, immediately after Stage 8 to confirm the settings form itself wasn't touched).
10. **Required testing:** Save a `StoreSettings` change in `/admin/settings` and confirm it persists correctly, independent of whether Checkout is reading it yet.
- **Definition of Done:** Confirmed CMS/settings admin forms are unaffected by Stage 8's consuming-side change.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] `/admin/settings` save still works · [ ] `/admin/cms/homepage` unaffected · [ ] `/admin/cms/categories` unaffected · [ ] `/admin/cms/blog` unaffected.

## 15. Admin

1. **Current implementation:** Full CRUD across products/orders/customers/inventory/marketing/media/analytics/settings/CMS; no page exists for `BusinessInquiry` submissions despite the `InquiryStatus` (`NEW`/`CONTACTED`/`CLOSED`) workflow existing in the schema and `submitBusinessInquiry` being fully real.
2. **Required implementation:** A new `/admin/inquiries` list/detail page — list submissions, filter by status, transition status — following the existing `/admin/customers` pattern (Server Component fetches via Prisma → Client Component for interactivity → calls a Server Action).
3. **Gap summary:** GAP-006 — the largest single net-new build in this blueprint (a new page, not a fix to an existing one).
4. **Files to modify (new):** `app/admin/inquiries/page.tsx`, a new `components/admin/inquiries-table-client.tsx` (or equivalent, matching the existing admin-table component pattern). **Files to modify (existing, minor):** `actions/inquiries.ts` (add a `listBusinessInquiries`/`updateInquiryStatus` action pair, following the exact RBAC pattern — `requireStaff()` — every other admin action already uses), admin nav/sidebar component (add the new route).
5. **Dependencies:** None new — `BusinessInquiry`, `InquiryStatus`, and `submitBusinessInquiry` all already exist; this is purely additive.
6. **Risk level:** Low — new, isolated page; cannot regress any existing admin page.
7. **Regression risk:** Very low, additive-only. The one thing to verify is that the new action(s) added to `actions/inquiries.ts` independently call `requireStaff()` themselves (per the codebase's own documented rule in `CLAUDE.md`/`SECURITY.md` — every exported Server Action must enforce its own auth, never rely on a caller having checked).
8. **Acceptance criteria:** See AC-006.
9. **Estimated implementation order:** Stage 12.
10. **Required testing:** Full CRUD-equivalent test (list, filter, status transition) as `ADMIN`/`STAFF`; confirm a `CUSTOMER`-role or unauthenticated request to the new action(s) is correctly rejected.
- **Definition of Done:** Staff can list, filter, and transition every real `BusinessInquiry` submission from `/admin`; GAP-019's stale comments (footer, business-section) are corrected in the same pass since they reference this exact gap.
- **Rollback considerations:** New, additive page — rollback is simply removing the new route/files; zero effect on any existing page if reverted.
- **Testing checklist:** [ ] List view shows all real submissions · [ ] Status filter works · [ ] Status transition (`NEW`→`CONTACTED`→`CLOSED`) persists correctly · [ ] Non-staff request to the new action is rejected · [ ] Existing admin nav/sidebar unaffected by the new entry.

## 16. Product Management

1. **Current implementation:** Full create/edit/delete, variants, images, SEO fields — real, working.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 13.
10. **Required testing:** Smoke-test product create/edit after Stage 12 (Admin) lands, since both live under `/admin`.
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Create product works · [ ] Edit product works · [ ] Delete product works (regression checks only).

## 17. Category Management

1. **Current implementation:** CRUD, images, `comingSoon` flag; matches the approved 6-category list exactly. Internal status badge reads "Coming Soon."
2. **Required implementation:** Optional — align the internal badge wording with the customer-facing "Muving Soon™" convention, for internal consistency only.
3. **Gap summary:** GAP-022 (P3, cosmetic, admin-internal — lowest priority in this blueprint).
4. **Files to modify:** `components/admin/categories-table-client.tsx:128,170`.
5. **Dependencies:** None.
6. **Risk level:** Very low.
7. **Regression risk:** None — admin-internal label text only.
8. **Acceptance criteria:** See AC-022.
9. **Estimated implementation order:** Stage 13 (bundled with Product Management's verification pass, since both are low-effort `/admin` items).
10. **Required testing:** Visual check of the categories admin table only.
- **Definition of Done:** Badge wording matches the customer-facing convention (or explicitly deferred, if the Founder decides internal tooling doesn't need to match customer copy).
- **Rollback considerations:** Trivial single-file text revert.
- **Testing checklist:** [ ] Categories table renders correctly · [ ] `comingSoon` toggle still functions correctly (regression check, unrelated to the label text).

## 18. Inventory

1. **Current implementation:** Stock adjustment, audit trail (`StockHistory`), low-stock alerts, storefront revalidation on change — real, working.
2. **Required implementation:** Unchanged — no gap found.
3. **Gap summary:** None.
4. **Files to modify:** None.
5. **Dependencies:** None.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 14.
10. **Required testing:** Smoke-test a stock adjustment after Stage 12 lands.
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Stock adjustment persists and shows in `StockHistory` · [ ] Low-stock alert still fires at the correct threshold.

## 19. Coupons

1. **Current implementation:** Real CRUD, percent/flat, min order, max uses, expiry, rate-limited validation — real, working.
2. **Required implementation:** Unchanged — no gap found. (Note: coupon-discount interacts with Stage 8's shipping-fee change via `subtotal - discount`; Stage 8's testing checklist already covers this interaction — no separate Coupons-module change is implied.)
3. **Gap summary:** None directly; cross-referenced dependency on Stage 8.
4. **Files to modify:** None.
5. **Dependencies:** Stage 8 must be tested with an active coupon (see Stage 8's testing checklist) — Coupons module itself is unchanged.
6. **Risk level:** N/A for this module's own code.
7. **Regression risk:** Carried entirely by Stage 8's testing, not a separate Coupons-module risk.
8. **Acceptance criteria:** N/A — verification only, covered under AC-004.
9. **Estimated implementation order:** Stage 14 (verification, alongside Stage 8's coupon-interaction test).
10. **Required testing:** Confirm coupon validation and application are unaffected by Stage 8.
- **Definition of Done:** Confirmed no action needed; Stage 8's coupon-interaction test passes.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Coupon validation unaffected · [ ] Coupon + new shipping logic produces the correct total (see Stage 8).

## 20. Media

1. **Current implementation:** Cloudinary-backed media library, folders, server-side size-limit validation (Phase 16) — real, working. `.env` holds real-looking Cloudinary credentials of unconfirmed provenance.
2. **Required implementation:** No code change to the Media module itself. Founder/owner confirms whether the `.env` Cloudinary credentials are an intentional dev sandbox or should be rotated.
3. **Gap summary:** GAP-020 — a config/credential-provenance question, not a Media-feature defect.
4. **Files to modify:** `.env` only, and only if rotation is decided — not source-controlled, not a code change.
5. **Dependencies:** Founder confirmation required before any action; this is a decision point, not an engineering task.
6. **Risk level:** Low (config-only).
7. **Regression risk:** None to the Media feature's code; rotating credentials would require re-testing uploads once done.
8. **Acceptance criteria:** See AC-020.
9. **Estimated implementation order:** Stage 14 (parallel with other low-effort verification items — does not block anything else).
10. **Required testing:** If rotated: one real media upload through `/admin/media` to confirm the new credentials work end-to-end.
- **Definition of Done:** Provenance confirmed either way; rotated if needed, left alone with a documented reason if not.
- **Rollback considerations:** Keep the old credentials available until the new ones are confirmed working, in case of a Cloudinary-side issue.
- **Testing checklist:** [ ] Upload still works with whichever credential set is active · [ ] Size-limit validation still enforced.

## 21. Analytics

1. **Current implementation:** Real revenue/GST/product-breakdown KPIs — working.
2. **Required implementation:** Unchanged — no gap found. (Note: Stage 8's shipping-fee change could shift historical vs. post-change revenue figures if not clearly demarcated — worth a one-line note in analytics documentation, not a code change.)
3. **Gap summary:** None directly.
4. **Files to modify:** None.
5. **Dependencies:** Awareness of Stage 8's effective date, for interpreting revenue trends correctly — not a code dependency.
6. **Risk level:** N/A.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** N/A — verification only.
9. **Estimated implementation order:** Stage 14.
10. **Required testing:** Confirm KPI queries still run correctly after Stage 8 (schema unchanged, so this should be a non-event).
- **Definition of Done:** Confirmed no action needed.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Analytics dashboard loads correctly · [ ] Figures remain internally consistent after Stage 8.

## 22. Notifications

1. **Current implementation:** Real email/WhatsApp sends, real admin alerts (Phase 18), all correctly gated by `StoreSettings` toggles; WhatsApp template names (`payment_confirmed`, `order_delivered`, `order_shipped`) are placeholders pending provider-side approval.
2. **Required implementation:** No code change — the three template names need to be created and approved in the live messaging provider's dashboard (an external action, not an engineering task).
3. **Gap summary:** GAP-014.
4. **Files to modify:** None (external provider dashboard only).
5. **Dependencies:** Access to the configured messaging provider's dashboard.
6. **Risk level:** Low.
7. **Regression risk:** None — code path is unchanged either way, already correctly gated.
8. **Acceptance criteria:** See AC-014.
9. **Estimated implementation order:** Stage 15 (can happen in parallel with any other stage — no code dependency).
10. **Required testing:** One real send per template, post-approval, confirming delivery.
- **Definition of Done:** All three templates approved and confirmed sending in the live provider.
- **Rollback considerations:** N/A (external configuration, not code).
- **Testing checklist:** [ ] Payment-confirmation WhatsApp send succeeds · [ ] Delivery WhatsApp send succeeds · [ ] Shipment WhatsApp send succeeds (already live per Phase 18, regression-check only).

## 23. Mobile

1. **Current implementation:** Tailwind responsive classes (`sm:`/`md:`/`lg:`) used consistently across every component inspected; not independently click/device-tested in Phase 0 or Phase 1A (no browser automation tooling available).
2. **Required implementation:** A real, device-level verification pass (not a code change) covering Chapter 7's 7-point Responsive Review checklist, run after Stages 1–12 land (since those stages touch Homepage/Nav/Footer/Category/Checkout — the highest-traffic mobile surfaces).
3. **Gap summary:** Verification gap, not a confirmed code defect — no `GAP-0xx` ID assigned in Phase 1A since nothing broken was found, only unverified.
4. **Files to modify:** None anticipated — only if the verification pass surfaces a real, new defect, which would become its own tracked gap at that point.
5. **Dependencies:** Stages 1–12 should be complete first, so mobile verification covers the final state, not a moving target.
6. **Risk level:** Unknown until verified.
7. **Regression risk:** N/A (verification, not a change).
8. **Acceptance criteria:** See AC-MOBILE.
9. **Estimated implementation order:** Stage 16.
10. **Required testing:** Manual device/emulator pass across Homepage, Shop, Category, Product Detail, Cart, Checkout, Account, and Admin on at least one small-viewport and one tablet-viewport device.
- **Definition of Done:** Chapter 7's 7-point Responsive Review checklist explicitly confirmed, pass or fail, on real or emulated devices — not inferred from code patterns alone.
- **Rollback considerations:** N/A (verification only).
- **Testing checklist:** [ ] Small-screen hierarchy · [ ] Readable text/tappable actions · [ ] Product-image clarity · [ ] Navigation behavior · [ ] Cart/checkout/form completion · [ ] Load/interaction performance · [ ] No accidental overflow/hidden content.

## 24. Accessibility

1. **Current implementation:** Phase 16's own spot-check found aria-labels, aria-pressed, focus-visible styles consistent; not independently re-tested with real assistive technology in Phase 0 or Phase 1A.
2. **Required implementation:** A real assistive-technology verification pass (screen reader, keyboard-only navigation), not a code change, run after Stages 1–12.
3. **Gap summary:** Verification gap, no confirmed defect — same status as Mobile.
4. **Files to modify:** None anticipated.
5. **Dependencies:** Stages 1–12 complete first.
6. **Risk level:** Unknown until verified.
7. **Regression risk:** N/A.
8. **Acceptance criteria:** See AC-A11Y.
9. **Estimated implementation order:** Stage 16 (parallel with Mobile).
10. **Required testing:** Keyboard-only pass through Checkout end-to-end (highest-stakes journey); screen-reader spot-check of Homepage, Shop, Product Detail, Cart.
- **Definition of Done:** A real assistive-technology pass explicitly confirmed on the highest-traffic journeys.
- **Rollback considerations:** N/A.
- **Testing checklist:** [ ] Full keyboard-only checkout completion · [ ] Screen-reader announces cart/wishlist state changes · [ ] Focus-visible styles present on every interactive element touched by Stages 1–12's changes specifically (new/changed elements, not a full-site re-audit).

## 25. SEO

1. **Current implementation:** Sitemap, robots, and JSON-LD structured data real and complete (Phase 16); default meta description (`lib/seo.ts`) uses all-caps "MUV."
2. **Required implementation:** `DEFAULT_DESCRIPTION` corrected to "Muv."
3. **Gap summary:** GAP-002 (SEO-surface instance — same gap as Homepage/Nav/Footer, different file).
4. **Files to modify:** `lib/seo.ts:18`, and `app/layout.tsx:34` (page `<title>`, same casing issue).
5. **Dependencies:** None — can be batched with Stage 1 (Homepage) or Stage 4 (Footer) since it's the same underlying text-casing fix, just a different file; kept as its own line item here for SEO-specific traceability.
6. **Risk level:** Low.
7. **Regression risk:** Very low — meta description/title text only, no effect on actual SEO mechanics (sitemap/robots/JSON-LD untouched).
8. **Acceptance criteria:** See AC-002 (SEO instance).
9. **Estimated implementation order:** Stage 1 (bundled with Homepage, since it's the same gap and lowest-risk stage).
10. **Required testing:** View page source / metadata inspector on the homepage to confirm the corrected title/description; confirm no change to `sitemap.xml`/`robots.txt`/JSON-LD (untouched files).
- **Definition of Done:** Title and default meta description read "Muv," not "MUV"; sitemap/robots/JSON-LD unaffected (out of scope, already correct).
- **Rollback considerations:** Trivial two-file text revert.
- **Testing checklist:** [ ] `<title>` corrected · [ ] Default meta description corrected · [ ] `sitemap.xml` unaffected · [ ] `robots.txt` unaffected · [ ] JSON-LD unaffected.

---

## Cross-Cutting / Infrastructure (not tied to a single module)

These seven items (GAP-010, GAP-011, GAP-012, GAP-013, GAP-015, GAP-016, GAP-017, GAP-018, GAP-024 —
nine total; GAP-015/016 also appear under CMS-adjacent discussion above) are explicitly **not
scheduled into Stages 0–16** because each requires a scope/tooling decision from the Founder before
any implementation order makes sense:

| Gap | Item | Why deferred from this blueprint's stage sequence |
|---|---|---|
| GAP-010 | No test suite | New devDependency + framework choice — a Founder-level decision, not a fix |
| GAP-011 | No ESLint | Same — new devDependency decision |
| GAP-012 | In-memory rate limiting | Only a real gap once deployed beyond one server instance — timing depends on hosting decision |
| GAP-013 | No CSP header | Explicitly deferred in Phase 16 pending a safe live-test method against Razorpay/Cloudinary |
| GAP-015 | No unified marketing-campaign system | A genuine new feature, not a fix — belongs in a future phase's feature scope, not stabilization |
| GAP-016 | No admin-toggleable personalization rail | Same — future feature scope |
| GAP-017 | No cross-device `Cart` table | Deliberately deferred by design; no action unless the requirement changes |
| GAP-018 | No job scheduler/cron | Depends on a hosting-platform decision |
| GAP-024 | No customer shopping-profile view | A genuine future feature, not a fix |

**Recommendation:** address these in a dedicated Phase 1C (or later) scoping conversation, not folded
into Phase 1B's stabilization sequence — none of them block Phase 1B's own Definition of Done.

---

## Implementation Sequence (full)

```
Stage 0  — Pre-flight: AUTH_SECRET rotation + seed guard (GAP-001, GAP-008)
   ↓
Stage 1  — Homepage text fixes + SEO title/meta (GAP-002)
   ↓
Stage 2  — Header (verification only, no change)
   ↓
Stage 3  — Navigation text fix (GAP-002)
   ↓
Stage 4  — Footer: casing, spelling, social links, stale comment (GAP-002, 003, 009, 019)
   ↓
Stage 5  — Category Pages: Muving Soon™ fix (GAP-005)
   ↓
Stage 6  — Shop / Product Detail / Search / Wishlist (verification only)
   ↓
Stage 7  — Cart: shipping-estimate display (GAP-004, display side)
   ↓
Stage 8  — Checkout: StoreSettings pricing wiring (GAP-004, logic side — highest regression risk)
   ↓
Stage 9  — Customer Account (verification of Stage 0's effect)
   ↓
Stage 10 — Orders: shipping-webhook signature verification (GAP-007)
   ↓
Stage 11 — CMS (verification only)
   ↓
Stage 12 — Admin: BusinessInquiry admin UI, new page (GAP-006, GAP-019 comment cleanup)
   ↓
Stage 13 — Product Management + Category Management badge wording (GAP-022)
   ↓
Stage 14 — Inventory / Coupons / Media / Analytics (verification + GAP-020 decision point)
   ↓
Stage 15 — Notifications: WhatsApp template approval (GAP-014, external)
   ↓
Stage 16 — Mobile + Accessibility: real device/AT verification pass (final gate before Phase 1C)
```

This matches the brief's example ordering (Homepage → Header → Navigation → Footer → Categories →
Products → Cart → Checkout → Customer Account → CMS → Admin) exactly through Stage 12, then extends
it to cover the remaining 13 modules and the pre-flight/cross-cutting items the example didn't name.
Full reasoning for every dependency arrow is in `PHASE_1B_DEPENDENCY_GRAPH.md`.
