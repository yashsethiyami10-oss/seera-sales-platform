> ⚠️ **SUPERSEDED — NOT CURRENT.** This draft was never approved. It has been fully split and replaced by
> `PHASE_4A_PRODUCT_STRATEGY.md` (approved, frozen) and `PHASE_4B_INFORMATION_ARCHITECTURE.md` (draft, pending
> approval), which together cover everything below in more depth. Kept here for historical reference only —
> do not treat this file as a source of truth for any future phase.

# MUV™ — Phase 4: Product Strategy & Information Architecture™ *(archived draft)*
### Version 1.0 · Status: SUPERSEDED by Phase 4A + 4B
### Companion to `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` (all frozen, binding)

> This document defines the complete structural architecture of the MUV Digital Flagship — every page, every role, every relationship, every future capability, and what belongs in which version. No interfaces, no wireframes, no code. Where a capability already exists in the live system, it's marked **[LIVE]**; where a page is referenced elsewhere (footer links, navigation) but doesn't exist yet, it's marked **[V1 GAP]** — a real, honest inventory, not an idealized one, because a roadmap built on an inaccurate starting point is wrong from line one.

---

## 1. Product Vision

**What are we actually building?** Not a storefront with an admin panel bolted on. The MUV Digital Flagship is the single system of record for how MUV shows up to every buyer — a retail customer buying one bottle and a hotel procurement manager buying twenty litres draw from the *same* catalog, the *same* trust signals, the *same* brand (`PHASE_2` §2, `PHASE_3` §11). The website is the first surface this system has, not the only one it will ever have.

**Long-term vision:** Every future MUV surface — a mobile app, a distributor portal, a retail display, a marketing campaign — reads from and writes to this one system rather than maintaining its own copy of products, orders, or content. The Flagship is the source; everything else is a view onto it.

**Version 1 goals:** A complete, trustworthy, fast, CMS-editable consumer storefront across all five live categories, a working admin operations panel for products/orders/inventory, and a data model that already accommodates B2B (HSN, GST, bulk sizing) even though the *self-serve* B2B experience isn't fully built yet — a structured inquiry path is sufficient for V1 (§10, §13).

**Future expansion philosophy:** Expansion means adding *surfaces* (mobile, distributor portal) and *depth* (loyalty, subscriptions, AI) — never adding a second source of truth. Every future item in §11 is evaluated against one question: does this read from the existing system, or does it require a parallel one? Only the former is acceptable.

**Product success definition:** A customer or a procurement contact can complete their entire relevant task — discover, buy, reorder, or inquire, quote, and recur — without leaving the platform or needing a human, *except* exactly where `PHASE_2` deliberately designed one in (the highest-compliance institutional buyers, §10). Measured concretely via `PHASE_2` §14's metrics, plus the business-inquiry funnel this document formalizes in §10.

---

## 2. Complete Site Map

Organized hierarchically. Status tags: **[LIVE]** exists today · **[V1 GAP]** referenced (nav/footer link) or clearly required but not yet built · **[V1.1]** planned, not launch-blocking · **[FUTURE]** long-term.

```
/                                    Home [LIVE]
/shop                                Shop All / full catalog [V1 GAP — a shop-page component
                                      exists but nothing currently routes to it; the nav search
                                      icon links here today, to a 404]
/search                              Search results [V1 GAP — no dedicated route yet; see §8]
/collections/[category]              Category [LIVE]
/products/[slug]                     Product Detail [LIVE]
/cart                                Cart [LIVE]
/checkout                            Checkout [LIVE]
/checkout/success                    Order Success [LIVE]

/account/                            Account [LIVE — dashboard]
  /account/orders                    Order history [LIVE]
  /account/orders/[id]               Order detail / tracking [V1 GAP — verify depth against §10 tracking needs]
  /account/wishlist                  Wishlist [LIVE]
  /account/profile                   Profile [LIVE]
  /account/addresses                 Saved addresses [V1 GAP — Address model exists, no dedicated page]

/journal                             Blog index [LIVE]
/journal/[slug]                      Article [LIVE]

/about                                Brand story [V1 GAP — linked from footer, page doesn't exist]
/contact                             Contact [V1 GAP]
/support                             Support / help center [V1.1 — beyond a contact form]
/faq                                 FAQs [V1 GAP]
/shipping                            Shipping policy [V1 GAP]
/returns                             Returns policy [V1 GAP]
/privacy                             Privacy policy [V1 GAP]
/terms                               Terms of service [V1 GAP]

/login, /signup                      Authentication [LIVE]

/business                            Business landing (institutional entry point, `PHASE_2` §4) [V1.1]
  /business/wholesale                Wholesale pricing & self-serve bulk [V1.1]
  /business/distributor              Distributor program [FUTURE]
  /business/inquiry                  Business Inquiry form (§10) [V1 — minimum viable version required]

/admin/                              Admin dashboard [LIVE]
  /admin/products                    Product CRUD [LIVE]
  /admin/orders                      Order management [LIVE]
  /admin/customers                   Customer lookup/notes [V1 GAP — backend (`actions/customers.ts`) exists, no page]
  /admin/coupons                     Coupon management [V1 GAP — model + validation exist, no page]
  /admin/media                       Media library [V1 GAP — model + upload pipeline exist, no browsing page]
  /admin/cms                         Homepage sections, banners, newsletter content, announcements [V1 GAP — models exist, editable only at the database level today]
  /admin/blog                        Blog authoring [V1 GAP — models + actions exist, no admin UI]
  /admin/business-inquiries          Inquiry/quotation queue (§10) [V1.1]
  /admin/settings                    Site-wide settings [FUTURE]
  /admin/roles                       User role management [FUTURE — see §4]

System pages:
  /api/products, /api/products/[slug], /api/categories, /api/blog, /api/blog/[slug], /api/homepage  [LIVE — read APIs, the foundation §11's mobile-app support depends on]
  /api/auth/[...nextauth]            [LIVE]
  /api/webhooks/razorpay             [LIVE]
  /api/webhooks/shipping/[provider]  [LIVE]
  404 (not found)                    [V1 GAP — no custom not-found page yet; Next.js default in place]
  "Coming soon" state                [LIVE, as an in-page pattern on the Skin Care category — not a separate route, and shouldn't become one; see `PHASE_2` §6]
```

**Reading this site map correctly:** the [V1 GAP] items are not new ideas — they are the actual, current distance between what the platform can already do on the backend (models, actions) and what a customer or admin can actually reach through a URL. Closing that gap is what §13 defines as "Version 1."

---

## 3. Navigation Architecture

Building on the *philosophy* already frozen in `PHASE_2` §4 — this section defines the actual structure.

- **Primary Navigation:** Home Care / Fabric Care / Body Care / Personal Care / Car Care, with Skin Care shown and labeled upcoming rather than hidden (matches the live "Muving in soon" pattern).
- **Secondary Navigation:** In-category refinement only (size, fragrance, use-case) — not a second competing menu.
- **Footer:** Shop (categories) · Company (About, Journal, Contact) · Support (Track Order, Shipping, Returns, FAQs) · **Business** (Wholesale, Distributor, Business Inquiry — new column, V1.1, since institutional visitors look here, not in the primary nav, per `PHASE_2` §4).
- **Mobile Navigation:** Collapses to a persistent icon cluster (search, wishlist, cart, menu) in the reachable thumb zone — not a shrunk desktop nav.
- **Quick Actions:** Search, Wishlist, Cart, Account — always one tap away, everywhere.
- **Search Behaviour:** A first-class navigation method (§8), not a fallback — the nav search icon must route to `/search`, not `/shop`, once §2's gap is closed.
- **Business Navigation:** A dedicated, consistently-placed entry point (footer + a small persistent link) — procurement visitors don't browse the consumer nav looking for a bulk-ordering path (`PHASE_2` §4).
- **Account Navigation:** Dashboard / Orders / Wishlist / Addresses / Profile as a consistent sub-navigation within `/account/*`.
- **Admin Navigation:** Dashboard / Products / Orders / Customers / Coupons / Media / CMS / Blog / Business Inquiries / Settings — a sidebar, extending the live admin shell to cover the §2 gaps as they close.
- **Navigation Rules:** No link ever leads to a dead page. Breadcrumbs on every page more than one level deep. The category count shown in navigation always matches real category data — no phantom or placeholder entries.

---

## 4. User Roles

The live `Role` enum today has exactly **three** values: `ADMIN`, `STAFF`, `CUSTOMER`. The ten roles below are the target model — an intentional expansion, not a description of what exists now. Each is marked with its current status.

| Role | Status | Permissions |
|---|---|---|
| **Visitor** | Live (unauthenticated) | Browse catalog, search, view content, add to a session cart. Cannot save a persistent wishlist or view order history. Guest checkout must remain available without ever forcing an account (`PHASE_2` §9). |
| **Customer** | Live (`CUSTOMER`) | Everything Visitor can, plus: place orders, persistent wishlist, own order history, manage own addresses/profile, review products they've purchased. |
| **Returning Customer** | *Not a role — a behavioral segment* | Any Customer with ≥1 prior order. Not a permission level; a state the system recognizes for reorder-shortcut UX (`PHASE_2` §10) and future personalization. Modeling this as a role would be a mistake — it's data about a Customer, not a different set of permissions. |
| **Business Customer** | V1.1, new | Everything Customer can, plus: bulk pricing visibility, a business profile (company name, GST), access to the Bulk Order Flow (§10), order history suited to expense reporting. |
| **Distributor** | Future, new | Everything Business Customer can, plus: a portal scoped to *their own* downstream customers/territory — structurally different from a large Business Customer, who only ever manages their own orders. |
| **Admin** | Live (`ADMIN`) | Full access — products, orders, customers, CMS, settings, and (once §7's gap closes) role assignment. |
| **Content Manager** | V1.1, new, narrower than Admin | CMS, blog, media, homepage sections only. No order, customer, or financial access. Does not exist as a distinct role today — `STAFF` currently gets the same product/CMS access as `ADMIN` via `requireStaff()`, which is broader than a content-only role should be. |
| **Support Staff** | V1.1, new | Order lookup, customer notes, order status updates, refund/return initiation. No product/CMS edit access, no financial reporting. |
| **Warehouse Staff** | V1.1, new | Inventory/stock updates, fulfillment status, shipment creation. No pricing, CMS, or customer PII access. |
| **Super Admin** | Future, new | Everything Admin has, plus: role assignment, system settings, integration/API key management — separated from Admin so day-to-day operations never require the highest-privilege account. |

**On today's `STAFF` role:** it currently functions as one broad bucket covering what Content Manager, Support Staff, and Warehouse Staff will eventually split into. That split is a genuine least-privilege improvement, not a cosmetic rename — it means a content editor account can never accidentally touch financial data, and a warehouse account can never touch CMS copy.

---

## 5. Feature Inventory

### Version 1 (ship-required — live, or closing an existing [V1 GAP])

| Feature | Status |
|---|---|
| Product catalog + categories | Live |
| Product search (dedicated, ranked) | Partial — a substring filter exists inside category grids; no ranked `/search` page (§8) |
| Wishlist | Live |
| Reviews (display + submission) | Live |
| Cart + Checkout | Live |
| Order tracking | Partial — data model (`Shipment`, `ShipmentEvent`) exists; customer-facing tracking depth needs verification against `PHASE_2` §10 |
| Coupons | Partial — validated at checkout; no admin UI to create/manage them |
| Newsletter signup | Partial — presentational only; no real subscriber-capture backend yet |
| Blog / Journal | Live (public); no admin authoring UI |
| Media library | Live upload pipeline; no admin browsing UI |
| Order notification emails | Partial — `NotificationLog` model exists; provider wiring assumed, not verified in this pass |
| Homepage CMS (banners, sections, newsletter content, announcements) | Live models; database-only editing, no admin UI |
| Business Inquiry (minimum viable) | Not built — see §10; a structured form is a V1 requirement even before the full quotation flow exists |

### Version 1.1

Recently Viewed · Recommendations (rule-based, per `PHASE_1` §10) · Compare · Gift Cards · Business Customer role + bulk pricing · formalized Business Inquiry + Bulk Order Flow · Support ticketing · admin Customers/Coupons/Media/CMS/Blog pages · expanded admin roles (Content Manager, Support Staff, Warehouse Staff) · search autocomplete + synonyms · per-page SEO fields in CMS · email template CMS.

### Future

AI Search / AI Recommendations / AI Chat (seams already reserved, `PHASE_1` §10) · Subscriptions (auto-reorder) · Loyalty (non-gamified — see §11) · Referrals · Distributor role + portal · Quotation Flow · Marketplace (flagged, not committed — see §11) · Regional languages · Franchise / retail-display integration · Vendor portal · Knowledge library.

---

## 6. CMS Architecture

The target principle: **everything a customer reads should eventually be editable without a code deploy.** This section is the prioritized gap list for making that true — not a description of a finished system.

| Content | Model status | Admin UI status |
|---|---|---|
| Products | Live | Live — the most complete admin surface today |
| Categories | Live model | Not verified — likely gap |
| Homepage sections (visibility/order) | Live (`HomepageSection`) | None |
| Banners (hero) | Live (`Banner`) | None |
| Navigation menus | *No model* — hardcoded in the nav component | None — V1.1 target |
| Footer | *No model* — hardcoded in the footer component | None — V1.1 target |
| Policies (shipping, returns, privacy, terms) | *No model* | None — pages don't exist yet either (§2) |
| FAQs | *No model* | None |
| Media | Live (`MediaAsset`) | None |
| Promotions / Coupons | Live (`Coupon`) | None |
| Product videos | Live — `Product.videoUrls` | Live, as part of product editing |
| Standalone brand videos (`PHASE_3` §4) | *No model* | None — Future |
| Blog | Live (`BlogPost`, `BlogCategory`) | None |
| SEO metadata | Live at the code level (`lib/seo.ts`) | Not per-page editable yet — V1.1 |
| Emails | Assumed code-level templates | None — V1.1 |
| Announcements | Live (`AnnouncementBar`) | None |

**Why navigation and footer being hardcoded is acceptable debt, not a violation:** `PHASE_1` §11's CMS-ready rule is "no copy is hardcoded once its model exists." Neither has a model yet. The moment one is built, the hardcoded version becomes debt that must be paid down — not before.

---

## 7. Admin Architecture

| Area | Status |
|---|---|
| Dashboard | Live |
| Products | Live — full CRUD |
| Orders | Live |
| Inventory | Live — stock quantity, thresholds, and a full `StockHistory` audit trail per change |
| Customers | Gap — `actions/customers.ts` exists, no page |
| Coupons | Gap — model + checkout validation exist, no page |
| Media | Gap — upload pipeline exists, no browsing/library page |
| CMS | Gap — see §6 |
| Reports / Analytics | Gap — V1.1/Future |
| Settings | Gap — Future (tax defaults, shipping-provider config currently live only in environment variables, not admin-editable) |
| User Roles / Permissions | Gap — the `Role` enum exists; no admin UI to change a user's role today |
| Business Orders | Doesn't exist yet — depends on §10's Business Customer role |
| Support Tickets | Doesn't exist yet — no ticketing model |
| Notifications (admin-facing log view) | Gap — `NotificationLog` model exists as an outbound record; no admin view over it |

---

## 8. Search Architecture

**Today:** a client-side substring match inside the product grid (`p.name.toLowerCase().includes(...)`) — functional as a filter, but not a ranked search, and not backed by a dedicated results page.

**Target (V1):** a real `/search` route backed by `services/search-service.ts` (`PHASE_1` §2), running Postgres full-text/trigram search across product name, description, fragrance, and category — this is the concrete seam `PHASE_1` §10 already reserved for a future AI-backed upgrade, so building it correctly now costs nothing later.

- **Suggestions / Autocomplete:** V1.1 — as-you-type suggestions from product and category names.
- **Misspellings:** trigram similarity matching so "flor cleaner" still finds "floor cleaner."
- **Filters:** the same vocabulary as category pages (size, fragrance) — one filter language across the whole site, never a second one invented for search specifically.
- **Business Search:** not a separate index — bulk-size variants are surfaced prominently for the same query a consumer would run, addressing the Bulk Buyers persona (`PHASE_2` §2) through ranking/display bias rather than a parallel system.
- **Product Search vs. Category Search:** one search box serves both — typing a category name ("car care") should surface the category page itself as a top result, not force the visitor to separately know to browse instead of search.
- **Zero Results:** never a dead end — always offers the nearest adjacent category or trending products (`PHASE_2` §6, `PHASE_3` §1).
- **Synonyms:** a maintained map ("detergent" ↔ "washing liquid") — V1.1, since this is a content investment as much as a code one.
- **Ranking Philosophy:** curated/Featured first, then relevance, then recency — never price-ascending by default, consistent with `PHASE_2` §6's rejection of price-anchoring.

---

## 9. Content Architecture

- **Product → Category:** one product belongs to exactly one category today (a real, current constraint — a future multi-category or tagging model is a deliberate V1.1+ decision if merchandising needs it, not an assumed default).
- **Collections vs. Categories:** structurally different concepts that must not be conflated. Categories are taxonomic and permanent (Home Care, Fabric Care...). Collections (Featured Products, a future seasonal set) are curatorial and temporary — closer to a saved query or a tag set than a foreign key.
- **Articles ↔ Products:** a `BlogPost` can *reference* products in its body copy today, but there's no modeled relationship between them — a future join (so "how to use MUV Floor Cleaner" can formally link to that product, and the product page can surface related articles) is a V1.1 content-marketing enhancement, not a launch requirement.
- **Media as a shared pool:** a single uploaded `MediaAsset` can be referenced by a product's image array, a blog post's featured image, or a banner — already the live model, since Cloudinary URLs are the actual source of truth for display and `MediaAsset` is the admin-facing library/audit record on top of them.
- **FAQs:** unmodeled today. Before building, a real decision is needed: global FAQs (a standalone `/faq` page) versus FAQs scoped to a specific category or product (e.g., "is this safe for coloured fabric," shown directly on that product page). This scoping decision changes the data shape and should be made deliberately, not defaulted.
- **Landing Pages / SEO Pages:** unmodeled. Envisioned (Future) as CMS-composed pages reusing `PHASE_1` §11's `SectionRenderer` concept — assembling existing block types (Banner, ProductGrid, TrustCards) into a new URL without new code, rather than a one-off template per campaign.
- **Brands:** MUV sells one brand today. A `Brand` entity isn't needed for V1 and shouldn't be built until (if ever) MUV carries a second brand or third-party products — see the Marketplace caution in §11.

---

## 10. Business Architecture

Structural extension of the personas already defined in `PHASE_2` §2.

- **Consumer Sales** — today's model. Customer role, self-serve cart/checkout, single-unit to small-pack purchasing. **[Live]**
- **Wholesale** — Business Customer role (§4). Self-serve checkout retained, with bulk pricing tiers and GST-aware invoicing surfaced. **[V1.1]**
- **Distributor** — extends Wholesale with a portal for managing their own downstream customers/territory. **[Future]**
- **Institutional** (Hotels, Restaurants, Offices, Car Wash — can self-serve; Hospitals, large Laundry contracts — need human assistance): per `PHASE_2` §2, these split by procurement complexity, not by a single "B2B" bucket. The self-serve-capable group uses the same Business Customer checkout as Wholesale; the highest-compliance group routes to the Business Inquiry Flow instead of instant checkout.

**Business Inquiry Flow [V1 minimum, formalized in V1.1]:** a structured form (company name, GST, need description, estimated volume) creates an internal `BusinessInquiry` record — not yet in the schema — routed to Admin/Support Staff for human follow-up. This is a **lead-capture flow, not a transaction**: its success metric is "qualified inquiry created," tracked separately from consumer checkout completion (`PHASE_2` §14).

**Quotation Flow [V1.1/Future]:** a formal extension — an admin generates a quote (line items, bulk pricing, a validity window) attached to a `BusinessInquiry`; the business contact accepts it, which auto-generates a real `Order`. This is the bridge between the human-assisted and self-serve worlds identified in `PHASE_2` §3's parallel journey.

**Bulk Order Flow [V1.1]:** for personas that *can* self-serve (Hotels, Car Wash, Bulk Buyers) — a quantity-first ordering entry point, distinct from the standard one-at-a-time Add to Cart, addressing the exact friction named in `PHASE_2`'s Bulk Buyers persona ("most sites penalize bulk quantity rather than rewarding it").

---

## 11. Future Expansion

Each item states *how the current architecture already supports it* — the test every future proposal must pass (§14, §15).

- **Mobile App:** supported today by the live `/api/products`, `/api/categories`, `/api/blog`, `/api/homepage` read routes — a mobile app consumes the same `services/` layer the website's Server Components use, not a rebuilt parallel backend.
- **AI Assistant / AI Search / AI Recommendations:** `PHASE_1` §10 already reserved the exact seams (`search-service.ts`, `recommendation-service.ts`, `/api/chat`). These are additions behind an existing interface, not a re-architecture.
- **Subscriptions (auto-reorder):** structurally, a subscription is "a saved cart plus a recurrence rule that creates a new Order automatically" — it reuses the existing checkout/payment/`Order` model rather than replacing it, and directly realizes the reorder-reminder principle already named in `PHASE_2` §10 and `PHASE_3` §1.
- **Loyalty:** must be designed consistent with `PHASE_3`'s explicit rejection of gamification. If built, it expresses as consistent pricing or priority service for verified repeat/business customers — never points, streaks, or badges.
- **Referrals:** additive — a referral-code field/relation on the existing `Customer` model, not a restructuring.
- **Marketplace:** the highest-risk item here. Requires a new `Brand`/`Seller` entity, and `PHASE_3` §7's claims/certification rules would need to extend to third-party sellers. Flagged explicitly as needing its own dedicated strategy pass before it is started — not something to bolt on inside another phase.
- **International:** supported structurally by the existing `Order.placeOfSupply`/tax fields and a shipping-provider abstraction already built provider-agnostic (`SHIPPING_PROVIDER` config, per `PHASE_1`). Expansion means adding providers/tax logic behind the same interfaces, not rebuilding checkout.
- **Regional Languages:** supported specifically *because* §6 insists customer-facing copy live in the CMS layer rather than hardcoded JSX — a page whose text lives in the database can gain a locale dimension; a page whose text is hardcoded cannot without a rewrite. This is a concrete reason §6's discipline matters beyond convenience.
- **Franchise / Retail Displays:** consume the same product/media data via the existing (or a future public) read API for signage/catalog display — no separate content system.
- **Distributor Portal / Vendor Portal:** both are new role-scoped *views* (§4) over existing order/product data — "a distributor portal" is orders and customers filtered to one distributor's territory, not a new data model.
- **Knowledge Library:** an extension of the existing Blog/Article model (§9) with a support-oriented taxonomy instead of an editorial one — reuses `MediaAsset` and the same CMS mechanism, not a new one.

---

## 12. Information Relationships

The live relationships, plus where target additions (§4, §10) attach.

- **Category → Product:** one-to-many.
- **Product → ProductVariant → Inventory → StockHistory:** a variant has one inventory record; every stock change is logged with a reason — a full audit trail, not just a current number.
- **Product ↔ Review ↔ Customer:** a review always ties to both the product and the customer who wrote it; one review per customer per product.
- **Customer → Order → OrderItem → ProductVariant:** deliberately, an `OrderItem` *snapshots* the name/size/price at the moment of purchase, separate from the live `Product`/`ProductVariant` record. This is intentional: order history must never silently change because a product was later renamed or repriced.
- **Order → Shipment → ShipmentEvent:** one shipment per order, many tracking events per shipment.
- **Order → PaymentAttempt:** one-to-many, supporting retried or failed payment attempts against a single order.
- **Customer → Wishlist → Product/ProductVariant:** customer-scoped, many-to-many via join.
- **Customer → Address, Order → Address:** a customer has many saved addresses; an order snapshots *which one* it shipped to (same "never retroactively change history" principle as OrderItem).
- **MediaAsset:** a shared pool referenced by Product images/videos, BlogPost featured images, and Banners — loosely coupled by URL rather than strict foreign key, since Cloudinary is the actual source of truth for the asset itself.
- **BlogCategory → BlogPost ← User (author):** standard content-ownership relationship.
- **Coupon → Order:** many orders can use one coupon; `usedCount` tracks consumption.
- **HomepageSection:** not foreign-keyed to page content — a standalone visibility/ordering control that each homepage component checks by key.
- **User → Role:** currently a flat enum; §4's target model needs this to become a richer permission structure (role + a business-profile relation) rather than an ever-growing enum.
- **Target — BusinessInquiry → Customer (optional) → Quotation → Order:** an inquiry can originate from a not-yet-registered lead; a quotation attaches structured pricing to it; acceptance converts it into a real Order, reusing the existing order pipeline rather than inventing a parallel one.
- **Search does not own data.** It is a read index over Product/Category/BlogPost, kept in sync via the same `revalidateTag` mechanism already used for caching (`PHASE_1` §9) — never a second, independently-maintained copy of product data.
- **Admin and CMS are not separate data.** They are privileged read/write surfaces over the *same* tables the storefront reads. There is exactly one `Product` table, viewed differently by role — never a duplicated "draft" vs. "live" copy unless that's an explicit, deliberate future decision (a real CMS pattern, but a non-goal until named as one).

---

## 13. Version Roadmap

**Version 1** — everything marked [Live] across this document, plus closing every [V1 GAP]: the `/shop` route, a real `/search` page and service, admin Customers/Coupons/Media/CMS/Blog pages, the policy and info pages (about, contact, FAQ, shipping, returns, privacy, terms), a custom 404, a real newsletter-capture backend, and at minimum a working Business Inquiry form. No self-serve B2B checkout yet.

**Version 1.1** — Business Customer role + bulk pricing, formalized Business Inquiry + Bulk Order Flow, Recently Viewed, rule-based Recommendations, Compare, Gift Cards, Support ticketing, expanded admin roles (Content Manager, Support Staff, Warehouse Staff), search autocomplete/synonyms, per-page SEO fields, email template CMS.

**Version 2** — Distributor role + portal, Quotation Flow, Subscriptions/auto-reorder, non-gamified Loyalty, Referrals, real AI Search/Recommendations, regional language support, the Landing Page/SectionRenderer composer.

**Long-term Ecosystem** — Mobile App, AI Assistant/Chat, Franchise/retail-display integration, Vendor/Marketplace (only if deliberately pursued per §11's caution), international expansion.

**What explicitly does *not* belong in Version 1:** Loyalty, Subscriptions, Distributor Portal, AI features, Marketplace. Naming these out loud here is the point — a roadmap that only says what's in V1 invites every one of these to quietly sneak back in as "just one small addition."

---

## 14. Product Principles

- **One Source of Truth** — every surface (web today; mobile, distributor portal, retail displays tomorrow) reads the same Product/Category/Order data through the same `services/` layer (`PHASE_1` §2). Never a second copy that can drift.
- **No Duplicated Content** — a fact is written once and referenced everywhere it appears, never copy-pasted across pages/templates where it can silently go stale.
- **Everything Editable** — hardcoded customer-facing copy is accepted short-term debt (§6), never a permanent state for content that changes.
- **Scalable First** — every list, table, and query is designed assuming hundreds-to-thousands of rows, because 500+ products and a growing role/category set is the stated target (`PHASE_1`), not a hypothetical.
- **Performance First** — restated here as a *product* principle, not only an engineering one (`PHASE_1` §9): speed is itself a trust signal (`PHASE_2` §11, `PHASE_3` §1).
- **Accessibility First** — present from the first architecture decision, not audited in afterward (`PHASE_1` §12, `PHASE_2` §12, `PHASE_3`'s inclusive design).
- **SEO Friendly** — every page is a real, indexable URL with real metadata; content lives in the CMS specifically so it can be found, not merely displayed.
- **CMS First** — when choosing between hardcoding a new page/section and modeling it as CMS-editable, model it as CMS-editable. This is the discipline that makes §6 true over time instead of aspirational.
- **Customer First** — every architecture decision is checked against `PHASE_2`'s actual personas and `PHASE_3`'s Experience Checklist; a technically elegant solution serving no real persona need gets revisited.
- **Business Ready** — B2B (§10) is never a bolt-on afterthought. Even before Business Customer/Distributor roles exist, nothing in V1 should make them structurally harder to add — keeping `hsnCode`/`gstRate` as first-class Product fields today, rather than retrofitting them later, is the working example of this principle already in practice.
- **Future Proof** — every §11 expansion item is supportable through *addition* (new roles, new services, new CMS types), never through rewriting what already exists. This is the test every new feature proposal must pass.

---

## 15. Approval Checklist

Every future phase, before implementation begins, must be able to answer yes to all of the following:

- [ ] Does this fit an existing entity/relationship (§12), or has a genuinely new one been modeled deliberately — not improvised mid-build?
- [ ] Does this belong in the Site Map (§2) as a real, reachable URL, or is it a state within a page that already exists?
- [ ] Which user role(s) (§4) does this serve, and does it respect the least-privilege boundary between them?
- [ ] Is this Version 1, 1.1, 2, or Long-term (§13) — and if it's being proposed for V1, does it displace something more important?
- [ ] Is the content behind this CMS-editable (§6), or is hardcoding here accepted, *temporary* debt with a clear path to close it?
- [ ] Does this preserve One Source of Truth (§14), or does it introduce a second copy of something that already exists?
- [ ] Does this remain compatible with `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, and `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`?
- [ ] Does this serve a real, named persona (`PHASE_2` §2) and a real business model (§10) — not a hypothetical one?
- [ ] Can this be built as an addition to what exists, or does it require rewriting something already working (§11's future-proof test)?
- [ ] Has this been checked against feature creep for its assigned version (§13)?

---

## Deliverables Checklist

1. ✅ Product Vision — §1
2. ✅ Complete Site Map — §2
3. ✅ Navigation Architecture — §3
4. ✅ User Roles — §4
5. ✅ Feature Inventory (V1 / V1.1 / Future) — §5
6. ✅ CMS Architecture — §6
7. ✅ Admin Architecture — §7
8. ✅ Search Architecture — §8
9. ✅ Content Architecture — §9
10. ✅ Business Architecture — §10
11. ✅ Future Expansion — §11
12. ✅ Information Relationships — §12
13. ✅ Version Roadmap — §13
14. ✅ Product Principles — §14
15. ✅ Approval Checklist — §15

**No interfaces. No wireframes. No components. No code. No colours or typography. This phase is product architecture only — frozen pending approval.**
