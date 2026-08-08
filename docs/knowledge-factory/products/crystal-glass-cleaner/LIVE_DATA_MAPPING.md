# MUV Crystal Glass Cleaner™ — Live Data Mapping

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

**MUV Crystal Glass Cleaner™ does not yet exist in the live storefront catalog.** No `Product` or
`ProductVariant` row exists for this product family — confirmed by direct search of `prisma/seed.ts`
during this package's original source audit (`00_Source_Register.md`, §5 "Seed data / Schema"):
zero matches for "Glass" or "Crystal" in seed data, and no product/category/pricing record exists
for it there. `01_Product_Identity.md` (KO-GC-IDENT-001) independently records the same finding
under "Catalogue Status." Until a real `Product`/`ProductVariant` pair is created for this family,
every commercial field in the table above resolves to "not yet available" rather than a live
value — the AI must say the product is not yet in the online catalogue (a real rollout-status
knowledge fact, not a commercial value) and must never substitute a historical source-audit figure
in place of a live catalog lookup that currently returns nothing.

## Historical source citations (audit trail only — never live facts)

The following files retain the ₹90/500 ml pricing figure recorded during this package's original
source audit (Product Chart row 13 and the Production SOP's Packing Standard table, which agreed
exactly — see `00_Source_Register.md`). Every retention is explicitly labeled "Historical source
citation only (recorded during source audit) — NOT a live commercial value," per FR-001/FR-002's
binding interpretation that only `00_Source_Register.md` and the Source Conflict Register (and
their JSON equivalents) may retain the audit trail:

- `00_Source_Register.md` — the original citation of the ₹90 figure (Product Chart + SOP) and of
  the ₹140/Ltr institutional placeholder estimate, both now explicitly labeled.
- `19_Source_Conflict_Register.md` — Comparison 1 ("Pricing (500 ml) — CLEAN, no conflict"),
  explicitly labeled, plus a file-level FR-001/FR-002 note covering cross-package pricing
  references cited there for audit-comparison context (e.g. Bathroom Cleaner's historical
  ₹70/₹65 conflict).
- `source_conflicts.json` — `cleanComparisons[0]` ("Comparison-1"), carries the same explicit
  `label` field.
- `sku_variants.json` — `KO-GC-VAR-001.pricing.historicalSourceCitation`, carries the same
  explicit `label` field; the live-facing `pricing.status` field is `LIVE_LOOKUP_REQUIRED`.

Every other file in this package that previously stated ₹90 (or referenced the ₹140/Ltr
institutional placeholder) as a usable fact — `02_Product_Family_and_SKUs.md`,
`03_Product_Description.md`, `10_Packaging_Storage_Transport.md`, `11_Sales_Intelligence.md`,
`12_Marketing_Intelligence.md`, `14_FAQs_and_AI_Responses.md`, `16_Care_Response_Objects.md`,
`17_Golden_Questions.md`, `22_Knowledge_Visibility_Matrix.md`, `23_Knowledge_Reuse_Report.md`,
`24_Validation_Report.md`, `golden_questions.json` — was remediated on 2026-07-31 to defer to
`LIVE — resolve from Product Catalog API` instead, per FR-001/FR-002.

## Institutional/placeholder pricing note

`lib/inst-sales/consumption-rules.ts` carries a placeholder institutional business-rule estimate
(`ESTIMATED_UNIT_PRICE_INR.GLASS_CLEANER`, ₹140/Ltr) used only to produce rough consumption/volume
estimates for institutional-sales conversations (`(floors × 1.2 Ltr) + lobby glass frontage
allowance`). This figure is self-labeled in that file's own header comment as a placeholder
institutional price list, **not** a lookup into the real storefront Product catalog. It is:

- **Not a live catalog value** — it does not come from `Product`/`ProductVariant`/`Inventory`.
- **Not a Knowledge Factory value either** — the Knowledge Factory does not own or restate it as
  fact; this package only ever references it to explicitly flag it as a non-source (see
  `11_Sales_Intelligence.md`, `16_Care_Response_Objects.md` KO-GC-CRO-003/006).

It must never be quoted to a customer as a real price. Any institutional/bulk-glass-cleaning
inquiry must be routed to institutional sales for a real quote (see KO-GC-CRO-003 and KO-GC-CRO-006
in `16_Care_Response_Objects.md`), and any real retail price question must resolve live per the
table above — never from this placeholder, and never from the historical ₹90 audit citations
listed above.
