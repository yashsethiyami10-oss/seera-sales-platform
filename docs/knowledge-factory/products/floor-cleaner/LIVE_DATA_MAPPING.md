# MUV Floor Cleaner™ — Live Data Mapping

> Per FR-001/FR-002. This file documents the authoritative live source for every commercial
> field for this Product Family (Parent + all three variants: Velvet Mist, Cloud Walk, Rose
> Water). The Product Knowledge Factory stores NONE of these values — they are always resolved
> at answer/render time from the fields listed below.

| Commercial Field | Authoritative Live Source | Resolution Path |
|---|---|---|
| Product Name | `Product.name` (one row per variant, once catalogued) | `GET /api/products/[slug]` or `GET /api/products` |
| Product Images | `Product.images` | same (note: not yet included in either API route's response shape — a real engineering gap, not a Knowledge Factory concern) |
| MRP | `ProductVariant.mrp` | same, per variant, per pack size |
| Selling Price | `ProductVariant.price` | same |
| Discount | Derived: `(mrp - price) / mrp` | computed live, never stored |
| Available Pack Sizes | `ProductVariant.size` (all variants for the product) | same |
| Active Variants | `ProductVariant` rows where parent `Product.status = "ACTIVE"` | same |
| Stock Status | Derived from `Inventory.quantity` (`inStock = quantity > 0`) | same |
| Product URL | Derived from `Product.slug` | same |
| Product Slug | `Product.slug` | same |
| Product Availability | `Product.status` (`ACTIVE`/`DRAFT`/`ARCHIVED`) | same |

## This Product Family's current catalog status

**None of the three MUV Floor Cleaner™ variants exist in the live storefront catalog yet.**
`prisma/seed.ts` and `prisma/schema.prisma` contain zero matching `Product`/`ProductVariant`
records for "Floor Cleaner," "Velvet Mist," "Cloud Walk," or "Rose Water" (confirmed during
source audit — see `00_Source_Register.md` §5). Specifically:

- **Velvet Mist** and **Cloud Walk** are fully sourced (Product Chart rows 14–17, Production SOP)
  for formulation, colour, fill weight, and pack sizes (1L, 5L), but neither has a corresponding
  `Product`/`ProductVariant` row today. Once each becomes a real catalogued `Product` (one row per
  variant, one `ProductVariant` row per pack size), its MRP/price/stock/URL/slug/availability will
  resolve per-variant, per-pack-size, from the fields in the table above — exactly as for any
  other catalogued product. Nothing in this Knowledge Package pre-supplies or hardcodes what those
  future catalog values will be.
- **Rose Water** has no formulation, colour, fragrance identity, or pack size sourced anywhere
  (see `KO-FC-RW-VAR-001`, `02_Product_Family_and_Variants.md`) — it is named-but-unsourced per
  direct Founder Instruction only. It therefore has **no pricing to resolve at all yet**, live or
  historical: there is no SKU to attach a `ProductVariant` row to until the Founder supplies real
  formulation/packaging facts. This is a sourcing-completeness gap (tracked in
  `19_Founder_Input_Register.md`), not a commercial-data violation, and is out of scope for this
  remediation.

## Historical source citations (audit trail only — never live facts)

The following files retain the original ₹ figures found during source research, verbatim, each
explicitly labeled as a historical source-audit citation only — never a live, AI-answerable fact:

- **`00_Source_Register.md`** — Product Chart rows 14–17 (₹150 × 2, ₹550, ₹600) and the SOP's
  stated 5L MRP (₹549), plus the "Pricing Conflict Finding" summary. Each instance now carries an
  explicit "NOT a live commercial value" label per FR-001/FR-002.
- **`20_Source_Conflict_Register.md`** — CONFLICT-001 (Velvet Mist 5L: Chart ₹550 vs. SOP ₹549,
  a ₹1 gap) and CONFLICT-002 (Cloud Walk 5L: Chart ₹600 vs. SOP ₹549, a ₹51 gap — the largest
  pricing discrepancy of any product/variant across all six product families audited this
  session), plus the clean 1L comparison (Chart ₹150 = SOP ₹150 for both variants). A single
  blanket disclaimer now covers the whole file, labeling every ₹ figure in it as a historical
  source-audit citation, never a live value.
- **`source_conflicts.json`** — the JSON mirror of the same conflict/clean-comparison figures,
  now carrying an explicit top-level `commercialDataDisclaimer` field with the same labeling.

No other file in this package retains a raw ₹ figure. Every customer/AI-facing file that
previously stated a pricing figure as fact — `02_Product_Family_and_Variants.md`,
`03_Product_Description.md`, `10_Packaging_Storage_Transport.md`, `11_Sales_Intelligence.md`,
`12_Marketing_Intelligence.md`, `14_FAQs_and_AI_Responses.md` (FAQ table + KO-FC-AI-003),
`16_Care_Response_Objects.md` (KO-FC-CRO-006), `18_Golden_Questions.md` (GQ-03/GQ-04), and the
corresponding fields in `variant_definitions.json`, `variant_inheritance.json`, and
`golden_questions.json` — has been rewritten to defer to a live Product Catalog lookup instead.
`19_Founder_Input_Register.md`'s two 5L-pricing-conflict gap items retain the historical figures
(the Founder needs the actual numbers to decide) but are now explicitly labeled as historical
Chart/SOP citations that a live catalog value will supersede.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` carries an internal, non-customer-facing institutional
estimate of **₹110/Ltr** for `FLOOR_CLEANER` (`ESTIMATED_UNIT_PRICE_INR.FLOOR_CLEANER`), used only
to drive an internal institutional-sales consumption formula (`cleaningAreaSqft × 0.004 Ltr/sqft ×
frequency factor`) and explicitly self-labeled a "placeholder institutional price list" in the
file's own header. It is:

- **Not** a live catalog value (it is not read from, or written into, `Product`/`ProductVariant`).
- **Not** a Knowledge Factory value either — it is a business-rule constant living in application
  code, referenced by `11_Sales_Intelligence.md` only to document its existence and non-authoritative
  status, never presented as a real product price.
- **Not** variant-aware (it applies identically regardless of Velvet Mist / Cloud Walk / Rose
  Water), and it must never be surfaced to a customer or to the customer-facing AI as if it were a
  real MRP or selling price.
