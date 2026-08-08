# Production Customer Content Layer — Architecture, Import & Verification Report

**Founder Decision — Product Content Architecture (FINAL), executed.** All 6 requested deliverables
below: Architecture, Import execution, Verification, Production build, Homepage verification,
Product page verification.

---

## 1. Architecture

**New table: `product_content`** (Prisma model `ProductContent`), 1:1 with `Product`
(`productId @unique`, `onDelete: Cascade`). Every field optional — a null field means "no approved
content yet," never placeholder text:

`shortDescription`, `longDescription`, `keyBenefits`, `howToUse`, `careInstructions`, `storage`,
`safetyInformation`, `productHighlights`, `faq` (JSON), `seoTitle`, `seoDescription`,
`searchKeywords` (array) — plus `approvalStatus` (`PENDING`/`APPROVED`, Founder-workflow marker,
not rendered) and `sourceProvenance` (JSON audit trail of exactly which Knowledge Library file/KOID
backs each populated field).

**Migration**: `prisma/migrations/20260805000000_product_content_layer/` — one `CREATE TABLE`, one
unique index, one FK. Generated via `prisma migrate diff` against the live database (same
disciplined method as every prior schema change this engagement), dry-run validated inside
`BEGIN...ROLLBACK` against production before being applied for real, then recorded in
`_prisma_migrations`. Confirmed: **zero changes to any existing table** — `products`,
`product_variants`, `inventory`, `categories` are untouched by this migration.

**Deliberate separation, per the Founder's explicit architecture requirement**: this table is
distinct from `docs/knowledge-factory/` (internal source of truth, never exposed) and distinct from
`Product`'s own legacy text columns (`shortDescription`, `fullDescription`, `benefits`,
`directions`, `safety`, `metaTitle`, `metaDescription` — all still exist on `Product`, still hold
their old placeholder values, but **are no longer read by any customer-facing code path** —
confirmed below).

## 2. Import execution

**Script**: `scripts/populate-product-content-layer.ts` — idempotent (upsert by `productId`,
`update: {}` never overwrites an existing row), writes only to `product_content`, touches nothing
else. Run for real against production: **20 rows created** (19 ACTIVE products + the 1 DRAFT Black
Phenyl placeholder), 0 skipped, 0 already existed.

**Every value is a near-verbatim extract from a real Knowledge Library file**, not authored copy —
full source citation per row is in the script's own `sourceFile` field and in
`sourceProvenance` on each database row. Only `shortDescription`, `seoTitle`, and `searchKeywords`
were populated — every other field is genuinely null (see §"What remains pending" below).

**What was excluded during extraction — the actual proprietary-content firewall, applied
per-sentence, not just per-file**:
- Raw material/chemical abbreviations (SLES, CAPB, CDEA, HEC, IPA, EDTA) — found in nearly every
  family's source text, stripped from all 20 entries.
- Exact percentages/quantities (e.g. Body Wash's source stated "1% Salicylic Acid," "SLES (28%
  active)") — Body Wash's three variants ended up with the thinnest safe content of any family
  (name + pack sizes only) as a direct, correct consequence of this rule.
- One real competitor brand reference: Toilet Cleaner's source SOP names its fragrance using a
  competitor's product name ("Harpic Floral") — excluded as a trademark/competitor-reference risk,
  a distinct category from formulation risk, caught during investigation, not previously flagged.
- Internal QC/manufacturing-objective phrasing ("to manufacture a stable X... with consistent
  quality for MUV") and unverified performance claims (e.g. Glass Cleaner's "streak-free,
  fast-drying" — stated in its source as an internal QC target, not an approved customer claim).

## 3. Verification

Direct, post-import database queries (not assumed):

| Check | Result |
|---|---|
| `product_content` rows | **20** |
| `products` / `variants` / `inventory` / `categories` (protected fields) | **20 / 36 / 36 / 6 — identical to before this task** |
| ACTIVE / DRAFT products | **19 / 1 — unchanged** |
| Duplicate rows | None (upsert-by-unique-key by construction) |
| `longDescription` / `keyBenefits` / `safetyInformation` / `howToUse` / `careInstructions` / `storage` / `faq` populated count | **0 / 0 / 0 / 0 / 0 / 0 / 0 — confirmed via raw SQL, genuinely null, not fabricated** |
| Old `Product.shortDescription` placeholder text | Still present in the legacy column (20 rows) — **inert**, no longer read anywhere (see §6) |

## 4. Production build

`npm run build` — clean, no errors, after the schema migration and all 13 file changes below.

## 5. Homepage verification

`app/(storefront)/page.tsx`: category grid unaffected (still 6 categories, Skin Care still
"MUVING SOON™", still 0 products — untouched by this task). Product sliders (New Arrivals/Trending)
and the Featured Products section now source their USP line from
`product.content?.keyBenefits` via the shared `toFeaturedProduct` mapper — currently renders no USP
line for any card (since `keyBenefits` is null everywhere), which is correct: no fabricated benefit
text, exactly the same "hide, don't fake" rule applied at the card level, not just the detail page.

## 6. Product page verification

`app/(storefront)/products/[slug]/page.tsx` and every other customer-facing surface that reads
product copy — traced and updated exhaustively, not just the one page originally reported:

| File | What changed |
|---|---|
| `app/(storefront)/products/[slug]/page.tsx` | Short description, long description (`ProductWhyChoose`), benefits, how-to-use, safety, SEO metadata, and JSON-LD structured data all now read `product.content.*`. Short description section **hidden entirely** when null (no more "coming soon"). Ingredients section explicitly fed `null` — no safe source exists for a customer ingredient list (see §2); stays hidden until one does. |
| `app/(storefront)/page.tsx` (homepage) | Featured Products + `toFeaturedProduct` helper |
| `app/(storefront)/shop/page.tsx` | Shop grid + featured rail |
| `app/(storefront)/collections/[category]/page.tsx` | Category listing grid |
| `app/(storefront)/cart/page.tsx`, `checkout/success/page.tsx` | Cross-sell rails |
| `app/api/products/route.ts`, `app/api/products/[slug]/route.ts` | Public API responses |
| `lib/recommendations.ts` | The one shared `productCard` include used by `getSimilarProducts`/`getCoPurchasedProducts`/`getTrendingProducts`/`getNewArrivals`/`getRecommendedForYou` — fixing this one spot correctly propagated to every recommendation rail site-wide |
| `actions/recently-viewed.ts` | "Continue Shopping" rail |
| `actions/muv-ai-beta.ts` + `components/muv-ai/muv-ai-product-card.tsx` | The AI chat widget's own product card — found during the exhaustive sweep, not in the original bug report; now sourced from the content layer and hidden-if-empty (previously rendered unconditionally) |

**Confirmed empty, not fabricated, on a real product page right now**: benefits, how-to-use,
safety, care instructions, storage, and FAQ sections are all absent from every product page today
— by design, because no safe source content exists for them yet, not because of a bug.
Short description **does** now show real content (see the 20 sentences in §2).

## What remains genuinely pending — for the Founder workflow, as requested

None of these were filled with placeholder text; all are simply absent, `approvalStatus: "PENDING"`
on every row:

- **Long Description, Key Benefits, How to Use, Care Instructions, Storage, Product Highlights,
  FAQ, SEO Description**: no safe, sourced content was found in any Knowledge Library file for any
  of the 20 products for these specific fields — every source repeatedly states "REQUIRES FOUNDER
  INPUT" or "Unknown" for exactly this content.
- **Black Phenyl**: content row exists (`shortDescription` populated) but the product itself
  remains DRAFT with no variant, unchanged from the prior task — this task did not touch pricing.
- **6 product families** (`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`,
  `fresh-bathroom-cleaner`, `crystal-glass-cleaner`, `floor-cleaner`) still have no
  `10_LIVE_DATA_MAPPING.md`-equivalent commercial-readiness review — noted previously, unchanged.
- **`app/admin/products` and `components/admin/product-form-modal.tsx`** still read/write the
  legacy `Product` text columns — intentionally out of scope (an internal staff tool, not a
  "website product page"); flagged here so it isn't mistaken for an oversight. A future task could
  point the admin UI at `ProductContent` instead, once the Founder wants staff to edit this layer
  directly rather than through a script.
