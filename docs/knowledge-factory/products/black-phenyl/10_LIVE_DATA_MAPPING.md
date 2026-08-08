# MUV Black Phenyl™ — Live Data Mapping

> Per `FR-001`/`FR-002`. This file documents the authoritative live source for every commercial
> field for this Product Family. The Product Knowledge Factory stores NONE of these values —
> they are always resolved at answer/render time from the fields listed below.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: no embedded photo exists in the source SOP at all — no image asset exists in any source yet) |
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

MUV Black Phenyl™ does **not** yet exist in the live storefront catalog — confirmed via
`prisma/seed.ts` and `prisma/schema.prisma` (zero matches for "Phenyl"). No real `Product` or
`ProductVariant` row exists yet. When it is catalogued, the pack size that should be entered is
**1L**, per direct Founder Instruction (see `14_FOUNDER_GAPS.md` for the unresolved question of
what the Product Chart's separate 500ml/₹80 entry represents).

## Historical source citations (audit trail only — never live facts)

The only commercial figure found during source research is the Product Chart's row 22 entry
(500ml, ₹80), recorded exactly once as a number, in `00_Source_Register.md`, explicitly labeled
a historical source-audit citation. No other file in this package restates it as a number. Note
this figure is tied to the 500ml pack size, which this package does **not** present to customers
(1L is presented, per Founder Instruction) — so even as a historical citation, it should not be
read as "the historical price of the 1L pack," since no source ever priced a 1L Black Phenyl.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` has **no `PHENYL`/`BLACK_PHENYL` consumption category at
all** — the same gap found for Pure Bleach. No institutional placeholder price exists to flag.
