# MUV Body Wash™ — Live Data Mapping

> Per `FR-001`/`FR-002`. Template reused from Black Phenyl/White Phenyl (see
> `13_Reports/09_Knowledge_Reuse_Summary.md`), content independently sourced for this product.
> The Product Knowledge Factory stores NONE of these values.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` (one row per variant, once catalogued) |
| Product Images | `Product.images` | same (note: no embedded photo exists in the source SOP at all) |
| MRP | `ProductVariant.mrp` | same, per variant, per pack size (6 real SKUs: 3 variants × 2 sizes) |
| Selling Price | `ProductVariant.price` | same |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` (all variants for the product) | same |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` (`inStock = quantity > 0`) | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` (`ACTIVE`/`DRAFT`/`ARCHIVED`) | same |

## This Product Family's current catalog status

None of the three real variants (MUV Crimson Veil Body Wash™, MUV Velvet Oak Body Wash™, MUV
Midnight Frost Body Wash™) exists in the live storefront catalog yet — confirmed via
`prisma/seed.ts` (zero matches for any of the three variant names) and `prisma/schema.prisma`.

**Important distinction:** `prisma/seed.ts` DOES contain a real, live `Product` record named
"MUV Cleanse" (`slug: "muv-cleanse"`) — but this is a **different, non-matching product**, not
one of the three real variants (different fragrance, pack sizes, and pricing — see
`00_Source_Register.md` §5). If "MUV Cleanse" is ever queried live, it must never be presented
as Crimson Veil, Velvet Oak, or Midnight Frost, or vice versa. This package's commercial-field
resolution paths above apply only once real `Product`/`ProductVariant` rows are created for the
three actual, sourced variants.

## Historical source citations (audit trail only — never live facts)

The Product Chart's rows 32–37 (all six real SKU price points) are recorded exactly once as
numbers, in `00_Source_Register.md`, explicitly labeled historical source-audit citations. No
other file in this package restates them as numbers.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` has **no `BODY_WASH`/`BODY_CARE` consumption category at
all** — confirmed via direct read of the full `ConsumptionCategory` type union. No institutional
placeholder price exists to flag.
