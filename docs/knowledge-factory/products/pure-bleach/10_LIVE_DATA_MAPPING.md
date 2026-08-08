# MUV Pure Bleach™ — Live Data Mapping

> Per `FR-001`/`FR-002`. This file documents the authoritative live source for every commercial
> field for this Product Family. The Product Knowledge Factory stores NONE of these values —
> they are always resolved at answer/render time from the fields listed below.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: not yet included in either API route's response shape — a real engineering gap, not a Knowledge Factory concern; also note this product's source SOP contains no embedded photo at all, so no image asset exists in any source yet) |
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

MUV Pure Bleach™ does **not** yet exist in the live storefront catalog — confirmed via
`prisma/seed.ts` (zero matches for "Bleach") and `prisma/schema.prisma` (zero matches). No real
`Product` or `ProductVariant` row exists for it yet. The correct AI behavior when asked about
purchasing is to state plainly it isn't yet in the catalogue, never to substitute the historical
Product Chart figure as if it were a current price.

## Historical source citations (audit trail only — never live facts)

The only ₹ figure found during source research is the Product Chart's row 23 entry (₹60, 500ml),
recorded exactly once in `00_Source_Register.md` §1, explicitly labeled there as a historical
source-audit citation. No other file in this package restates it. Unlike five of the six
remediated packages, there is no pricing conflict to record — only one source (the Product Chart)
contains a price at all; the SOP contains no MRP table.

## Institutional/placeholder pricing note

Unlike Floor Cleaner (₹110/Ltr) and Glass Cleaner (₹140/Ltr), `lib/inst-sales/
consumption-rules.ts` has **no `BLEACH` consumption category at all** — confirmed via direct grep
during source audit. There is no institutional placeholder price to flag for this product; that
tooling simply does not cover Bleach yet, a real gap outside this Knowledge Package's scope.
