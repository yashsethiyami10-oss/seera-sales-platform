# MUV Toilet Cleaner™ — Manufacturing Knowledge (Ingredients, Manufacturing, SOP)

> Shared by both SKUs. Nearly everything below is transcribed directly from the canonical
> Production SOP.

---

## KO-TC-MFG-001 — Raw Material List & Batch Formulation (10 L Batch)

- **KOID:** KO-TC-MFG-001
- **Title:** MUV Toilet Cleaner™ — Raw Material List, 10 Litre Batch
- **Category:** Manufacturing / Ingredient Knowledge
- **Tags:** [toilet-cleaner, manufacturing, formulation, raw-materials, batch, ingredients]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** Verbatim transcription of the SOP's material/instruction table.
- **Relationships:** KO-TC-MFG-002 (process steps), KO-TC-VAR-001/002 (SKU packaging)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Toilet_Cleaner_Final_Production_SOP.docx`

**Content — Formulation (single formulation, shared by both pack sizes), per 10 Litre batch:**

| Step | Material | Quantity | Instruction |
|---|---|---|---|
| 1 | Water | 7.8 L | Take 7.8 L clean water in the mixing tank |
| 2 | Acid Thickener | 300 ml | Add slowly into the batch and mix for 10 minutes |
| 3 | HCL | 2.5 L | Add slowly while stirring; mix for 5–7 minutes |
| 4 | Acid Blue Colour | 1.5 g | Dissolve in water first, then add to the batch |
| 5 | Perfume | 5 ml ("Harpic Floral") | Add slowly and mix the complete batch for 15 minutes |

**Raw material naming caveat (same discipline as the Liquid Detergent package):**
- "HCL" is the standard abbreviation for Hydrochloric Acid — this abbreviation is used as-is in
  the source SOP; no concentration/grade (e.g. % w/w) is stated.
- "Acid Thickener" and "Acid Blue Colour" are the generic trade names used in the source
  document — no INCI/chemical name, supplier, or concentration is given.
- "Perfume — 5 ml (Harpic Floral)" is transcribed exactly as written in the source. "Harpic" is
  a well-known third-party toilet-cleaner brand name; the source document uses it only as a
  *fragrance descriptor* (a common industry convention where a fragrance house names a scent
  profile after a recognizable market reference), not as an ingredient sourced from or
  associated with that brand. This package transcribes the source text verbatim without
  interpreting, expanding, or removing this descriptor — **REQUIRES FOUNDER INPUT** to confirm
  the actual fragrance supplier/product code and whether "Harpic Floral" is an internal
  shorthand that should not appear in any external-facing material.

This package deliberately does **not** expand "HCL," "Acid Thickener," or "Acid Blue Colour"
into asserted full chemical/INCI names, since the source document itself does not do so.

---

## KO-TC-MFG-002 — Manufacturing Process Steps

- **KOID:** KO-TC-MFG-002
- **Title:** MUV Toilet Cleaner™ — Process Steps & Mix Sequence
- **Category:** Manufacturing / Process
- **Tags:** [toilet-cleaner, manufacturing, process, sop]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** Verbatim from source SOP (same document as KO-TC-MFG-001)
- **Relationships:** KO-TC-MFG-001, KO-TC-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Toilet_Cleaner_Final_Production_SOP.docx`

**Content:**

The process is a fixed, sequential 5-step addition order into one mixing tank, per 10 L batch:

1. Base water charge (7.8 L).
2. Acid Thickener addition (10 min mix — the longest single mix step before the final stage).
3. HCL, added slowly with stirring (5–7 min mix).
4. Acid Blue Colour, pre-dissolved in water before addition (no separate mix time stated beyond
   the addition instruction itself).
5. Perfume, added slowly, with a full-batch mix of 15 minutes (the longest mix step in the whole
   process — longer than the equivalent final step in the Liquid Detergent SOP, which specifies
   5 minutes for its perfume-stage mix).

**No documented in-process quality checkpoint exists at any step** (contrast with Liquid
Detergent's Step 7 pH check, target ≈ 6) — see KO-TC-QC-001 for the explicit gap this creates.

**Order dependency:** per the same Knowledge Library governance principle already cited in the
Liquid Detergent package (`# final MUV Knowledge Library™.txt`, line ~5553): *"the exact
addition order and process steps for ... toilet cleaner ... must come from an approved SOP"* —
this 5-step order is treated as fixed, not a suggestion.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Mixing equipment specification (tank material, agitator type/speed, batch vessel capacity
  beyond "10 L batch")
- Temperature control requirements (none stated; ambient assumed but not confirmed)
- Any in-process sampling/hold point (none documented at all for this product — a real gap
  relative to Liquid Detergent, which at least has the pH checkpoint)

---

## KO-TC-MFG-003 — Batch Calculations & Scaling

- **KOID:** KO-TC-MFG-003
- **Title:** MUV Toilet Cleaner™ — Batch Scaling
- **Category:** Manufacturing / Batch Calculations
- **Tags:** [toilet-cleaner, batch-calculations, scaling]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** Arithmetic scaling of KO-TC-MFG-001's confirmed 10 L batch quantities — the
  scaling math itself is not a new fact; the assumption that this formulation scales linearly is
  not confirmed by any source.
- **Relationships:** KO-TC-MFG-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from `MUV_Toilet_Cleaner_Final_Production_SOP.docx`

**Content:**

The only batch size confirmed by the source SOP is **10 Litres**. No larger production-batch
recipe was found in any source document. As with Liquid Detergent, this package does not assert
that linear scaling to a larger batch is production-valid without Founder/technical
confirmation — **REQUIRES FOUNDER INPUT** before any scaled batch size is used in production.

**Additional caution specific to this formulation:** because this product's raw-material list
includes concentrated HCL (2.5 L per 10 L batch, i.e. 25% of batch volume as charged), any
scale-up should be treated as a genuine process-safety question, not just an arithmetic one — a
reason this package is especially deliberate about not asserting scaling validity beyond what's
sourced.

---

## KO-TC-MFG-004 — Critical Control Points

- **KOID:** KO-TC-MFG-004
- **Title:** MUV Toilet Cleaner™ — Critical Control Points
- **Category:** Manufacturing / Quality
- **Tags:** [toilet-cleaner, ccp, quality]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No CCP of any kind is documented in the source SOP (a genuine content gap, not
  an extraction failure — the document was read in full).
- **Relationships:** KO-TC-MFG-002, KO-TC-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** Unlike the Liquid Detergent SOP (which documents one CCP — a pH
target of ≈ 6), the Toilet Cleaner SOP documents **no critical control point at all**: no pH
target, no viscosity check, no colour/fragrance consistency check, no appearance standard. This
is flagged explicitly rather than silently omitted, since an acid-based formulation (HCL at 25%
of batch volume) would ordinarily be expected to have at least a pH/strength verification step
in a mature SOP.

---

## KO-TC-MFG-005 — Equipment

- **KOID:** KO-TC-MFG-005
- **Title:** MUV Toilet Cleaner™ — Manufacturing Equipment
- **Category:** Manufacturing / Equipment
- **Tags:** [toilet-cleaner, equipment]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None — the source SOP describes a "mixing tank" only.
- **Relationships:** KO-TC-MFG-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No equipment make/model, capacity, construction material (acid
resistance is a genuine practical concern for this formulation specifically), or agitator
specification was found.

---

## KO-TC-MFG-006 — Packaging Process

- **KOID:** KO-TC-MFG-006
- **Title:** MUV Toilet Cleaner™ — Packaging Process
- **Category:** Manufacturing / Packaging
- **Tags:** [toilet-cleaner, packaging]
- **Version:** 1.0
- **Confidence:** MEDIUM (weights only) / LOW (process)
- **Evidence:** "Finished Product Details" section of the source SOP gives per-pack net weight;
  no filling/capping/labelling process is described. Two embedded packaging photographs exist in
  the source docx but were not text-extractable.
- **Relationships:** KO-TC-VAR-001/002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Toilet_Cleaner_Final_Production_SOP.docx`

**Content:**

Confirmed finished-product weights (net weight, with bottle). Per FR-001/FR-002, MRP is not
stored as fact in this Manufacturing Knowledge Object — see `LIVE_DATA_MAPPING.md`:

| Pack Size | MRP | Net Weight (with bottle) | Packaging Reference |
|---|---|---|---|
| 500 ml | **LIVE — resolve from Product Catalog API** | 515 ml | "500 ml Bottle" (photo embedded in source, not extracted) |
| 5 L | **LIVE — resolve from Product Catalog API** | 5 L 20 ml | "5 L Can" (photo embedded in source, not extracted) |

Note the SOP names the 5 L container a **"Can,"** distinct from the 500 ml **"Bottle"** — this
package preserves that distinction verbatim rather than assuming identical packaging format
across both SKUs.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Bottle/can material/spec (given the acid content, container material compatibility is a real
  practical question, not just a labelling detail)
- Filling line process/equipment
- Labelling and batch-coding procedure
- Carton/case packing configuration for distribution
- Content of the two embedded packaging photographs (`word/media/image1.jpg`,
  `word/media/image2.png` inside the source docx) — not reviewed as part of this text-based
  research pass
