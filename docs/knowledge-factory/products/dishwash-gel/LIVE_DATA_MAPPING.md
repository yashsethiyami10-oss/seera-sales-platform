# MUV Spark Dishwash Gel™ — Live Data Mapping

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

**MUV Dishwash Gel™ does NOT yet exist in the live storefront catalog.** No real `Product` or
`ProductVariant` row exists for this product family in `prisma/seed.ts` or the production
database as of this remediation pass (2026-07-31) — this was independently confirmed twice: once
during the original knowledge-package research (`00_Source_Register.md`, row 6: "**NOT FOUND** —
no `Product`/`ProductVariant` record") and again during this FR-001/FR-002 remediation pass. The
`home-care` category exists in the seed taxonomy and is the inferred (not Founder-confirmed)
applicable category for this product, per `product_family.json`'s `catalogueStatus` block.

Practical consequence: until a real `Product`/`ProductVariant` row is created for this product,
`GET /api/products/[slug]` and `GET /api/products` have no live entry to resolve any of the
commercial fields above against. Any AI surface asked about this product's price, stock,
availability, images, URL, or slug must state that the product is **not yet listed in the
catalogue** (a knowledge fact about rollout status — see `16_Golden_Questions.md` GQ-14) rather
than inventing or reusing a historical figure from this Knowledge Package as a substitute. This is
a data-gap fact, not a live stock-quantity or pricing claim, and is the one form of "availability"
statement this package is permitted to make per `VALIDATION_RULES.md` §2.2.

Once a real `Product`/`ProductVariant` row is created for MUV Dishwash Gel™, all eleven fields
above become resolvable via the standard API routes and this section should be updated to reflect
that (a Knowledge Factory maintenance task, not a re-authoring of this package's product
intelligence).

## Historical source citations (audit trail only — never live facts)

The following files retain historical ₹ figures recorded from the Product Chart during this
package's original source research (`MUV_Product_Chart_with_USP (1)(1).pdf`, rows 9–11: 500 ml
₹85 / 1 L ₹155 / 5 L ₹699). Each retains the figures strictly as an audit citation of "what the
Product Chart said when researched," never as a live, AI-answerable fact, and each is labeled
accordingly per FR-001/FR-002:

- `00_Source_Register.md` — Source #1 row and closing FR-001/FR-002 note.
- `18_Source_Conflict_Register.md` — Comparison 1 table (Pricing: Product Chart vs. Production
  SOP), labeled immediately below the table.
- `source_conflicts.json` — `COMPARISON-1.sourceA.values` object, labeled via the
  `fr001Fr002Label` field added to that comparison.
- `sku_variants.json` — each SKU's `historicalMrpCitation` object (distinct from the sibling
  `pricing` field, which is a live-lookup marker, not a value).
- `02_Product_Family_and_SKUs.md` — Pricing Summary table's "Source of MRP" column references the
  Source Register citation rather than restating a value.
- `03_Product_Description.md` and `11_Sales_Intelligence.md` — each carry a short historical note
  immediately following their (now LIVE-marked) pricing tables, pointing back to
  `00_Source_Register.md`.
- `14_FAQs_and_AI_Responses.md` and `16_Golden_Questions.md` — reference the historical figures
  only to explain what the AI must NOT say, never as an answer to surface.

No other file in this package states a specific MRP, selling price, discount, stock, image, URL,
or slug value as fact. The `lib/inst-sales/consumption-rules.ts` placeholder institutional
constant (`DISHWASH: 150`, ₹/Ltr) referenced in `03_Product_Description.md` and
`11_Sales_Intelligence.md` is a separate, already self-disclaimed code constant (not sourced
product pricing) and is explicitly flagged in both files as never usable as a real price.
