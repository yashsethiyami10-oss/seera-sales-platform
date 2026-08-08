# MUV Floral Toilet Cleaner™ — Live Data Mapping

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

**MUV Toilet Cleaner™ does not yet exist in the live storefront catalog.** No real `Product` or
`ProductVariant` row exists for this product family in `prisma/seed.ts` / the live database — this
was confirmed during this package's original source research (see `00_Source_Register.md`, row 6:
"NOT FOUND — no `Product`/`ProductVariant` record for Toilet Cleaner exists; confirmed the seeded
catalogue is MUV Noir/Bloom/Renew/Cleanse/Silk Hair Wash/Shield only") and is unchanged as of this
remediation pass (2026-07-31).

Consequently, every "LIVE — resolve from Product Catalog API" marker inserted into this package
during remediation currently has **no live row to resolve against**. This is a known,
already-disclosed catalog-rollout gap (see `Founder_Input_Register.md` and Golden Question GQ-14,
"Is this product currently sold on the MUV website?" → "Not yet in the product catalogue"), not a
new gap introduced by this remediation. Once a `Product`/`ProductVariant` row is created for this
product family, the fields in the table above resolve automatically — no further Knowledge Factory
edit is required, per the Automatic Update Principle (`CONSTITUTION.md` Article 4). Until then, an
AI surface asked for pricing/stock/images/URL/slug for this product must report that the product is
not yet available in the live catalog (per GQ-14), not attempt to state a historical figure from
this package as if it were current.

The one exception, noted for completeness: `lib/inst-sales/consumption-rules.ts` carries a
self-described placeholder institutional-consumption constant (`TOILET_CLEANER: 130`, ₹/Ltr) used
only for internal opportunity-sizing estimation. It is not a `Product`/`ProductVariant` row, is not
a real quoted price, and must never be presented to a customer or prospect as this product's
pricing (see `06_Sales_Intelligence.md`, `07_AI_Responses.md` KO-TC-AI-002, and Golden Question
GQ-13).

## Historical source citations (audit trail only — never live facts)

The following files retain the historical ₹ figures found during this package's original source
research (Product Chart ₹80/500ml, ₹400/5L; SOP corroboration of the same). Each is explicitly
labeled as a historical audit citation only, never a live, AI-answerable fact, per FR-001/FR-002:

- **`00_Source_Register.md`** — rows 1 and 8 of the Sources Searched table, and Source Authority
  item 1. Labeled via a remediation banner added directly under the file's introduction.
- **`Source_Conflict_Register.md`** — Comparison 1 (Product Chart vs. Production SOP pricing
  match) and Comparison 2 (institutional `consumption-rules.ts` placeholder vs. retail MRP).
  Labeled via a remediation banner added directly under the file's introduction.

All other files in this package (`02_Product_Description.md`, `03_Manufacturing.md`,
`06_Sales_Intelligence.md`, `07_AI_Responses.md`, `08_FAQs.md`, `09_Golden_Questions.md`,
`10_Product_Variants.md`, `golden_questions.json`) have had their stated ₹ MRP figures replaced
with explicit live-lookup markers pointing to this file, as part of the FR-002 remediation pass
completed 2026-07-31. The one remaining ₹ figure outside the two Source Register-family files
above — the `consumption-rules.ts` ₹130/Ltr placeholder, referenced in `06_Sales_Intelligence.md`,
`07_AI_Responses.md`, `09_Golden_Questions.md`/`golden_questions.json` (GQ-13), and
`Founder_Input_Register.md` — is retained as-is because it was already correctly framed, before
this remediation, as an internal estimation constant that must **never** be presented as a real
price; no change was needed there to bring it into FR-001/FR-002 compliance.
