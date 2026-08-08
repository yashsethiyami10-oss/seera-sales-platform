# MUV Fresh Bathroom Cleaner™ — Live Data Mapping

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

**MUV Fresh Bathroom Cleaner™ does not yet exist in the live storefront catalog.** Per
`00_Source_Register.md` item 5, no `Product`/`ProductVariant` record for this family exists in
`prisma/schema.prisma`/`prisma/seed.ts`, and `lib/inst-sales/consumption-rules.ts` has no
`BATHROOM_CLEANER` entry in its `ConsumptionCategory` union either. Until a real `Product` and at
least one `ProductVariant` row are created for this family, every field in the table above has
**no live value to resolve** — the correct AI/customer-facing behavior is to state plainly that
this product is not yet listed for sale (see `17_Care_Response_Objects.md` KO-BC-CRO-005,
`16_Golden_Questions.md` GQ-10), never to substitute a Knowledge Factory figure as a stand-in.
This is a knowledge fact about rollout status (permitted per `VALIDATION_RULES.md` §2.2), not a
live stock/pricing claim.

Once a real `Product`/`ProductVariant` row is created for this family, this section must be
updated to reflect that the catalog resolution path above is live and active — no other change to
this file should be needed, since the resolution paths themselves do not change.

## Historical source citations (audit trail only — never live facts)

The following files retain the historical 500ml pricing discrepancy figures found during source
research (Product Chart vs. Production SOP — see `19_Source_Conflict_Register.md` CONFLICT-001 for
the specific historical figures), strictly as source-document audit citations — never as a live,
AI-answerable fact. Each is labeled in-place per FR-001/FR-002:

- `00_Source_Register.md` — rows 1 and 2 of the Sources Searched table, and the Source Authority
  Applied section, record what the Product Chart and SOP each said when found.
- `19_Source_Conflict_Register.md` — CONFLICT-001's Source A / Source B fields record the two
  conflicting historical figures as the evidentiary basis for the conflict entry itself.
- `source_conflicts.json` — the `CONFLICT-001` object's `sourceA.value`/`sourceB.value` fields
  mirror the same historical citation in machine-readable form.

All other package files that previously stated the historical pricing figures as a usable fact
(`02_Product_Family_and_SKUs.md`, `03_Product_Description.md`, `11_Sales_Intelligence.md`,
`14_FAQs_and_AI_Responses.md`, `16_Golden_Questions.md`, `17_Care_Response_Objects.md`
KO-BC-CRO-001, `18_Founder_Input_Register.md`, `sku_variants.json`, `care_response_objects.json`,
`golden_questions.json`, `knowledge_metadata.json`, `founder_input_required.json`) have had the
raw figures removed and replaced with a live-lookup deferral as part of the FR-002 remediation
pass completed 2026-07-31 — see `24_Validation_Report.md`.
