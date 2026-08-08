# MUV Hand Wash™ — Live Data Mapping

> Per `FR-001`/`FR-002`. Template reused from Black Phenyl/White Phenyl/Body Wash (see
> `13_Reports/10_Knowledge_Reuse_Summary.md`), content independently sourced for this product.
> The Product Knowledge Factory stores NONE of these values.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` (one row per variant, once catalogued) |
| Product Images | `Product.images` | same (note: 8 uncaptioned reference photos exist in the source SOP, not usable as sourced per-SKU imagery — see `02_Product_Architecture.md`) |
| MRP | `ProductVariant.mrp` | same, per variant, per pack size (8 real SKUs — see `02_Product_Architecture.md` KO-HW-AVAIL-001, never all 12 theoretical combinations) |
| Selling Price | `ProductVariant.price` | same |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` (all variants for the product) | same — **must reflect the asymmetric matrix, never assume symmetry across variants** |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` (`inStock = quantity > 0`) | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` (`ACTIVE`/`DRAFT`/`ARCHIVED`) | same |

## This Product Family's current catalog status

None of the four real variants (Silk Blossom, Ocean Fresh, Citrus Blast, Life Shield) exists in
the live storefront catalog yet — confirmed via `prisma/seed.ts` (zero matches for `hand.?wash`
case-insensitive) and `prisma/schema.prisma`.

**Important distinction:** `prisma/seed.ts` DOES contain two real, live `Product` records with
superficially similar names — "MUV Silk Hair Wash" (`slug: "muv-silk-hair-wash"`, a shampoo) and
"MUV Shield" (`slug: "muv-shield"`, a car-care product) — but **neither is one of the four real
Hand Wash variants.** If either is ever queried live, it must never be presented as Silk Blossom
or Life Shield, or vice versa. This package's commercial-field resolution paths above apply only
once real `Product`/`ProductVariant` rows are created for the four actual, sourced variants — and
even then, exactly 8 `ProductVariant` rows, matching `KO-HW-AVAIL-001`'s matrix, never 12.

## Historical source citations (audit trail only — never live facts)

The Product Chart's rows 24–31 and the SOP's §1 generic pack-size pricing table are recorded
exactly once as numbers, in `00_Source_Register.md`, explicitly labeled historical source-audit
citations, including the documented discrepancy between the two (Chart is per-variant; SOP is
flat/generic; the two also disagree numerically). No other file in this package restates them as
numbers.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` has a `HAND_WASH` consumption category — but it is
**category-wide, not variant-aware**: `ESTIMATED_UNIT_PRICE_INR.HAND_WASH = 160` (₹/Ltr,
explicitly a placeholder per the file's own header), and its estimation function
(`washrooms + kitchens` as "dispenser touchpoints," plus a per-bed allowance) has no reference to
any of the four real variants. This is flagged here, not corrected — the file's own header
already warns its estimates are "tunable, not measured facts."

## Availability data note (new for this package)

Unlike every prior single- or multi-variant product this session, **which pack sizes exist is
itself part of "live" catalog truth, not just pricing** — when real `Product`/`ProductVariant`
rows are created, `ProductVariant.size` must be seeded to exactly the 8 combinations in
`02_Product_Architecture.md` KO-HW-AVAIL-001, never the full 4×3 cartesian product, and never the
Product Chart's conflicting 8-row set (`00_Source_Register.md` §1).
