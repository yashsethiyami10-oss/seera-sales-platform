# Phase 1 — Founder Acceptance Checklist

A practical, ~20–30 minute browser walkthrough. Everything in this checklist was **not** testable by
automation in the environment this phase's work was done in (no browser tooling available) — this is
the one pass that closes that gap. Run the app locally first:

```bash
npm install
npx prisma generate
npm run build && npm run start     # preferred — more stable than `npm run dev` for this walkthrough
```

Then open `http://localhost:3000` in a real browser (desktop first, then resize/use device tools for
mobile — see Section K).

For each item: perform the action, compare to the expected result, check Pass or Fail, add a note if
anything looked off (even something minor — this is the place to catch it).

---

## A. Homepage Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| A1 | Load `/` | Page loads fully, no visible errors, hero/banner/categories/featured products all show real content (not blank or broken) | ☐ | ☐ | |
| A2 | Look at the browser tab title | Reads "Muv — Keep Muving" (capital M, lowercase uv — not "MUV") | ☐ | ☐ | |
| A3 | Scroll through every homepage section | Each section (brand story, categories, featured, social proof, business panel, footer) renders with real content, no placeholder/lorem-ipsum text | ☐ | ☐ | |
| A4 | Find the "Skin Care" category card | Shows "Muving Soon™" (not "Coming Soon") | ☐ | ☐ | |

## B. Brand/Message Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| B1 | Read the homepage brand-story copy | Brand name reads "Muv" (not all-caps "MUV") throughout the prose | ☐ | ☐ | |
| B2 | Read the footer | Tagline "Keep Muving™" present and correctly cased; copyright line reads "© 2026 Muv"; no "MUV" in all-caps prose | ☐ | ☐ | |
| B3 | Visit `/about` | Copy frames Muv across multiple categories (home, fabric, body, personal, car) — not detergent-only language | ☐ | ☐ | |
| B4 | Search the page (Ctrl+F) for "MAGIC IN MUV" on homepage, About, and Contact | Zero matches | ☐ | ☐ | |
| B5 | Check the footer's social icons | Each visible icon links to a real Muv profile (not `instagram.com`'s generic homepage, etc.) — or the icon doesn't show at all if unconfigured | ☐ | ☐ | |

## C. Category Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| C1 | Visit `/shop` | All approved categories are filterable: Home Care, Fabric Care, Body Care, Personal Care, Car Care | ☐ | ☐ | |
| C2 | Visit each of `/collections/home-care`, `/fabric-care`, `/body-care`, `/personal-care`, `/car-care` | Each shows a real product grid, no errors | ☐ | ☐ | |
| C3 | Visit `/collections/skin-care` | Shows a "Muving Soon™" holding page (not a product grid, not "Coming Soon") | ☐ | ☐ | |

## D. Product Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| D1 | Open any product from the shop grid | Product detail page loads: real images, price, description, size/variant options | ☐ | ☐ | |
| D2 | Select a different size/variant if available | Price and stock status update correctly | ☐ | ☐ | |
| D3 | Scroll to reviews | Real reviews (or an honest "no reviews yet" state) — no fake/placeholder reviews | ☐ | ☐ | |
| D4 | Click the wishlist (heart) icon | Prompts login if logged out, or toggles correctly if logged in | ☐ | ☐ | |

## E. Cart Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| E1 | Add a product to cart | Cart icon/count updates; item appears in `/cart` | ☐ | ☐ | |
| E2 | Change the quantity | Subtotal updates correctly | ☐ | ☐ | |
| E3 | Note the shipping fee shown | Matches what's configured in `/admin/settings` → Shipping (see Admin section) — **this is the main Phase 1 pricing fix, worth checking carefully** | ☐ | ☐ | |
| E4 | If a coupon exists, apply it | Discount applies correctly to the total | ☐ | ☐ | |
| E5 | Remove the item | Cart returns to empty state with a real empty-cart message (not a blank page) | ☐ | ☐ | |

## F. Checkout Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| F1 | Add an item, proceed to checkout | Checkout flow starts (contact info step) | ☐ | ☐ | |
| F2 | Proceed through address and delivery steps | Standard Delivery's price matches Cart's shipping fee exactly | ☐ | ☐ | |
| F3 | **Known issue to confirm, not a new bug:** select Express Delivery | Total updates on-screen (+₹99) — **do not expect this to be reflected in the final charge**; this is a documented pre-existing gap, see `PHASE_1_KNOWN_ISSUES.md` | ☐ | ☐ | |
| F4 | Reach the Payment Methods step | If COD is enabled in `/admin/settings`, it's selectable; if disabled, it does not appear as an option at all | ☐ | ☐ | |
| F5 | Reach the Review step | Order summary, terms checkbox, and "Place Order" button all present and functional (button disabled until terms are accepted) | ☐ | ☐ | |

## G. Test Order Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| G1 | Place a real test order using **Cash on Delivery only** (never a real card/UPI payment) | Order is created, redirected to a success page with a real order number | ☐ | ☐ | |
| G2 | Note the total charged | Matches exactly what was shown at the final review step (for Standard Delivery) | ☐ | ☐ | |
| G3 | Check any configured notification (email/SMS) | A real confirmation was sent, if providers are configured | ☐ | ☐ | |

## H. Customer Account Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| H1 | Sign up for a new account, or log in | Succeeds, redirects to account area | ☐ | ☐ | |
| H2 | Visit `/account/orders` | The test order from Section G (if placed while logged in, or looked up by order number + email if placed as guest) appears | ☐ | ☐ | |
| H3 | Visit `/account/profile` and `/account/wishlist` | Both load with real, correct account data | ☐ | ☐ | |

## I. Admin Order Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| I1 | Log in as admin (`admin@muv.co.in` / the seeded password, or your real admin account) | Reaches `/admin` dashboard | ☐ | ☐ | |
| I2 | Visit `/admin/orders` | The test order from Section G appears with correct details | ☐ | ☐ | |
| I3 | Open the order, attempt a valid status transition (e.g., Placed → Packed) | Succeeds and reflects immediately | ☐ | ☐ | |
| I4 | Visit `/admin/inquiries` (new this phase) | Page loads; if any business inquiries exist (real or from `/contact`), they're listed with a working status filter/change control | ☐ | ☐ | |

## J. Admin Product Review

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| J1 | Visit `/admin/products` | Real product list loads | ☐ | ☐ | |
| J2 | Open a product for editing | Real data pre-fills the form | ☐ | ☐ | |
| J3 | Visit `/admin/cms/categories` | All 6 categories listed; Skin Care's badge reads "Muving Soon™" | ☐ | ☐ | |
| J4 | Visit `/admin/settings` | Shipping fee, free-shipping threshold, and COD toggle are all editable here — **this is what Section E/F above should reflect** | ☐ | ☐ | |

## K. Mobile Review

Use your browser's device toolbar (e.g., Chrome DevTools → Toggle Device Toolbar) or a real phone.

| # | Action | Expected Result | Pass | Fail | Notes |
|---|---|---|---|---|---|
| K1 | Load homepage at a phone-width viewport (~375px) | No horizontal scrolling/overflow; header/nav collapse to a mobile-appropriate layout | ☐ | ☐ | |
| K2 | Open the mobile navigation menu | Opens/closes correctly, all links tappable | ☐ | ☐ | |
| K3 | Browse the product grid on mobile | Products display in a readable grid, images load correctly | ☐ | ☐ | |
| K4 | Open a product detail page on mobile | Layout adapts, text remains readable, buttons are easily tappable | ☐ | ☐ | |
| K5 | Go through cart and checkout on mobile | Forms are usable, sticky order-summary/checkout button (if present) doesn't obscure content | ☐ | ☐ | |
| K6 | Repeat a quick pass at tablet width (~768px) | Layout adapts sensibly between mobile and desktop | ☐ | ☐ | |
| K7 | Check an admin page (e.g., `/admin/orders`) on a tablet-width viewport | Usable, even if not optimized as tightly as the storefront | ☐ | ☐ | |

## L. Final Approval Decision

| Question | Answer |
|---|---|
| Were any items above marked **Fail**? | ☐ Yes → list them below, do not approve yet · ☐ No |
| Failed items (if any), with enough detail to reproduce | _______________________________________________ |
| Do the known, pre-documented issues (Express Delivery pricing, dev-mode-only flakiness, deferred credentials) change your decision? | ☐ Yes, need to address first · ☐ No, acceptable as documented |

**Final decision:**

☐ **APPROVED** — Phase 1 is accepted; proceed to Phase 2 planning.
☐ **NOT APPROVED** — listed failures must be resolved first; re-run this checklist after fixes.

Signed/dated: _______________________________________________
