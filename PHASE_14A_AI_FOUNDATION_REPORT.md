# MUV™ — Phase 14A: AI Foundation & Personalization
### Implementation Report
### Status: All six systems built on real data only · Build and typecheck verified · A real static-generation regression was caught and fixed during verification

> This is a commerce personalization foundation, not a chatbot — every recommendation, search result, and filter below is a plain Prisma query or a small self-contained algorithm (Levenshtein distance for typo tolerance), never an external AI service and never fabricated data. Per the brief's own instruction, the codebase was audited first (§1) before any code was written.

---

## 1. Audit Findings

| Area | What already existed | What was missing |
|---|---|---|
| Recently Viewed | `components/storefront/recently-viewed.tsx` — real, localStorage-only, works for guests and logged-in alike | No server persistence, no cross-device history, no merge-on-login |
| Recommendations | "Related Products" on Product Detail — same-category only | No fragrance-overlap signal, no co-purchase signal, no trending/new-arrivals/staff-picks/recommended-for-you anywhere |
| Search | `ProductGrid`'s client-side search — exact name substring only | No brand/SKU/fragrance/category matching, no typo tolerance, no suggestions, no recent/popular searches |
| Filters | `ProductGrid` already had real size/category/price/fragrance/in-stock filters and 6 real sort orders | No rating filter, no discount filter, no active-filter count |
| Homepage | Fully real CMS-driven (Phase 13A) — hero/categories/featured/brand story/reviews/business, gated by `HomepageSection.visible` | No adaptive/personalized rail at all |
| Customer data | `Order`/`OrderItem`/`Wishlist`/`Review` all real and complete | No preference computation anywhere — every signal existed in raw form, nothing aggregated it |

**Real gaps found, not just missing UI:**
- No `RecentlyViewedItem` or `SearchQuery` model existed — both added as new, additive tables (§2).
- `Product.brand` and `ProductVariant.sku` were already real columns but were never passed from `shop`/`collections` pages into `ProductGrid`'s client-side product objects — Smart Search couldn't have matched on them even with better logic, until that plumbing was added (§4).
- **A regression this pass introduced and then caught itself, during Build Verification (§10):** the first version of the merge-on-login sync component read the session via a server-side `auth()` call placed in the root layout. Since the root layout wraps every route, that turned every previously-static marketing page (`/about`, `/faq`, `/login`, `/privacy`, `/terms`, etc.) dynamic — a real performance regression, caught by comparing `npm run build`'s route table before and after. Fixed by moving the login check to a client-side fetch against NextAuth's own `/api/auth/session` endpoint instead (§4), which restored every one of those routes to static (`○`) generation. Documented here in full rather than silently fixed, since it's exactly the kind of regression "Server Components first... cache where appropriate" (Step 8) exists to prevent.

---

## 2. Existing Logic Reused

`getStockStatus`/`STOCK_STATUS_LABEL`, `calculateDiscountPercent`, `requireCustomer` (`lib/rbac.ts`), `addToWishlist`/`removeFromWishlist` (unchanged), the `FeaturedProducts` component and its `FeaturedProduct` shape, the exact "pick the in-stock, cheapest display variant + badge" logic already used by the homepage's Featured section and Product Detail's Related Products (now a shared `toFeaturedProduct` pattern, §5). `Product.isFeatured` is reused as-is for "Staff Picks" rather than adding a second curation flag. Two schema-only additions were made (§3); every recommendation/search/filter function is new code, but it reads exclusively through existing `Order`/`OrderItem`/`Wishlist`/`Review`/`Product` tables — no other model needed to change.

---

## 3. Schema Changes (additive only)

- **`RecentlyViewedItem`** — `customerId`, `productId`, `viewedAt` (bumped via upsert on repeat views), `@@unique([customerId, productId])`. Logged-in only; guests keep using the existing localStorage mechanism unchanged.
- **`SearchQuery`** — `term`, `customerId` (nullable — guest searches count too), `resultCount`, `createdAt`. Only aggregate term counts are ever exposed (Popular Searches); no per-shopper search history is ever shown to anyone but that shopper.
- Back-relations added to `Customer` (`recentlyViewed`, `searchQueries`) and `Product` (`recentlyViewedBy`). No existing column was altered.

---

## 4. Recently Viewed

- **Guests:** unchanged — `components/storefront/recently-viewed.tsx` still reads/writes localStorage exactly as before.
- **Logged-in customers:** `actions/recently-viewed.ts` — `recordProductView` (fire-and-forget upsert + trim to 8, called from the same component whenever `current.productId` is present and the viewer is logged in), `getRecentlyViewed` (real DB history, used by the homepage's "Continue Shopping" rail), `mergeGuestRecentlyViewed` (resolves a guest's localStorage slugs to real products and upserts them once).
- **Merge after login:** `components/storefront/recently-viewed-sync.tsx`, mounted once in the root layout. Checks login state via a client-side fetch to `/api/auth/session` (not a server `auth()` call — see §1's regression note), then merges exactly once per browser session via a `sessionStorage` flag.
- **Max history size / automatic cleanup:** enforced identically on both the upsert and merge paths — `trimHistory()` deletes anything past the 8 most recently viewed, in the same transaction pattern as the rest of this codebase.

---

## 5. Recommendation Engine (`lib/recommendations.ts`)

All real Prisma queries, no ML, no external service:

| Function | Real signal |
|---|---|
| `getSimilarProducts` | Same category OR overlapping fragrance token |
| `getCoPurchasedProducts` | Real order co-occurrence (other products in the same orders) — powers both "Customers Also Bought" and "Frequently Bought Together" from one query, not two |
| `getTrendingProducts` | Real `OrderItem` quantity in the trailing 30 days; falls back to New Arrivals if there's no order history yet |
| `getNewArrivals` | `createdAt desc` |
| `getStaffPicks` | `Product.isFeatured` — the same real admin-curation flag Phase 13A's CMS already writes to |
| `getRecommendedForYou` | Blends `getCustomerPreferences`' real favorite categories + fragrance overlap, excludes already-purchased products, falls back to Trending for a brand-new account with no signal yet |

**Wired into Product Detail:** the existing "Related Products" query (same-category only) was upgraded in place to `getSimilarProducts` (adds the fragrance signal) — not duplicated. A genuinely new section, "Customers Also Bought," was added using `getCoPurchasedProducts` (real order data, a signal the page never had before). A shared `toFeaturedProduct` mapper replaces what were two near-identical inline mapping blocks.

---

## 6. Customer Preference Engine (`lib/preferences.ts`)

`getCustomerPreferences(customerId)` — computed on every read from real `Order`/`OrderItem`/`Wishlist` rows, **not** a new mutable "preferences" table, so it can never drift out of sync with what a customer actually did:

- Favorite categories/fragrances (frequency count across purchases + wishlist)
- Average budget (mean of real `PAID` order totals)
- Preferred sizes (frequency of `OrderItem.sizeAtPurchase`)
- Shopping frequency (median days between orders — steadier than a mean against one outlier order)
- Recently purchased products, wishlist-to-purchase conversion rate

Currently consumed internally by `getRecommendedForYou`. No standalone "Your Preferences" customer-facing page was built — the brief's Step 7 asks for an engine that tracks and stores these signals, not a named UI page, so none was added un-asked-for.

---

## 7. Smart Search

- **`lib/utils/fuzzy-search.ts`** — real, self-contained Levenshtein-distance typo tolerance (no external service). Substring match is tried first (fast path, handles partial match); word-level edit distance only runs on a miss, with the allowed distance scaled to query length so short queries don't fuzzy-match half the catalog.
- **Fields matched:** name, brand, category name, fragrance notes, and SKU (exact substring) — previously name only. `Product.brand`/`ProductVariant.sku` were already real columns; `shop`/`collections` pages now pass them through to `ProductGrid`.
- **Search suggestions:** a live dropdown of the top 6 name matches while typing (existing client-side product list, no extra request).
- **Recent searches:** localStorage, same honest pattern as Recently Viewed, capped at 6.
- **Popular searches:** `actions/search.ts` — `logSearch` (debounced 700ms after the shopper stops typing, logged for guests and logged-in customers alike since it's a cross-shopper aggregate) and `getPopularSearches` (real `groupBy` count, only ever exposes the term + count, never who searched it).

---

## 8. Smart Filters

Availability/price/category/fragrance/newest/best-selling sorts were already real (Phase 7). Added this pass: **Rating filter** (4★+/3★+, using each product's real average from approved reviews) and **Discount filter** (10/20/30/40%+ off, using the same `calculateDiscountPercent` every price tag already calls — only offers a threshold the catalog can actually satisfy, same "no chip with nothing behind it" rule the existing filters follow). **Filter count** now shows next to "Clear all" (existing).

---

## 9. Personalized Homepage

One new adaptive section (`components/storefront/personalized-section.tsx`, purely presentational — all the personalization decision-making happens server-side in `app/(storefront)/page.tsx`), inserted after the existing Featured Products section:

- **Logged-in with real browsing history:** "Continue Shopping" — their actual `RecentlyViewedItem` rows.
- **Logged-in with no history yet:** "Recommended for You" — `getRecommendedForYou`.
- **Guest:** "Trending Now" — a sensible, real default that requires no account.
- **Always shown underneath, for guests and logged-in alike:** "New Arrivals."

This section is not gated through the existing `HomepageSection`/`showSection()` CMS mechanism — that system curates static content blocks an admin explicitly configured (hero, featured, brand story); this is new, always-on functionality the admin was never asked to toggle. Noted as a future extension point (§13) if admin control over it becomes a real requirement.

---

## 10. Build Verification

- `npx tsc --noEmit` — clean, zero errors, on both passes (before and after the layout fix in §1).
- `npm run build` — clean production build, all 46 routes compiled.
- **The static-generation regression (§1) was caught by comparing the build's route table before and after** — `/about`, `/faq`, `/journal`, `/login`, `/privacy`, `/reset-password`, `/returns`, `/shipping`, `/signup`, `/terms` had all silently flipped from `○` (static) to `ƒ` (dynamic) after the first version of the root layout change; after the fix, all ten are back to `○`, matching the pre-14A baseline exactly.
- Live dev server: `/`, `/shop`, `/cart`, `/products/muv-noir`, `/collections/home-care`, `/about` all return **200**; `/admin/customers`, `/admin/orders`, `/admin/inventory`, `/admin/media`, `/admin/settings` all still return **307** unauthenticated — no admin regression from this phase's storefront-focused work.
- **Same recurring blocker as Phases 13A/13B:** the two new tables required regenerating the Prisma client, which needed the dev server (port 3000) stopped first. Paused and confirmed with you before touching the process both times this phase needed it, then restarted `npm run dev` afterward exactly as it was.

---

## 11. Security Review

- `recordProductView`, `getRecentlyViewed`, and `mergeGuestRecentlyViewed` all call `requireCustomer()` — a guest calling any of them gets a normal `{success:false}` response, never an exception that could leak state; the UI simply ignores the failure (fire-and-forget), same pattern `addToWishlist` already established.
- `logSearch`/`getPopularSearches` never expose which customer searched a term — only the aggregate term + count.
- No recommendation function ever queries or returns another customer's personal data — `getRecommendedForYou`/`getCustomerPreferences` both take a `customerId` the caller must already have legitimately resolved from their own session (same pattern as every existing customer-scoped action in this codebase).
- Nothing in this phase touches `lib/auth.ts`, `lib/rbac.ts`, or `middleware.ts`.

---

## 12. Performance Review

- Server Components first throughout — every recommendation/preference function is a plain server-side Prisma call; the only new Client Components are `ProductGrid`'s search/filter interactivity (already existed, extended) and the two small, inert sync/action wrappers (`RecentlyViewedSync`, the print/adjust-style modals from prior phases aren't touched here).
- No heavy library added — typo tolerance is ~30 lines of hand-written Levenshtein, not a search-as-a-service SDK.
- The homepage's new personalized queries run inside the page's existing `Promise.all` alongside its other real queries — not a second waterfall.
- **The one real performance issue this phase produced was caught and fixed before shipping** — see §1/§10's static-generation regression.

---

## 13. Known Limitations

- Smart Search's fuzzy matching runs client-side over the already-loaded product list — real and honest at this catalog's actual scale (tens of SKUs, same assumption Phase 13B's Inventory page made), but would need a server-side/indexed approach at a materially larger catalog size.
- The personalized homepage rail is not admin-toggleable through the existing Homepage CMS — it's new, always-on functionality, not one of the CMS's curated `HomepageSection` keys.
- `getCustomerPreferences` has no dedicated customer-facing UI — it's consumed internally by the recommendation engine only, per §6's reasoning.
- "Seasonal Picks" and "Wishlist Picks" (named in the brief's Step 6 example list) were not built as separate rails — no real seasonal-tagging concept exists in the schema, and "Wishlist Picks" would just re-display the customer's own wishlist (already fully real and browsable at `/account/wishlist` since Phase 12A), so a homepage rail for it would be a duplicate surface rather than new value.
- Popular/recent searches only surface product-name-based suggestions; no fielded search operators (`sku:`, `brand:`) were added — out of scope for "no external AI service, use existing Prisma data."

---

## 14. Future AI Extension Points

- Wire "Similar Products"/"Customers Also Bought" into `/shop` and `/collections` (currently Product Detail-only).
- Make the personalized homepage rail a real, admin-toggleable `HomepageSection` entry.
- Surface `getCustomerPreferences` on the customer account page as a genuine "Your Shopping Profile" view.
- A real seasonal/occasion tagging system on `Product`, if "Seasonal Picks" becomes a real requirement rather than a placeholder label.
- Server-side/indexed search (e.g., Postgres full-text or `pg_trgm`) if the catalog grows past the scale client-side fuzzy matching stays honest at.

---

## 15. Architecture Compliance

- Zero customer-facing frozen phases rebuilt — every touch to Homepage/Shop/Collections/Product Detail is a new, additive section or an in-place upgrade of an existing query to a richer real signal, never a rewrite of what was already there.
- Zero authentication/RBAC logic modified.
- Zero duplicated business logic — "Customers Also Bought" and "Frequently Bought Together" share one query; the FeaturedProduct-shaping logic is a single reusable function per file rather than copy-pasted per rail.
- Both schema changes are additive; no existing column was altered or dropped.
- The one real regression this phase produced (root-layout `auth()` call making the whole site dynamic) was caught by this phase's own Build Verification step, fixed, and documented here rather than shipped silently — exactly the discipline "audit before coding, verify before reporting" is meant to enforce.
