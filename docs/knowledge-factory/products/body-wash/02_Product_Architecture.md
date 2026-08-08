# MUV Body Wash™ — Product Architecture

> Includes the `FR-004`-required Variant Inheritance Map, embedded as a dedicated section (no
> standalone Variant Inheritance Map file was named in this task's file list).

---

## KO-BW-IDENT-001 — Parent Product Identity

- **KOID:** KO-BW-IDENT-001
- **Confidence:** HIGH (existence, formula, pack sizes, all 3 variants) / MEDIUM (category
  labeling — "Body Care" is directly given by the task instruction, not inferred from folder
  placement like most prior products, so actually HIGH here too) / N/A (manufacturer)
- **Evidence:** Product Chart rows 32–37; SOP title block; SOP filing location (BODY CARE)
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 32–37; `MUV_Body_Wash_SOP_10kg_1percent_Salicylic_Acid.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Parent Name | MUV Body Wash™ | HIGH — matches SOP title exactly |
| Official Variants | MUV Crimson Veil Body Wash, MUV Velvet Oak Body Wash, MUV Midnight Frost Body Wash | HIGH — all three have Chart rows and SOP Variant Matrix entries |
| Category | Body Care | HIGH — stated directly in the task instruction, corroborated by the SOP's own filing location (`SOPs/BODY CARE/`) |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | Salicylic-acid-active (1%), SLES/CAPB-based liquid body wash | HIGH — SOP Objective |
| Catalogue Status | Not yet in the online storefront catalogue under any of the three real variant names. **A different, non-matching product ("MUV Cleanse") does exist in `prisma/seed.ts`** — see `00_Source_Register.md` §5, never used as a source here. | HIGH |

---

## KO-BW-FAM-001 — Product Family Overview

- **KOID:** KO-BW-FAM-001
- **Confidence:** HIGH — all three variants fully and symmetrically sourced
- **Evidence:** Product Chart rows 32–37; SOP Variant Matrix
- **Source:** `00_Source_Register.md`

**Content:**

| Variant | Fragrance Family (sourced) | Pack Sizes | Sourcing Status |
|---|---|---|---|
| MUV Crimson Veil Body Wash™ | Premium Floral | 250ml, 950ml | **FULLY SOURCED** |
| MUV Velvet Oak Body Wash™ | Woody Premium | 250ml, 950ml | **FULLY SOURCED** |
| MUV Midnight Frost Body Wash™ | Fresh Cooling | 250ml, 950ml | **FULLY SOURCED** |

**Unlike Floor Cleaner's Rose Water, all three named variants here have real, symmetric source
coverage** — every one has both pack sizes confirmed in the Product Chart and an explicit
fragrance-family label in the SOP's Variant Matrix. No variant is "named but unsourced."

**Shared base formula** (one 10kg-batch SOP covers all three variants — see
`03_Product_Intelligence.md`/manufacturing detail): identical raw materials, identical 12-step
process except Step 9 (fragrance), identical QC criteria, identical pack-size structure. **The
single variant-specific override point in the entire formula is fragrance** — colour is shared
across all three variants (a real, sourced structural difference from Floor Cleaner, where
colour was the override).

---

## KO-BW-INHERIT-001 — Variant Inheritance Map (per `FR-004`)

- **KOID:** KO-BW-INHERIT-001
- **Confidence:** HIGH — directly derived from the shared SOP's own structure
- **Evidence:** SOP full structure (§1–§6); `00_Source_Register.md`

**Content:**

### Principle

Per `FR-004`: shared knowledge exists exactly once at Parent level; only genuinely
variant-specific knowledge (here: fragrance identity) exists in Variant Knowledge Objects. The
source material makes this unusually clean: **one SOP, one raw materials table, one 12-step
process, with exactly ONE variant-specific line** (Step 9 — fragrance addition).

### Parent Knowledge Objects (shared, exist exactly once)

> This package follows the consolidated file structure established for Pure Bleach/Black
> Phenyl/White Phenyl (`02_Product_Architecture.md` / `03_Product_Intelligence.md` / etc.), not
> Floor Cleaner's earlier, more subdivided structure (which had separate Manufacturing SOP/QC/
> Sales Intelligence/Support files) — formulation, process, QC, packaging, storage, and shelf-
> life facts all live inside `03_Product_Intelligence.md`'s Knowledge Objects, and AI-response
> guidance lives inside `06_FAQs.md`, rather than in separate dedicated files/KOIDs.

```
MUV Body Wash™ (Parent)
│
├─ KO-BW-IDENT-001 ................ Product Identity (family-level)
├─ KO-BW-FAM-001 .................. Product Family Overview
├─ KO-BW-INHERIT-001 .............. This Variant Inheritance Map
├─ KO-BW-NAME-001 ................. Canonical Naming
├─ KO-BW-INTEL-001–007 ............ Purpose, cleansing mechanism, benefits, skin types, usage,
│                                    ingredients (shared formula, minus fragrance), active
│                                    ingredient — all shared across variants
├─ KO-BW-INTEL-009–015 ............ Packaging structure, storage, shelf life, limitations,
│                                    safety summary, contraindications, customer expectations —
│                                    all shared across variants
├─ KO-BW-SAFETY-001–010 ........... Safety & Risk (documents total absence — the most severe
│                                    gap of any product this session)
├─ KO-BW-FAQ-001/002 .............. Customer FAQs and AI Response Guidance (family-level)
├─ KO-BW-OBJ-001–008 .............. Objection Handling (family-level)
├─ KO-BW-DT-001/002/003/004 ....... Parent Decision Trees
├─ KO-BW-DT-COMPARE-001 ........... Cross-variant factual comparison table
└─ KO-BW-CONV-001–012 ............. Parent Customer Conversation flows (all 12 required flows)
```

**KO-BW-INTEL-008 (Fragrance Characteristics) is the one Parent-level Knowledge Object that
directly documents the variant-specific override itself** — it states all three variants'
fragrance-family labels together as the single sourced point of difference, functioning as the
bridge between the Parent-level formula and the Variant-level KOs below.

### Inheritance by Variant

| Variant | Inherits Parent KOs? | Overrides / Variant-Specific Additions |
|---|---|---|
| **MUV Crimson Veil Body Wash™** | **YES — confirmed.** Sourced from the same shared SOP as the other two; inherits all Parent-level KOs without modification. | KO-BW-CV-VAR-001 (250ml SKU: Premium Floral fragrance), KO-BW-CV-VAR-002 (950ml SKU: Premium Floral fragrance), KO-BW-DT-CV-001 (variant recommendation logic) |
| **MUV Velvet Oak Body Wash™** | **YES — confirmed.** Same basis. | KO-BW-VO-VAR-001 (250ml SKU: Woody Premium fragrance), KO-BW-VO-VAR-002 (950ml SKU: Woody Premium fragrance), KO-BW-DT-VO-001 |
| **MUV Midnight Frost Body Wash™** | **YES — confirmed.** Same basis. | KO-BW-MF-VAR-001 (250ml SKU: Fresh Cooling fragrance), KO-BW-MF-VAR-002 (950ml SKU: Fresh Cooling fragrance), KO-BW-DT-MF-001 |

### The single override point, precisely

> SOP Step 9: **"Add the required fragrance (Crimson Veil / Velvet Oak / Midnight Frost)."**

Every other Parent-level fact (raw material quantities, the other 11 process steps, fill/pack
structure, the shared Colour line item, QC criteria) is identical across all three variants.
Colour is explicitly **not** a variant override here — the Variant Matrix has no colour column,
and the Formula table's Colour line is a single shared entry, unlike Floor Cleaner where colour
was the override point. This package does not invent a per-variant colour.

### What is genuinely NOT known per variant (never invented)

No source states fragrance notes (top/heart/base), sensory descriptions, or emotional/lifestyle
positioning for any of the three variants beyond their two-word fragrance-family label. See
`04_Decision_Trees.md`'s Variant Intelligence section for how this is handled in
recommendation logic.

---

## KO-BW-CV-VAR-001 — Crimson Veil, 250ml

- **KOID:** KO-BW-CV-VAR-001
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 32; SOP Variant Matrix
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 32; `MUV_Body_Wash_SOP_10kg_1percent_Salicylic_Acid.docx`

| Field | Value |
|---|---|
| Fragrance Family | Premium Floral (sourced) |
| Colour | Shared/generic across all variants — not variant-specific (see KO-BW-INHERIT-001) |
| Pack Size | 250ml |
| Pricing (MRP) | **Commercial data — never stored here.** See `10_LIVE_DATA_MAPPING.md`. Historical Chart citation recorded only in `00_Source_Register.md`. |
| Fill Weight | Not stated |
| SKU Code / Barcode / Dimensions / Shipping Weight | Not stated |
| Product Images | No embedded photo exists in the source SOP |

---

## KO-BW-CV-VAR-002 — Crimson Veil, 950ml

- **KOID:** KO-BW-CV-VAR-002
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 33; SOP Variant Matrix

| Field | Value |
|---|---|
| Fragrance Family | Premium Floral (sourced) |
| Pack Size | 950ml |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Same as KO-BW-CV-VAR-001 — not stated |

---

## KO-BW-VO-VAR-001 — Velvet Oak, 250ml

- **KOID:** KO-BW-VO-VAR-001
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 34; SOP Variant Matrix

| Field | Value |
|---|---|
| Fragrance Family | Woody Premium (sourced) |
| Pack Size | 250ml |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-BW-VO-VAR-002 — Velvet Oak, 950ml

- **KOID:** KO-BW-VO-VAR-002
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 35; SOP Variant Matrix

| Field | Value |
|---|---|
| Fragrance Family | Woody Premium (sourced) |
| Pack Size | 950ml |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-BW-MF-VAR-001 — Midnight Frost, 250ml

- **KOID:** KO-BW-MF-VAR-001
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 36; SOP Variant Matrix

| Field | Value |
|---|---|
| Fragrance Family | Fresh Cooling (sourced) |
| Pack Size | 250ml |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-BW-MF-VAR-002 — Midnight Frost, 950ml

- **KOID:** KO-BW-MF-VAR-002
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 37; SOP Variant Matrix

| Field | Value |
|---|---|
| Fragrance Family | Fresh Cooling (sourced) |
| Pack Size | 950ml |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-BW-NAME-001 — Canonical Naming

- **KOID:** KO-BW-NAME-001
- **Confidence:** HIGH — official parent and all three variant names match sources exactly
- **Evidence:** `00_Source_Register.md`

**Content:**

| Field | Value |
|---|---|
| Official Parent Name | MUV Body Wash™ |
| Official Variant Names | MUV Crimson Veil Body Wash™, MUV Velvet Oak Body Wash™, MUV Midnight Frost Body Wash™ |
| Source Names | All four names (parent + 3 variants) match the Product Chart and SOP exactly — no naming discrepancy this time, the same clean situation as Floor Cleaner's Velvet Mist/Cloud Walk |
| Forbidden/Legacy Names | None — no discrepancy to record. **"MUV Cleanse" is explicitly NOT a legacy or alternate name for any of these three variants** — it is a separate, non-matching seed-data placeholder (see `00_Source_Register.md` §5) and must never be conflated with this Product Family. |
