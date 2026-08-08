# MUV Liquid Detergent™ — Live Data Mapping

> Per FR-001/FR-002. This file documents the authoritative live source for every commercial
> field for this Product Family. The Product Knowledge Factory stores NONE of these values —
> they are always resolved at answer/render time from the fields listed below.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: not yet included in either API route's response shape — a real engineering gap, not a Knowledge Factory concern) |
| MRP | `ProductVariant.mrp` | same, per variant |
| Selling Price | `ProductVariant.price` | same, per variant |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` (all variants for the product) | same |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` (`inStock = quantity > 0`) | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` (`ACTIVE`/`DRAFT`/`ARCHIVED`) | same |

## This Product Family's current catalog status

**MUV Liquid Detergent™ does not yet exist in the live storefront catalog.** No real `Product` or
`ProductVariant` row exists for this product family — this was confirmed during this package's
original research (see `knowledge_metadata.json` → `sourceDocumentsUsed`, `prisma/seed.ts` entry:
"confirming NO real Product/ProductVariant record exists yet for this product") and is restated
throughout this package (`01_Product_Identity.md` KO-LD-IDENT-001; `06_Sales_Intelligence.md`
KO-LD-SALES-001; Golden Question GQ-15 in `09_Golden_Questions.md`/`golden_questions.json`, whose
expected answer is "Not yet in the product catalogue").

Because of this, every field in the table above currently has **no live row to resolve from** for
this product. Until a Founder/team member creates the real `Product` and `ProductVariant` rows
(via `actions/products.ts`, per the platform's real commerce data model) for MUV Liquid
Detergent™'s three variants and six SKUs, the correct AI behavior for any commercial-field
question about this product is: **state plainly that the product is not yet available for
purchase on the platform** (per GQ-15) — not to substitute a historical figure from this
Knowledge Package as a stand-in "current" price. This is a *catalogue-existence* fact (a
knowledge fact about rollout status), distinct from, and not an exception to, the live-lookup
requirement above: once the product is catalogued, all pricing/stock/image/URL/slug answers must
resolve from the live API fields listed above, never from this package.

## Historical source citations (audit trail only — never live facts)

Exactly one file in this package retains historical ₹ figures, and it is the sole intended home
for them in this package (this package predates `00_Source_Register.md`-style dedicated
Source Conflict Register files used by later packages):

- **`10_Product_Variants.md`** — Knowledge Object **`KO-LD-CONFLICT-001`** ("Cool Water Pricing
  Conflict"). Retains the two source figures found during research (`MUV_Product_Chart_with_USP
  (1)(1).pdf`: ₹165/1L, ₹725/5L; `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`: ₹155/1L,
  ₹699/5L generic figures) as evidence of a genuine discrepancy between two source documents.
  This block is explicitly labeled: *"Historical source citation only (recorded during source
  audit) — NOT a live commercial value. Per FR-001/FR-002, current pricing must always be
  resolved from the Product Catalog API, never from this figure."* It is cross-referenced (with
  the same label applied) from `02_Product_Description.md`, `03_Manufacturing.md`,
  `06_Sales_Intelligence.md`, `08_FAQs.md`, `09_Golden_Questions.md`/`golden_questions.json`,
  `knowledge_manifest.json`, and `knowledge_metadata.json` — none of those other locations restate
  the figures themselves; they only point back to `KO-LD-CONFLICT-001` as the single retained
  citation.

No other file in this package retains a specific ₹ figure. Every SKU/Variant table, Sales
Intelligence section, AI Response Guidance instruction, FAQ answer, and Golden Question answer
that previously stated a specific MRP now instead reads **"LIVE — resolve from Product Catalog
API (see `LIVE_DATA_MAPPING.md`)"** or the JSON equivalent
(`"expectedAnswer": "LIVE_LOOKUP_REQUIRED..."`). This package's own remediation is recorded in
this file, in `knowledge_manifest.json`'s `complianceRemediation` field, and in
`validation_report.md`'s Commercial Data Exclusion check; the aggregate
`LEGACY_REMEDIATION_REPORT.md` covering all six product families (per `FOUNDER_RULES.md` FR-002)
is compiled separately, outside this package's own scope.
