# MUV Production Catalog — Founder Approval Package

Companion to `PRODUCTION_CATALOG_MANIFEST.json` (the full 37-row machine-readable manifest) — this
document is the human-readable summary organized exactly as requested, for Founder review and
decision. **Nothing in this package has been imported.** No product, variant, price, or inventory
row has been written to the database.

## 1. Verified and ready (no Founder input needed)

- **37 of 37 SKUs' pack size and MRP** — read directly from
  `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`.
  Reproduced in full in `PRODUCTION_DATA_IMPORT_PLAN.md` and, per-row, in the manifest.
- **Category taxonomy** — 5 real categories (Home Care, Fabric Care, Body Care, Personal Care, Car
  Care) map cleanly onto every one of the 37 SKUs with no ambiguity, plus "Skin Care" carried
  forward as `comingSoon` (no products claimed, a genuine placeholder). See Phase A.
- **Product family identity** — real names, real ingredients, real safety information exist for
  every family in `docs/knowledge-factory/products/*/MASTER_*.md`, cross-referenced against the
  real manufacturing SOPs. Not reproduced here (out of this manifest's required field list) — cited
  by pointer per SKU in the manifest's `sourceProvenance` field.

## 2. Proposed values requiring Founder approval

- **SKU code convention**: `MUV-{CategoryCode}-{ProductCode}-{Size}` (e.g. `MUV-HC-TLC-500` for
  Toilet Cleaner 500ml). Category codes: HC/FC/BC/PC/CC. Product codes are 3-letter abbreviations
  assigned by this pass (e.g. `TLC`=Toilet Cleaner, `BPH`=Black Phenyl, `HWL`=Hand Wash Lifeshield
  — full list in the manifest). **Not final** — needs confirmation this doesn't collide with any
  existing external system (accounting codes, physical barcodes/labels already printed) that this
  repository has no visibility into.
- **Status = DRAFT for all 37 SKUs** — proposed so nothing becomes customer-visible before pricing/
  stock/images are resolved. Matches Prisma's own schema default.
- **"Skin Care" category kept as `comingSoon`** — carried forward from the existing `seed.ts`
  design even though zero real products exist for it yet; flagged as a judgment call, not a fact.

## 3. Missing values (present in every one of the 37 rows — not per-SKU noise, a structural gap)

| Field | Status | Policy applied |
|---|---|---|
| **Selling price** | Missing for all 37 | Per explicit instruction: **not** auto-filled from MRP. Every `sellingPrice` in the manifest is `null`. This is a hard blocker — `ProductVariant.price` is a required, non-nullable field in the schema, so **no variant can be inserted until this is supplied**, one by one or as a bulk Founder-approved list. |
| **Initial stock** | Missing for all 37 | Proposed as **0, pending physical stock confirmation** (the safer of the two policy options — no Founder-supplied quantity was given this session). |
| **Product images** | Missing for all 37 | No usable photography exists anywhere in the repository (see `PRODUCTION_DATA_IMPORT_PLAN.md` §"Images"). This is a sourcing gap, not a data-entry gap — no amount of repository searching will resolve it. |
| **Final SKU codes** | Proposed only | See §2. |

## 4. Conflicting values — 3 of 37 rows need explicit resolution before import

| Chart rows | Conflict |
|---|---|
| **20–21** ("MUV Phenyl", 1L ₹65 / 5L ₹275) | The chart lists this generically with no color qualifier. The Knowledge Factory's matching real product family is named **`white-phenyl`** (with its own real manufacturing SOP). This manifest *proposes* rows 20–21 = the white-phenyl family — but nothing in any source states this explicitly. **Needs direct Founder confirmation**: is "MUV Phenyl" the same product as "MUV White Phenyl," or a distinct third product? |
| **22** ("MUV Black Phenyl", 500ml, ₹80) | **Already documented elsewhere in this repository, not newly discovered here**: `docs/knowledge-factory/products/black-phenyl/10_LIVE_DATA_MAPPING.md` states that per direct Founder Instruction, Black Phenyl should be catalogued at **1L**, not 500ml — and that no source anywhere prices a 1L pack. This chart row is explicitly flagged there as a historical citation only. **Do not import this SKU using the chart's 500ml/₹80 figure** — a real 1L price is needed first. |

## 5. Image sourcing gap

All 37 SKUs: **no usable product photography found anywhere** — confirmed by direct repository
search (see `PRODUCTION_DATA_IMPORT_PLAN.md`). The only real Cloudinary asset referenced in code is
one unrelated hero-cutout image, not tied to any of these 37 products. This needs to be resourced
as a real photography/asset task — not something this or any future automated pass can solve by
searching the repository further.

## Recommended next Founder decisions, in priority order

1. Resolve the White Phenyl naming conflict (rows 20–21) and the Black Phenyl pack-size conflict
   (row 22) — both block those specific SKUs regardless of anything else.
2. Supply selling prices — either "sell at MRP" as a blanket policy, or per-SKU/per-family
   discount guidance. This blocks all 37 rows equally; it's the single highest-leverage decision.
3. Confirm or amend the proposed SKU code convention.
4. Decide initial stock: accept the 0-until-confirmed default, or supply real quantities.
5. Commission/gather real product photography — independent of the above, on its own timeline.

Once (1) and (2) are resolved for any subset of SKUs, `PRODUCTION_BULK_IMPORT_READINESS.md`'s
script can import exactly that subset — it does not require all 37 to be resolved at once.
