# MUV White Phenyl™ — Live Data Mapping

> Per `FR-001`/`FR-002`. Template reused from Black Phenyl's `10_LIVE_DATA_MAPPING.md` (see
> `13_Reports/08_Knowledge_Reuse_Summary.md`), content independently sourced for this product.
> This file documents the authoritative live source for every commercial field. The Product
> Knowledge Factory stores NONE of these values.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: no embedded photo exists in the source SOP at all) |
| MRP | `ProductVariant.mrp` | same, per variant (1L, 5L) |
| Selling Price | `ProductVariant.price` | same, per variant |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` (all variants for the product) | same |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` (`inStock = quantity > 0`) | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` (`ACTIVE`/`DRAFT`/`ARCHIVED`) | same |

## This Product Family's current catalog status

MUV White Phenyl™ does **not** yet exist in the live storefront catalog — confirmed via
`prisma/seed.ts` and `prisma/schema.prisma` (zero matches for "Phenyl"). No real `Product` or
`ProductVariant` row exists yet for either pack size.

## Historical source citations (audit trail only — never live facts)

The Product Chart's row 20 (1L, ₹65) and row 21 (5L, ₹275) are recorded exactly once as numbers,
in `00_Source_Register.md`, explicitly labeled historical source-audit citations. No other file
in this package restates them as numbers.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` has **no `PHENYL`/`WHITE_PHENYL` consumption category at
all** — the same gap found for Black Phenyl. No institutional placeholder price exists to flag.
