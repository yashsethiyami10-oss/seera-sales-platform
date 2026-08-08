# MUV Liquid Detergent™ — Manufacturing Knowledge

> Shared by all six SKUs. This is the single most source-grounded file in this package — nearly
> everything below is transcribed directly from the canonical Production SOP, not inferred.

---

## KO-LD-MFG-001 — Raw Material List & Batch Formulation (10 L Batch)

- **KOID:** KO-LD-MFG-001
- **Title:** MUV Liquid Detergent™ — Raw Material List, 10 Litre Batch
- **Category:** Manufacturing / Ingredient Knowledge
- **Tags:** [liquid-detergent, manufacturing, formulation, raw-materials, batch]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** Verbatim transcription of the SOP's material/instruction table.
- **Relationships:** KO-LD-MFG-002 (process steps), KO-LD-MFG-003 (batch scaling),
  KO-LD-VAR-001/002/003 (variant colour/fragrance overrides)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/FABRIC CARE/MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`

**Content — Base Formulation (shared by all three variants), per 10 Litre batch:**

| Step | Material | Quantity | Instruction |
|---|---|---|---|
| 1 | Water | 8.5 L | Take 8.5 L clean water in the mixing tank |
| 2 | Caustic Soda | 55 g | Add slowly and mix for 2 minutes |
| 3 | Soda | 100 g | Dissolve in water separately, add to batch and mix for 5 minutes |
| 4 | Slurry | 500 g | Add slowly while stirring; mix for 2–3 minutes |
| 5 | SLES | 2.1 L | Add slowly and mix for 10 minutes |
| 6 | CAPB | 180 g | Add and mix for 3–4 minutes |
| 7 | CDEA | 90 g | Add and mix for 3–4 minutes; check pH (target ≈ 6) |
| 8 | Phenoxyethanol | 40 g | Add and mix for 2–3 minutes |
| 9 | Colour | 1.5 g | Variant-specific — see `10_Product_Variants.md` |
| 10 | Perfume | variant-specific volume | Variant-specific — see `10_Product_Variants.md`; mix for 5 minutes |
| 11 | Salt | 120 g | Dissolve in water, add at the end and mix for 10 minutes |

**Raw material abbreviation key (as used in the source SOP; full chemical/INCI names not stated
in the source):**
- SLES — likely refers to Sodium Laureth Sulfate (a common detergent surfactant class), but the
  source document uses only the abbreviation "SLES" and does not spell out the full chemical
  name or specify concentration/grade — **REQUIRES FOUNDER INPUT** to confirm officially before
  this is stated as fact in any customer- or regulator-facing material.
- CAPB — likely refers to Cocamidopropyl Betaine, a common co-surfactant — same caveat as above,
  **REQUIRES FOUNDER INPUT** to confirm.
- CDEA — likely refers to Cocamide Diethanolamine (a foam booster/thickener), same caveat —
  **REQUIRES FOUNDER INPUT** to confirm.
- "Slurry" and "Soda" are used as-is in the source without further specification of exact
  chemical identity/grade — **REQUIRES FOUNDER INPUT**.

This package deliberately does **not** expand these abbreviations into asserted full chemical
names, since the source document itself does not do so and inventing the expansion would violate
the No Hallucination Rule.

---

## KO-LD-MFG-002 — Manufacturing Process Steps

- **KOID:** KO-LD-MFG-002
- **Title:** MUV Liquid Detergent™ — Process Steps & Mix Sequence
- **Category:** Manufacturing / Process
- **Tags:** [liquid-detergent, manufacturing, process, sop]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** Verbatim from source SOP (same document as KO-LD-MFG-001)
- **Relationships:** KO-LD-MFG-001, KO-LD-MFG-004 (critical control points)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`

**Content:**

The process is a fixed, sequential 11-step addition order into one mixing tank, per 10 L batch:

1. Base water charge (8.5 L).
2. Caustic Soda addition (2 min mix).
3. Soda, pre-dissolved separately before addition (5 min mix).
4. Slurry, added slowly with stirring (2–3 min mix).
5. SLES, added slowly (10 min mix — the longest single mix step in the process).
6. CAPB (3–4 min mix).
7. CDEA (3–4 min mix) — **this is the designated pH checkpoint, target ≈ 6.**
8. Phenoxyethanol (2–3 min mix).
9. Colour, variant-specific (no separate mix time stated for this step beyond what's captured
   with Perfume below).
10. Perfume, variant-specific (5 min mix).
11. Salt, pre-dissolved in water, added last (10 min mix — final thickening/viscosity-adjustment
    step, standard for this detergent chemistry class, though the SOP does not explicitly label
    it as a viscosity step).

**Order dependency:** the source's own Knowledge Library governance text (see
`.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge
Library™.txt`, line ~5553) explicitly states: *"the exact addition order and process steps for
... liquid detergent ... must come from an approved SOP"* — this package treats the above
11-step order as fixed and non-substitutable, not a suggestion.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Mixing equipment specification (tank material, agitator type/speed, batch vessel capacity
  beyond "10 L batch")
- Temperature control requirements (none stated in source — ambient assumed but not confirmed)
- In-process sampling/hold points beyond the single pH check at Step 7

---

## KO-LD-MFG-003 — Batch Calculations & Scaling

- **KOID:** KO-LD-MFG-003
- **Title:** MUV Liquid Detergent™ — Batch Scaling
- **Category:** Manufacturing / Batch Calculations
- **Tags:** [liquid-detergent, batch-calculations, scaling]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** Arithmetic scaling of KO-LD-MFG-001's confirmed 10 L batch quantities — the
  scaling itself is simple proportional math, not a new fact; the *underlying assumption that
  this formulation scales linearly* is not confirmed by any source and is flagged.
- **Relationships:** KO-LD-MFG-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`

**Content:**

The only batch size confirmed by the source SOP is **10 Litres**. No larger production-batch
recipe (e.g. 50 L, 100 L, 500 L industrial batch) was found in any source document.

Linear scaling of the 10 L recipe is mathematically straightforward (e.g. a 50 L batch would be
5× every quantity in KO-LD-MFG-001), but **this package does not assert that linear scaling is
production-valid** — real-world batch chemistry (mixing efficiency, heat generation, foam
control, tank geometry) does not always scale linearly, and no source document confirms this
formulation has been validated at any scale other than 10 L. **REQUIRES FOUNDER INPUT** before
any scaled batch size is used in production or documented as validated.

---

## KO-LD-MFG-004 — Critical Control Points

- **KOID:** KO-LD-MFG-004
- **Title:** MUV Liquid Detergent™ — Critical Control Points
- **Category:** Manufacturing / Quality
- **Tags:** [liquid-detergent, ccp, quality, ph]
- **Version:** 1.0
- **Confidence:** HIGH (for the one CCP the source states) / LOW (for anything beyond it)
- **Evidence:** Verbatim from source SOP
- **Relationships:** KO-LD-MFG-002, KO-LD-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`

**Content:**

The **only** critical control point explicitly documented in the source SOP is:

- **pH check at Step 7** (after CDEA addition), **target ≈ pH 6.**

No pass/fail range is given (only a target point value, "≈ 6"), no corrective action is
specified if pH is out of range, and no other in-process checks (viscosity, appearance, foam
height, colour match, fragrance intensity) are documented anywhere in the source.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Acceptable pH range (not just a target point)
- Corrective action procedure if pH is out of range
- Any other in-process CCP (viscosity, clarity, colour consistency, fragrance strength)
- Equipment calibration requirements for the pH measurement itself

---

## KO-LD-MFG-005 — Equipment

- **KOID:** KO-LD-MFG-005
- **Title:** MUV Liquid Detergent™ — Manufacturing Equipment
- **Category:** Manufacturing / Equipment
- **Tags:** [liquid-detergent, equipment]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None — the source SOP describes a "mixing tank" only, with no equipment
  specification.
- **Relationships:** KO-LD-MFG-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** The SOP refers only to "the mixing tank" with no make/model,
capacity, material of construction (e.g. stainless steel grade), agitator type, or motor
specification. No separate equipment list or SOP was found in the source documents folder for
this product line.

---

## KO-LD-MFG-006 — Packaging Process

- **KOID:** KO-LD-MFG-006
- **Title:** MUV Liquid Detergent™ — Packaging Process
- **Category:** Manufacturing / Packaging
- **Tags:** [liquid-detergent, packaging]
- **Version:** 1.0
- **Confidence:** MEDIUM (weights only) / LOW (process)
- **Evidence:** "Finished Product Details" section of the source SOP gives per-pack weight; no
  filling/capping/labelling process is described.
- **Relationships:** KO-LD-VAR-001/002/003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`

**Content:**

Confirmed finished-product weights (with bottle), applicable to all three variants:

| Pack Size | MRP (SOP) | Product Weight (with bottle) |
|---|---|---|
| 1 Litre | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | 1020 g |
| 5 Litre | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | 5100 g |

Note: the SOP also stated MRP figures. Those figures are a **historical source citation only
(recorded during source audit) — NOT a live commercial value** — see `KO-LD-CONFLICT-001` in
`10_Product_Variants.md` for the Cool Water pricing discrepancy against the Product Chart. Per
FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never from
this SOP figure. Product weight (a physical, non-commercial fact) is unaffected and remains
stated here as-is.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Bottle material/spec (PET grade, cap type, tamper-evidence, label material)
- Filling line process/equipment
- Labelling and batch-coding procedure
- Carton/case packing configuration for distribution
