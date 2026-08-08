# MUV Car Wash™ — Live Data Mapping

> Per `FR-001`/`FR-002` (commercial fields) and, new for this package, `FR-006` (the six
> operational fields). The Product Knowledge Factory stores NONE of these values.

## Commercial fields (`FR-001`)

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: SOP references uncaptioned reference photos, not usable as sourced per-SKU imagery) |
| MRP | `ProductVariant.mrp` | same, per pack size (2 real SKUs: 500ml, 5L) |
| Selling Price | `ProductVariant.price` | same |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` | same — 500ml, 5L, both always available, no restriction |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` | same |

## Operational fields (`FR-006`, new for this package)

| Operational Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Usage Instructions | `ProductIntelligence`/`ProductIntelligenceVersion.sections` (inferred mapping — see `ARCHITECTURE.md` §5.1) | Not yet populated for this product — see note below |
| Safety Instructions | Same | Same |
| Contraindications | Same | Same |
| First Aid | Same | Same |
| Storage Conditions | Same | Same |
| Shelf Life | Same | Same |

**Real, disclosed limitation:** no `ProductIntelligence`/`ProductIntelligenceVersion` row exists
for this product, or for any MUV product family, as of this package's authoring. The mapping
above names the correct target schema per `ARCHITECTURE.md` §5.1's evidence-grounded inference —
it does not mean this content is currently retrievable. See `14_FOUNDER_GAPS.md`.

## This Product Family's current catalog status

MUV Car Wash does not exist in the live storefront catalog yet — confirmed via `prisma/seed.ts`
(zero matches for "MUV Car Wash"). **`prisma/seed.ts` DOES contain a different, unrelated
`Product` record, "MUV Shield"** (`slug: "muv-shield"`) — see `00_Source_Register.md` §3. If
queried live, it must never be presented as MUV Car Wash, or vice versa.

## Historical source citations (audit trail only — never live facts)

The Product Chart's rows 18–19 and the SOP's Packing Standard table are recorded exactly once as
numbers, in `00_Source_Register.md`, explicitly labeled historical citations. No conflict exists
between them (a first for this session). No other file in this package restates them as numbers.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` has **no `CAR_WASH` consumption category at all** —
confirmed via direct read of the full `ConsumptionCategory` type union. No institutional
placeholder price exists to flag, despite "Car Wash" already being a real, tracked
`BUSINESS_TYPES` value elsewhere in the platform (`lib/validations/inquiry.ts`) — see
`14_FOUNDER_GAPS.md`.
