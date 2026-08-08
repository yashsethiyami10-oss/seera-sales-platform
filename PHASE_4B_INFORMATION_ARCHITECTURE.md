# MUV™ — Phase 4B: Information Architecture
### Version 1.0 · Status: DRAFT — awaiting approval
### Companion to `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, `PHASE_4A_PRODUCT_STRATEGY.md` (all frozen, binding)

> This document defines *how information is organized* — the structural blueprint every future screen must fit into. It does not define design, UI, or code. Status tags carry forward from prior work: **[LIVE]** exists today · **[GAP]** referenced or clearly required but not yet built · **[V1.1]** / **[FUTURE]** per `PHASE_4A` §4's version boundary.

---

## 1. Information Architecture Philosophy

**How users naturally think:** By task, not by taxonomy. A customer doesn't think "I need a Car Care > Exterior > Wash product" — they think "I need to clean my car." Information architecture's job is to let task-language reach the right destination as directly as possible, with the database's internal structure staying invisible to the person using it.

**How information should be organized:** Hierarchically, but never deeper than the customer's actual mental model requires. Shopping is a two-level structure — category, then product — with search running orthogonal to that hierarchy entirely, as a shortcut for anyone who already knows what they want and shouldn't have to climb a tree to get it.

**Why navigation should feel effortless:** Every decision point — which menu, which link, which filter — is a small tax on a visitor's attention. IA's job is to minimize the *number* of decisions between "I have a need" and "I found what serves it," not to expose everything that technically exists. A comprehensive sitemap and an effortless one are not the same goal, and where they conflict, effortless wins.

**How IA supports Keep Muving™:** IA is the literal machinery that makes `PHASE_2`/`PHASE_3`'s "never a stall" principle possible or impossible. A dead-end link, a zero-result search with no next step, a page unreachable except by typing its exact URL — these aren't content failures, they're structural ones. Good IA is what "the customer is always moving forward" looks like as a system rather than a feeling.

---

## 2. Complete Sitemap

Organized by zone, each entry tagged with real status.

### Storefront (Shopping)
```
/                                Home [LIVE]
/shop                            All products [GAP — component exists, route does not]
/search                          Search results [GAP — see §5]
/collections/[category]          Category [LIVE]
  (subcategory)                  Not modeled today — Product→Category is single-level (`PHASE_4` §9);
                                  a subcategory tier is a future taxonomy expansion, not a current page
/products/[slug]                 Product Detail [LIVE]
/cart                             [LIVE]
/checkout                         [LIVE]
/checkout/success                 [LIVE]
/account/orders/[id]              Order tracking [GAP — verify against `PHASE_2` §10]
```
*Collections (curated sets like Featured Products) are content compositions on the Homepage today, not separate routes — see §6 on why that distinction matters. A dedicated `/collections/featured`-style landing page is a natural, low-risk future addition using the same category-page pattern.*

### Account
```
/account                          Dashboard [LIVE]
/account/orders                   Order history [LIVE]
/account/wishlist                 Wishlist [LIVE]
/account/profile                  Profile [LIVE]
/account/addresses                Saved addresses [GAP — Address model exists, no page]
```

### Content & Trust
```
/journal                          Blog index [LIVE]
/journal/[slug]                   Article [LIVE]
/about                             [GAP]
/contact                           [GAP]
/support                          Help center [V1.1]
/faq                               [GAP]
/shipping                          [GAP]
/returns                           [GAP]
/privacy                           [GAP]
/terms                             [GAP]
```

### Business
```
/business                         Landing / entry point [V1.1, minimum form required for V1 per `PHASE_4A` §4]
/business/wholesale                [V1.1]
/business/distributor              [FUTURE]
/business/inquiry                 Structured inquiry form [V1 — see `PHASE_4` §10]
```

### System & Auth
```
/login, /signup                   [LIVE]
/404 (not found)                  [GAP — no custom page; framework default in place]
"Coming soon" state               [LIVE — an in-page state on Skin Care, not a route, and should stay that way]
/api/products, /api/products/[slug], /api/categories, /api/blog, /api/blog/[slug], /api/homepage   [LIVE — read APIs]
/api/auth/[...nextauth]           [LIVE]
/api/webhooks/razorpay, /api/webhooks/shipping/[provider]   [LIVE]
```

### Admin (staff-only)
```
/admin                             Dashboard [LIVE]
/admin/products                    [LIVE]
/admin/orders                      [LIVE]
/admin/customers                   [GAP]
/admin/coupons                     [GAP]
/admin/media                       [GAP]
/admin/cms                        Homepage sections, banners, announcements [GAP]
/admin/blog                        [GAP]
/admin/business-inquiries          [V1.1]
/admin/settings                    [FUTURE]
```

---

## 3. Navigation Architecture

**Hierarchy levels:**
- **L0 — Global chrome:** present on every page — primary nav, footer, quick actions (search/wishlist/cart/account).
- **L1 — Primary category navigation:** the five (soon six) verticals — the main wayfinding layer.
- **L2 — In-page refinement:** filters within a category, tabs within a product page — never a second competing navigation system, always scoped to the page it's on.
- **L3 — Contextual cross-links:** related products, related articles, cross-category suggestions — supplementary to, never a replacement for, L0/L1.

**Primary Navigation:** Home Care / Fabric Care / Body Care / Personal Care / Car Care, Skin Care shown labeled upcoming.
**Secondary Navigation:** In-category refinement only (size, fragrance, use-case).
**Footer:** Shop · Company · Support · **Business** (V1.1 addition, per `PHASE_4` §3) — four columns, no more; a footer that tries to contain the whole sitemap stops being navigation and becomes a dumping ground.
**Quick Links:** Search, Wishlist, Cart, Account — persistent, one tap away, everywhere.
**Breadcrumbs:** Shop / Category / Product on every page more than one level deep — the primary defense against feeling lost in a five-vertical catalog.
**Mobile Navigation:** A single reachable control cluster, not a shrunk desktop nav.
**Business Navigation:** A consistently-placed, separate entry point (footer minimum) — institutional visitors don't look in the consumer nav for it (`PHASE_2` §4).
**Account Navigation:** Dashboard / Orders / Wishlist / Addresses / Profile, consistent across `/account/*`.
**Admin Navigation:** Dashboard / Products / Orders / Customers / Coupons / Media / CMS / Blog / Business Inquiries / Settings.

**Navigation Principles:** No link ever leads to a dead page. Every page reachable from global navigation is reachable in the *same* way from every other page — navigation never rearranges itself based on where the visitor came from. The number of items in L1 stays scannable at a glance (today: five, soon six — a seventh vertical should prompt a genuine IA review, not a silent seventh tab).

---

## 4. User Flow Architecture

Structural sequences — *what steps exist and where they branch*. The emotional and psychological dimension of each of these is `PHASE_2`'s territory (§3) and isn't repeated here.

- **Visitor:** Land → Orient (Home / Category / Search) → Evaluate (Product) → **branches:** add to cart (continues toward Customer flow) or leave.
- **Customer (first purchase):** Visitor flow → Cart → Checkout (guest or register) → Confirmation → role becomes Customer.
- **Returning Customer:** Land (recognized if authenticated) → **branches:** Reorder shortcut from Account, or a fresh browse → Cart → Checkout (pre-filled) → Confirmation.
- **Business Customer:** Land → Business entry point (§2) → **branches:** Inquiry form, or (V1.1) self-serve bulk cart → Checkout or Quotation acceptance → Confirmation.
- **Guest Checkout:** Cart → Checkout (no login required) → shipping/payment entered fresh → Confirmation → **optional, post-purchase only:** invited to create an account. Never gated before this point (`PHASE_2` §9).
- **Logged-in Checkout:** Cart → Checkout (address/payment pre-filled) → Confirmation.
- **Business Inquiry:** Business landing → Inquiry form → Submission confirmation → routed internally to Admin/Support → human follow-up → **branches:** Quotation issued → accepted → Order, or inquiry closed without conversion.
- **Support:** Any page → Support entry point (footer, always present) → **branches:** FAQ self-serve resolves it, or a Contact/ticket is filed → Resolution.
- **Search:** Any page → query entered → **branches:** Results (grouped, §5) lead to Product/Category, or Zero Results offers adjacent suggestions rather than stopping.
- **Reorder:** Account → Orders → select a past order → Reorder action → Cart pre-filled with that order's items → Checkout.

**The structural rule every flow above shares:** every branch has a defined next step. None of these flows is allowed to terminate in an undefined state — that would be a stall, and per `PHASE_2`/`PHASE_3`, a stall is the one outcome this product is not allowed to produce.

---

## 5. Search Information Architecture

**Search behaviour:** One search box, one query, results grouped by content type rather than run as separate searches per type. A visitor shouldn't need to know in advance whether they're looking for a product, a category, or an article.

**Content types indexed:** Products (name, description, fragrance) — primary weight. Categories (name) — secondary, since a category-name query like "car care" should surface the category page itself as a top result, not force a detour through browsing. Articles — tertiary, informational intent. Business pages — included specifically so an institutional visitor typing "bulk" or "wholesale" lands somewhere useful rather than in generic product results.

**Search priorities (ranking order for a typical query):** Product name and fragrance/use-case terms first (highest commercial intent) → category name → article content. Never price-ascending as a ranking factor (`PHASE_2` §6).

**Autocomplete / Suggestions:** V1.1 — as-you-type suggestions from product and category names, the two highest-intent content types.
**Synonyms:** A maintained map ("detergent" ↔ "washing liquid," "floor cleaner" ↔ "surface cleaner") — V1.1, a content investment as much as a technical one.
**Misspellings:** Trigram/fuzzy matching so a typo doesn't produce a false zero-result.
**Filters:** The same vocabulary as category-page filters (§6, §7) — never a second filter language invented specifically for search.
**Zero Results:** Never a dead end — always offers the nearest adjacent category or trending products (`PHASE_2` §6).

---

## 6. Content Architecture

- **Product ↔ Category:** one product, one category today (a real current constraint, not an oversight — `PHASE_4` §9).
- **Collections vs. Categories:** Categories are taxonomic and permanent; Collections (Featured Products, a future seasonal set) are curatorial and temporary — closer to a saved query than a structural relationship. Conflating the two would make the taxonomy unstable as merchandising needs change.
- **Variants:** belong to a Product, not independently discoverable — a variant is never a standalone page, only a selectable state within its product's page.
- **Articles ↔ Products:** referenced informally today, no modeled relationship yet — a V1.1 addition once content marketing needs a formal "this article discusses this product" link (§9).
- **FAQs:** unmodeled — requires a real decision before building: global (a standalone `/faq` page) versus scoped to a category/product. This shapes the data model and should be decided deliberately (`PHASE_4` §9).
- **Policies:** standalone, static-ish content (§2) — low change frequency, but still belongs in the CMS layer eventually per `PHASE_4` §6's "everything editable" principle, not hardcoded permanently.
- **Media:** a shared pool referenced by Products, Articles, and Banners alike — one asset, many places it can appear (`PHASE_4` §9, §12).
- **Homepage:** not a content type itself — a *composition* of sections (Hero, Categories, Featured Products, Why Choose MUV), each independently sourced from its own content type. The homepage's job in the sitemap is orchestration, not authorship.
- **Landing Pages / SEO Pages:** unmodeled, envisioned (Future) as compositions of the same section types the homepage already uses (`PHASE_4` §9's SectionRenderer concept) — a new URL assembled from existing blocks, not a one-off template.
- **Business Pages:** structurally closer to Landing Pages (composed, trust-and-conversion-focused) than to Product/Category pages (catalog-focused) — worth keeping that distinction in mind so a future Business landing page doesn't get forced into the product-page template it doesn't actually fit.

---

## 7. URL Architecture

**Philosophy:** URLs are addresses a human should be able to read, guess, and trust — not database keys with a slug attached as decoration.

**Live pattern (already correct, carried forward as the standard):** `/collections/[category-slug]`, `/products/[product-slug]` — slugs, never database IDs, because `muv.co.in/products/floor-cleaner-velvet-mist` is both more trustworthy to click and more indexable than `muv.co.in/products/cmr8x92k...`.

**Target patterns:**
```
/shop                              flat, no ID
/search?q=...                      query as parameter, not path segment
/collections/[category]            existing pattern, unchanged
/products/[slug]                   existing pattern, unchanged
/journal, /journal/[slug]          existing pattern, unchanged
/about, /contact, /faq, /shipping, /returns, /privacy, /terms   flat, single segment, human-readable
/business, /business/wholesale, /business/distributor, /business/inquiry   one predictable root
/account/*, /admin/*               existing patterns, unchanged
```

**Naming rules:**
1. All lowercase, hyphen-separated — matches the live convention (`home-care`, `body-wash-crimson-veil`).
2. A slug is stable once published. Renaming a product does not require renaming its slug — a deliberate decoupling that protects bookmarks and SEO equity from routine content edits.
3. No database IDs in a customer-facing URL where a slug will do.
4. Shopping URLs stay shallow — two segments maximum (`/collections/[category]`, `/products/[slug]`). No deep `/shop/category/subcategory/product` chains; this matches the current flat Product→Category relationship (§6) and stays easier to reason about even if a subcategory tier is added later (it would become a filter within `/collections/[category]`, not a new URL segment, unless a future decision explicitly says otherwise).
5. Query parameters carry *filter state* (`?size=1L&fragrance=lavender`), never identity. A product or category always has one clean canonical URL without required query parameters — necessary for both sharing and indexing.

---

## 8. Metadata Architecture

- **Titles:** `{Page or Product Name} — {Category, where relevant} | MUV` — concise and unique per page. Never a generic template that reduces every page to the same phrase ("Welcome to our website | MUV" tells a search engine and a human nothing).
- **Descriptions:** Derived from real content — a product's actual short description, never fabricated boilerplate. The same Honesty discipline `PHASE_3` §7 applies to on-page claims applies here to how the page describes itself before it's even clicked.
- **Structured Data (JSON-LD):** Product (price, availability, rating), Organization, and Breadcrumb schema are already live. Article schema (blog) and FAQ schema are natural additions once those pages exist (§2).
- **Open Graph:** Every shareable page (product, article, category) carries a real image — the actual product photo, never a generic placeholder — so a shared link never produces a broken or embarrassing preview.
- **Canonical URLs:** Declared on every page, which matters specifically once query-parameter filtering (§7) exists — a filtered view of a category page must point its canonical back at the clean, unfiltered URL to avoid duplicate-content confusion.
- **SEO Hierarchy:** Category and Product pages carry the primary commercial-intent SEO weight. Blog/Journal carries secondary, top-of-funnel informational weight. Static trust pages (About, FAQ) carry brand and trust SEO weight rather than conversion weight — each tier is optimized for what it's actually for, not treated identically.
- **Social Sharing:** The same anti-clickbait discipline as everywhere else (`PHASE_3` §10) — an Open Graph title that overpromises to earn a click is exactly the pattern this brand has already ruled out.
- **Future AI Search Readiness:** Clean structured data and semantic HTML are exactly what AI-driven answer engines (not only traditional search) parse to represent a page. Investing in real structured data now is preparing for how search already works today, not a speculative future feature.

---

## 9. Internal Linking Strategy

- **Related Products:** same-category or explicitly curated (Collections, §6) — never randomly generated.
- **Related Articles:** an article that discusses a product links to it; once the Article↔Product relationship (§6) exists, a product page can surface "learn more" links back to relevant articles.
- **Categories:** bidirectional — every product links back to its category (breadcrumb, label), every category links to its products. A visitor should never reach a dead end that only browser-back can escape.
- **Cross-category recommendations:** a Families persona (`PHASE_2` §2) shopping Fabric Care is a natural candidate to see a Body Care cross-link — this directly supports the cross-category basket-building behavior already identified as one of MUV's real structural advantages.
- **Business links:** every page carries at least a footer-level path to the Business entry point — an institutional visitor should never need to already know a special URL to find it.
- **Support links:** FAQ/Contact reachable from the footer everywhere, and contextually surfaced at Cart/Checkout specifically, since a customer with a question at that exact moment shouldn't have to hunt for a way to ask it.
- **Navigation links:** primary nav and footer are the internal-linking backbone; related-content links are supplementary, never a substitute for solid primary navigation carrying its own weight.
- **SEO links:** every new product is linked *from* its category page and any relevant article at the moment it's published — no product should be reachable only by direct URL or search, an orphaned page that both customers and search engines struggle to find.

---

## 10. Information Relationships

Restating and extending `PHASE_4` §12 for this document's own completeness as a standalone IA blueprint — not a contradiction of it.

- **Category → Product** (one-to-many) → **Product → Variant → Inventory** (stock, tracked with a full audit trail).
- **Product ↔ Review ↔ Customer** — one review per customer per product, always tied to both.
- **Customer → Order → OrderItem → Variant** — order items snapshot price/name at purchase time, deliberately decoupled from the live product record (history must never silently change).
- **Order → Shipment → ShipmentEvent**, **Order → PaymentAttempt** — tracking and payment history, both one-to-many from Order.
- **Customer → Wishlist → Product/Variant**, **Customer → Address → Order** (snapshotted per order, same non-retroactive principle as OrderItem).
- **Media:** a shared pool, loosely coupled by URL to Product/Article/Banner rather than strict foreign keys, since the storage provider is the actual source of truth for the asset.
- **Coupon → Order** — many orders per coupon, usage tracked centrally.
- **Search** does not own data — a read index over Product/Category/Article, kept in sync rather than becoming a second source of truth.
- **CMS and Admin** are privileged read/write surfaces over the *same* tables the storefront reads — never a duplicated draft/live content fork unless that's an explicit, separately-justified future decision.
- **Navigation** is configuration, not content — today hardcoded, targeted (`PHASE_4` §6) to become CMS-driven, at which point it becomes data like everything else in this list rather than a special case.

---

## 11. IA Principles

- **Everything Discoverable** — if a page exists, there is at least one real path to it from global navigation, search, or a contextual link. A page reachable only by typing its exact URL does not meet this bar.
- **No Dead Ends** — every page, every empty state, every zero-result offers a next step (`PHASE_2`/`PHASE_3`'s shared "no stall" principle, expressed structurally).
- **One Source of Truth** — a fact about a product, category, or policy lives in exactly one place and is linked to, never copy-pasted into a second page where it can drift out of sync.
- **Simple Hierarchy** — two levels for shopping (category, product), not three or four, because the catalog's actual shape doesn't require more and a deeper hierarchy would only add clicks without adding clarity.
- **Maximum Three-Click Discovery, Where Practical** — from any entry point, a specific product should be reachable within three decisions (e.g., Home → Category → Product, or a single Search). Not a hard rule for every edge case, but the default target every new page should be measured against.
- **Search Before Frustration** — search is offered prominently before a visitor has to resort to it out of frustration with browsing — a first-class tool, not a last resort (`PHASE_2` §4).
- **Scalable Navigation** — the structure holds at 500+ products and a sixth, seventh, eighth category without a redesign, because that's the stated target (`PHASE_1`, `PHASE_4A`), not a hypothetical.
- **Meaningful URLs** — every URL is readable and guessable by a human, per §7 — never an opaque ID standing in for a real name.
- **No Duplicated Content** — the same product, policy, or fact is never represented by two different pages that could say different things.
- **Future-Ready Taxonomy** — today's flat category structure is deliberately simple, not permanently shallow; it's designed so a subcategory tier or a tagging system can be added later as an *extension*, not a rebuild (`PHASE_4A` §9's "addition, not rewrite" test applied to IA specifically).

---

## 12. Approval Checklist

Every future UI or frontend phase, before implementation, must confirm:

- [ ] Does this new screen have a URL that follows §7's naming rules?
- [ ] Is it reachable from global navigation, search, or a real contextual link — not only by direct URL (§11, "Everything Discoverable")?
- [ ] Does it have real, page-specific metadata (§8) — not an inherited generic title/description?
- [ ] Is there at least one link *to* it from an existing page, and at least one link *from* it onward (§9) — no orphans, no dead ends?
- [ ] Does it fit within the Sitemap's existing hierarchy (§2), or does adding it require a deliberate IA revision — not a quiet exception?
- [ ] Does it respect the "maximum three-click discovery" target (§11), or is there a specific, justified reason it doesn't?
- [ ] Does it maintain One Source of Truth — reusing existing content/data rather than duplicating it (§10)?
- [ ] Does it remain compatible with `PHASE_1_ARCHITECTURE.md`, `PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`, and `PHASE_4A_PRODUCT_STRATEGY.md`?

---

## Deliverables Checklist

1. ✅ Information Architecture Philosophy — §1
2. ✅ Complete Sitemap — §2
3. ✅ Navigation Architecture — §3
4. ✅ User Flow Architecture — §4
5. ✅ Search Information Architecture — §5
6. ✅ Content Architecture — §6
7. ✅ URL Architecture — §7
8. ✅ Metadata Architecture — §8
9. ✅ Internal Linking Strategy — §9
10. ✅ Information Relationships — §10
11. ✅ IA Principles — §11
12. ✅ Approval Checklist — §12

**No UI. No wireframes. No components. No colours. No typography. No code. This is the permanent structural blueprint — frozen pending approval.**
