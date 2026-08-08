# Phase 1B — Acceptance Criteria

Consolidated, QA-ready acceptance criteria, one block per gap, referenced by ID (`AC-0xx`) from
`PHASE_1B_IMPLEMENTATION_MASTER_PLAN.md`. Each is written so a reviewer can check it against a real
running instance of the site without needing to re-read the full gap analysis.

---

### AC-001 — `AUTH_SECRET` rotation (GAP-001)
- [ ] The deployed `.env`'s `AUTH_SECRET` is not the literal string `"replace-with-a-long-random-string"`.
- [ ] The value is unique per environment (local/staging/production do not share one secret).
- [ ] A user can log in and receive a valid session after rotation.
- [ ] A session token signed with the old placeholder secret is rejected, not silently honored.

### AC-008 — Seeded admin credential guard (GAP-008)
- [ ] Running `npm run db:seed` against a `DATABASE_URL` that does not look like a development
      database (exact detection method left to implementation — e.g., an explicit `NODE_ENV`/flag
      check) either refuses to run or requires an explicit override flag.
- [ ] The seeded account's password is still `ChangeMe123` only in genuine local development, and the
      seed output/documentation explicitly instructs changing it immediately.

### AC-002 — Brand casing "MUV" → "Muv" in customer-facing text (GAP-002)
Applies to: `app/layout.tsx`, `lib/seo.ts`, `components/storefront/nav.tsx`,
`components/storefront/footer.tsx`, `components/storefront/brand-story.tsx`,
`components/storefront/social-proof.tsx`.
- [ ] The homepage `<title>` reads "Muv — Keep Muving," not "MUV — Keep Muving."
- [ ] The default meta description in `lib/seo.ts` reads "Muv," not "MUV."
- [ ] Nav's "Explore Muv" link text is corrected.
- [ ] Footer's "Thoughtful updates from Muv..." and "© 2026 Muv. All rights reserved." are corrected.
- [ ] Brand Story's "Muv exists because..." is corrected.
- [ ] Social Proof's "...people live with Muv every day" is corrected.
- [ ] The `/logo.png` image and its `alt` attribute are **unchanged** (explicitly out of scope — a
      logo/visual-asset question, not a written-identity one).
- [ ] `Product.brand` data field values (`"MUV"` default in the schema) are **unchanged** — this is a
      structured catalogue attribute, not prose, and was explicitly not treated as a violation.
- [ ] A full-text site search for standalone `"MUV"` outside the excluded cases above returns zero
      customer-facing matches.

### AC-003 — "moving" → "Muving" in footer (GAP-003)
- [ ] Footer's "Care that keeps moving" line reads "Muving," not "moving," or the line is removed
      as a near-duplicate of the tagline immediately above it (implementer's choice, either satisfies
      the underlying Knowledge Book rule).
- [ ] No other customer-facing instance of "moving" (where "Muving" was intended) exists — verified
      by a full-text search, not just the one known instance.

### AC-004 — `StoreSettings` pricing wired into Cart + Checkout (GAP-004)
- [ ] Changing `StoreSettings.shippingFee` in `/admin/settings` changes the real fee shown in the
      cart's shipping estimate.
- [ ] Changing `StoreSettings.shippingFee` in `/admin/settings` changes the real fee charged at
      checkout for a real order.
- [ ] Changing `StoreSettings.freeShippingThreshold` changes the real subtotal at which shipping
      becomes free, in both Cart's estimate and Checkout's charge.
- [ ] Setting `StoreSettings.codEnabled = false` makes COD genuinely unavailable as a payment method
      at checkout (not selectable in the UI, and rejected server-side if attempted directly against
      `createOrder`).
- [ ] Setting `StoreSettings.codEnabled = true` with a non-zero `codFee` applies that fee correctly
      to a real COD order.
- [ ] Cart's displayed shipping estimate and Checkout's actually-charged shipping fee **never
      disagree** for the same cart contents, coupon state, and settings — tested for at least one
      case above the free-shipping threshold and one below it.
- [ ] A coupon discount is still applied before the shipping-fee free-threshold comparison, exactly
      as before this change (i.e., `subtotal - discount >= freeShippingThreshold`, not
      `subtotal >= freeShippingThreshold`) — confirmed by one real checkout run with an active coupon
      that crosses the threshold only after the discount is applied.
- [ ] The existing `ALLOWED_TRANSITIONS` order-status state machine is unaffected — confirmed by one
      real order's status progressing through its normal states after the change.
- [ ] No literal `999` or `49` remains hardcoded in `actions/orders.ts` for shipping/free-shipping
      purposes.

### AC-005 — "Coming Soon" → "Muving Soon™" on Skin Care category page (GAP-005)
- [ ] `/collections/skin-care` displays "Muving Soon™" (with the trademark symbol), not "Coming Soon."
- [ ] The wording exactly matches the homepage's Skin Care category card, character-for-character.
- [ ] The other 5 live category pages are unaffected (spot-checked, not just the changed branch).

### AC-006 — Admin `BusinessInquiry` management UI (GAP-006)
- [ ] `/admin/inquiries` (or equivalent route) exists and is reachable from the admin nav for
      `ADMIN`/`STAFF` roles.
- [ ] The page lists every real `BusinessInquiry` row from the database — not mock/sample data.
- [ ] A status filter (`NEW`/`CONTACTED`/`CLOSED`) works correctly against real data.
- [ ] A staff user can transition a real inquiry's status and see the change persist after a page
      reload.
- [ ] The new Server Action(s) added to `actions/inquiries.ts` (e.g., `listBusinessInquiries`,
      `updateInquiryStatus`) each independently call `requireStaff()` — confirmed by attempting the
      action as an unauthenticated or `CUSTOMER`-role request and observing rejection, not by reading
      the code alone.
- [ ] `submitBusinessInquiry` (the public, unauthenticated submission path) is unchanged and still
      works correctly after this change.

### AC-007 — Shipping webhook signature verification confirmed (GAP-007)
- [ ] The actually-configured `SHIPPING_PROVIDER`'s webhook signature scheme has been checked against
      that provider's current, real documentation (not assumed).
- [ ] If the scheme matches the current generic HMAC-SHA256 implementation: this is documented as
      confirmed-correct, no code change needed.
- [ ] If the scheme differs: the corrected verification logic accepts a real (or provider-sandboxed)
      valid webhook and rejects a tampered/invalid one.
- [ ] No legitimate courier status update is dropped as a side effect of any change made here.

### AC-009 — Footer social links read from `StoreSettings` (GAP-009)
- [ ] With all four `StoreSettings` social fields populated, all four footer icons link to the
      correct, real MUV profile URLs.
- [ ] With a field left blank, that icon does not render (rather than linking to a generic platform
      homepage).
- [ ] With all four fields blank, no social icons render and the footer layout does not break.
- [ ] The change is verified on at least two different page templates (footer is a shared component).

### AC-014 — WhatsApp notification templates approved (GAP-014)
- [ ] `payment_confirmed`, `order_delivered`, and `order_shipped` templates are created and approved
      in the live messaging provider's dashboard.
- [ ] One real send per template succeeds and is received.
- [ ] `NotificationLog` records the send with `status: SENT` for each, not `FAILED`.

### AC-019 — Stale code comments corrected (GAP-019)
- [ ] `components/storefront/footer.tsx`'s comment no longer claims "no dedicated business-inquiry
      page exists yet" once GAP-006 ships.
- [ ] `components/storefront/business-section.tsx`'s comment is corrected the same way.
- [ ] Both comments accurately describe the current state (backend + form real; admin UI now real
      too, once GAP-006 ships).

### AC-020 — Cloudinary credential provenance confirmed (GAP-020)
- [ ] Founder/owner has explicitly confirmed whether the `.env` Cloudinary credentials are an
      intentional development account or need rotation.
- [ ] If rotated: one real media upload through `/admin/media` succeeds with the new credentials.
- [ ] If not rotated: the decision and reasoning are documented (e.g., in `.env.example` or a project
      doc) so a future audit doesn't re-flag it without context.

### AC-022 — Admin category badge wording (GAP-022, optional/P3)
- [ ] Either the admin badge is updated to "Muving Soon™" for internal consistency, or an explicit
      decision is recorded that admin-internal tooling doesn't need to match customer-facing copy.
- [ ] The `comingSoon` toggle itself still functions correctly regardless of which wording is chosen.

### AC-MOBILE — Mobile responsiveness verification (no code gap, verification only)
- [ ] Chapter 7's 7-point Responsive Review checklist (hierarchy, readable/tappable, image clarity,
      navigation, cart/checkout/form completion, load/interaction performance, no accidental
      overflow) is explicitly checked, pass/fail per item, on at least one real or emulated
      small-viewport device and one tablet-viewport device.
- [ ] Any real defect found during this pass is filed as a new, separate gap — not silently fixed
      inside this verification step.

### AC-A11Y — Accessibility verification (no code gap, verification only)
- [ ] A full keyboard-only pass completes the entire checkout journey (browse → cart → checkout →
      confirmation) without a mouse.
- [ ] A screen reader correctly announces cart/wishlist state changes on at least one spot-checked
      interaction.
- [ ] Any real defect found during this pass is filed as a new, separate gap — not silently fixed
      inside this verification step.

---

## Acceptance Criteria Coverage Check

Every `GAP-0xx` from `PHASE_1A_PRIORITY_BACKLOG.md` maps to exactly one `AC-0xx` block above, except
the nine Cross-Cutting/Infrastructure items (GAP-010, 011, 012, 013, 015, 016, 017, 018, 024), which
are explicitly out of Phase 1B's scope and therefore have no acceptance criteria here — they will get
their own AC set when a future phase scopes them for real implementation.

| GAP | AC | GAP | AC | GAP | AC |
|---|---|---|---|---|---|
| GAP-001 | AC-001 | GAP-006 | AC-006 | GAP-014 | AC-014 |
| GAP-002 | AC-002 | GAP-007 | AC-007 | GAP-019 | AC-019 |
| GAP-003 | AC-003 | GAP-008 | AC-001 (shared block, both credential items) / AC-008 | GAP-020 | AC-020 |
| GAP-004 | AC-004 | GAP-009 | AC-009 | GAP-021 | None needed — already correctly gated, no action |
| GAP-005 | AC-005 | GAP-022 | AC-022 | — | — |

Mobile and Accessibility verification (no assigned `GAP-0xx`, since Phase 1A found no confirmed
defect, only an unverified area) are covered by AC-MOBILE and AC-A11Y.
