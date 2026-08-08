# MUV Floor Cleaner™ — Product Family & Variants

> **This is the first Product Family with three named fragrance variants under one parent.**
> Per this task's explicit instruction, these are NOT separate products — one Product Family,
> three variants. Two variants (Velvet Mist, Cloud Walk) are fully corroborated by the Product
> Chart and the Production SOP. **The third (Rose Water) is named directly by the Founder but
> has zero corroborating source material anywhere** — its existence and name are treated as real
> per Source Authority #2 (Founder Instructions), but every other attribute is unsourced and
> marked REQUIRES FOUNDER INPUT. See `17_Variant_Inheritance_Map.md` for the full shared-vs-
> variant-specific knowledge structure.

---

## KO-FC-FAM-001 — Product Family Overview

- **KOID:** KO-FC-FAM-001
- **Title:** MUV Floor Cleaner™ — Product Family Overview
- **Category:** Product Family / Variants
- **Tags:** [floor-cleaner, family, variants]
- **Version:** 1.0
- **Confidence:** MIXED — family structure HIGH; individual variant sourcing status varies
- **Evidence:** Product Chart rows 14–17; SOP Product Reference section
- **Relationships:** KO-FC-IDENT-001, KO-FC-VM-VAR-001, KO-FC-CW-VAR-001, KO-FC-RW-VAR-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Product Chart; Production SOP; direct Founder Instruction (variant naming)

**Content:**

| Variant | Existence Confirmed By | Colour | Pack Sizes Found | Sourcing Status |
|---|---|---|---|---|
| MUV Velvet Mist Floor Cleaner™ | Product Chart (2 rows) + SOP (2 photos, colour line) | Lavender | 1L, 5L | **FULLY SOURCED** |
| MUV Cloud Walk Floor Cleaner™ | Product Chart (2 rows) + SOP (2 photos, colour line) | Blue | 1L, 5L | **FULLY SOURCED** |
| MUV Rose Water Floor Cleaner™ | Direct Founder Instruction only | REQUIRES FOUNDER INPUT — not sourced | None found | **NAMED BUT UNSOURCED — REQUIRES FOUNDER INPUT for formulation, colour, fragrance, packaging, and pricing** |

**Shared base formula/process** (one 10L-batch SOP covers Velvet Mist and Cloud Walk together —
see `06_Manufacturing_SOP.md`): identical raw materials, identical process steps, identical fill
weights, identical packing standard MRP line — the **only** variant-specific line in the entire
SOP is the colour-addition step ("Blue for Cloud Walk / Lavender for Velvet Mist").

---

## KO-FC-VM-VAR-001 — Velvet Mist, 1 Litre

- **KOID:** KO-FC-VM-VAR-001
- **Title:** MUV Velvet Mist Floor Cleaner™ — 1 Litre SKU
- **Category:** Product Family / Variant SKU
- **Tags:** [floor-cleaner, velvet-mist, 1l, sku]
- **Version:** 1.0
- **Confidence:** HIGH — sourced and agreeing across both sources
- **Evidence:** Product Chart row 14; SOP Packing Standard
- **Relationships:** KO-FC-FAM-001, KO-FC-MFG-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Product Chart row 14; SOP Packing Standard table

| Field | Value |
|---|---|
| Colour | Lavender (per SOP Step 5) |
| Fragrance | Present in formulation (100g "Fragrance" per 10L batch, shared across variants) but **not specifically named** for Velvet Mist beyond the variant name itself |
| Fill Weight | 1015 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| SKU Code / Barcode / Dimensions / Shipping Weight | REQUIRES FOUNDER INPUT |

---

## KO-FC-VM-VAR-002 — Velvet Mist, 5 Litres

- **KOID:** KO-FC-VM-VAR-002
- **Title:** MUV Velvet Mist Floor Cleaner™ — 5 Litre SKU
- **Category:** Product Family / Variant SKU
- **Tags:** [floor-cleaner, velvet-mist, 5l, sku]
- **Version:** 1.0
- **Confidence:** MIXED — existence and fill weight HIGH; pricing CONFLICTED
- **Evidence:** Product Chart row 16; SOP Packing Standard
- **Relationships:** KO-FC-FAM-001, KO-FC-MFG-001, `20_Source_Conflict_Register.md` CONFLICT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review; **pricing field BLOCKED pending Founder decision**
- **Review Date:** Upon Founder approval / conflict resolution
- **Source:** Product Chart row 16; SOP Packing Standard table

| Field | Value |
|---|---|
| Colour | Lavender (per SOP Step 5) |
| Fragrance | Not specifically named beyond the variant name |
| Fill Weight | 5020 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`).** A historical Chart-vs-SOP pricing discrepancy for this SKU was recorded during source audit — see `20_Source_Conflict_Register.md` CONFLICT-001 — but that is a historical citation only, never a live AI-facing fact; the live catalog value (once this variant is catalogued) is the sole current source. |
| SKU Code / Barcode / Dimensions / Shipping Weight | REQUIRES FOUNDER INPUT |

---

## KO-FC-CW-VAR-001 — Cloud Walk, 1 Litre

- **KOID:** KO-FC-CW-VAR-001
- **Title:** MUV Cloud Walk Floor Cleaner™ — 1 Litre SKU
- **Category:** Product Family / Variant SKU
- **Tags:** [floor-cleaner, cloud-walk, 1l, sku]
- **Version:** 1.0
- **Confidence:** HIGH — sourced and agreeing across both sources
- **Evidence:** Product Chart row 15; SOP Packing Standard
- **Relationships:** KO-FC-FAM-001, KO-FC-MFG-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Product Chart row 15; SOP Packing Standard table

| Field | Value |
|---|---|
| Colour | Blue (per SOP Step 5) |
| Fragrance | Not specifically named beyond the variant name |
| Fill Weight | 1015 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| SKU Code / Barcode / Dimensions / Shipping Weight | REQUIRES FOUNDER INPUT |

---

## KO-FC-CW-VAR-002 — Cloud Walk, 5 Litres

- **KOID:** KO-FC-CW-VAR-002
- **Title:** MUV Cloud Walk Floor Cleaner™ — 5 Litre SKU
- **Category:** Product Family / Variant SKU
- **Tags:** [floor-cleaner, cloud-walk, 5l, sku]
- **Version:** 1.0
- **Confidence:** MIXED — existence and fill weight HIGH; pricing CONFLICTED (larger gap than Velvet Mist)
- **Evidence:** Product Chart row 17; SOP Packing Standard
- **Relationships:** KO-FC-FAM-001, KO-FC-MFG-001, `20_Source_Conflict_Register.md` CONFLICT-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review; **pricing field BLOCKED pending Founder decision**
- **Review Date:** Upon Founder approval / conflict resolution
- **Source:** Product Chart row 17; SOP Packing Standard table

| Field | Value |
|---|---|
| Colour | Blue (per SOP Step 5) |
| Fragrance | Not specifically named beyond the variant name |
| Fill Weight | 5020 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`).** A historical Chart-vs-SOP pricing discrepancy for this SKU was recorded during source audit — see `20_Source_Conflict_Register.md` CONFLICT-002 — but that is a historical citation only, never a live AI-facing fact; the live catalog value (once this variant is catalogued) is the sole current source. |
| SKU Code / Barcode / Dimensions / Shipping Weight | REQUIRES FOUNDER INPUT |

---

## KO-FC-RW-VAR-001 — Rose Water (NAMED BUT UNSOURCED)

- **KOID:** KO-FC-RW-VAR-001
- **Title:** MUV Rose Water Floor Cleaner™ — Variant Record (Unsourced)
- **Category:** Product Family / Variant SKU
- **Tags:** [floor-cleaner, rose-water, unsourced, founder-named]
- **Version:** 1.0
- **Confidence:** N/A for every attribute except the name itself, which is HIGH (direct Founder Instruction)
- **Evidence:** None found in Product Chart, SOP, Knowledge Library, or any other repository source
- **Relationships:** KO-FC-FAM-001, KO-FC-NAME-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** **NAMED BUT UNSOURCED — REQUIRES FOUNDER INPUT for all formulation,
  colour, fragrance, packaging, and pricing facts before this variant can be manufactured, QC'd,
  or sold**
- **Review Date:** Upon Founder input
- **Source:** Direct Founder Instruction (name and family membership only)

**Content:**

**This variant's name and its membership in the MUV Floor Cleaner™ family are confirmed** — the
Founder directly instructed this task to treat "MUV Rose Water Floor Cleaner™" as an Official
Variant, and per the Source Authority order, a direct Founder Instruction (authority #2) is a
real, usable source for that specific fact. **But no other fact about this variant exists
anywhere in this repository:**

| Field | Value |
|---|---|
| Colour | REQUIRES FOUNDER INPUT — not sourced |
| Fragrance identity | REQUIRES FOUNDER INPUT — not sourced (rose water is implied by the name, but no source confirms a rose-water-derived fragrance ingredient, concentration, or supplier) |
| Pack Sizes | REQUIRES FOUNDER INPUT — no source lists any Rose Water pack size at all |
| Pricing | REQUIRES FOUNDER INPUT — no Product Chart row, no SOP reference |
| Formulation | REQUIRES FOUNDER INPUT — no raw materials list exists for this variant; it is **not** safe to assume the shared Velvet Mist/Cloud Walk base formula applies until the Founder confirms it |
| Fill Weight | REQUIRES FOUNDER INPUT |

**This package does not assume the shared Velvet Mist/Cloud Walk base formula automatically
extends to Rose Water.** Variant Inheritance (see `17_Variant_Inheritance_Map.md`) governs how
*sourced* variant-specific facts override *sourced* parent-level facts — it is not a license to
assume an unsourced variant inherits everything by default. Rose Water's actual relationship to
the shared base formula is itself an open question for the Founder to confirm.
