# MUV Dishwash Gel™ — Product Identity

---

## KO-DW-IDENT-001 — Parent Product Identity

- **KOID:** KO-DW-IDENT-001
- **Title:** MUV Dishwash Gel™ — Parent Product Identity
- **Category:** Product Identity
- **Tags:** [dishwash-gel, home-care, parent-product, identity]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx` (title: "MUV DISHWASH LIQUID GEL
  Production SOP"); `MUV_Product_Chart_with_USP (1)(1).pdf` (rows 9–11, product name "MUV
  Dishwash Gel")
- **Relationships:** KO-DW-VAR-001, KO-DW-VAR-002, KO-DW-VAR-003 (the three SKUs);
  KO-DW-NAME-001 (see `19_Canonical_Naming_Register.md` for the name discrepancy between sources)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Dishwash_Liquid_Gel_Production_SOP.docx`;
  `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

**Content:**

| Field | Value |
|---|---|
| Product Family Name (as charted) | MUV Dishwash Gel™ |
| Product Family Name (as titled in SOP) | MUV Dishwash Liquid Gel™ — see `19_Canonical_Naming_Register.md` |
| Product Category | Home Care (inferred from existing seed taxonomy — not confirmed) |
| Product Type | Dishwashing liquid gel |
| Number of Variants (fragrance/colour) | 1 (Lemon fragrance, Yellow colour — no named variants) |
| Number of SKUs (pack size) | 3 (500 ml, 1 L, 5 L) |
| Manufacturer | MUV Care Co. (inferred — SOP does not restate the company name the way the Liquid Detergent and Toilet Cleaner SOPs did; "MUV Care Co." heading was not found verbatim in this SOP's extracted text) |
| Batch Basis (as documented) | 10 Litre production batch |

**Not yet available (REQUIRES FOUNDER INPUT):**
- Confirmation of manufacturer name (not restated in this SOP, unlike the other two — see gap
  above)
- Formal brand positioning statement
- Product line launch date / market history
- SKU codes, barcodes
- HSN code and GST rate specific to this product

---

## KO-DW-IDENT-002 — Product Purpose

- **KOID:** KO-DW-IDENT-002
- **Title:** MUV Dishwash Gel™ — Product Purpose
- **Category:** Product Identity
- **Tags:** [dishwash-gel, purpose, function]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** Derived from the SOP's raw-material composition (a surfactant gel system — SLES,
  CAPB, CDEA, LABSA Slurry — with real, sourced QC criteria explicitly stating "Good foam and
  grease cleaning" as a pass criterion) — this is the one product family where the QC section
  itself corroborates the intended function, not just the ingredient list.
- **Relationships:** KO-DW-MFG-001, KO-DW-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx` (raw-material list + QC section)

**Content:**

MUV Dishwash Gel™ is formulated as a surfactant-based liquid gel intended for hand dishwashing —
removing grease and food soil from dishes/utensils. Unlike the other two product families
audited so far, this product's own QC section directly states a functional pass criterion
("Good foam and grease cleaning"), giving this purpose statement a firmer evidentiary basis than
was possible for Liquid Detergent or Toilet Cleaner.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Any comparative or superlative performance claim ("cuts grease faster," "gentle on hands," "1
  drop does more") — none appear in any source document
- Water hardness or dilution guidance for actual dishwashing use
- Suitability for dishwashing machines vs. hand-wash only (nothing in the source suggests
  machine use; this is a hand-dishwash-gel formulation by all indications, but this inference is
  not explicitly stated either)

---

## KO-DW-IDENT-003 — Customer Problems Solved

- **KOID:** KO-DW-IDENT-003
- **Title:** MUV Dishwash Gel™ — Customer Problems Solved
- **Category:** Product Identity
- **Tags:** [dishwash-gel, customer-problems, use-case]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document states customer problems explicitly.
- **Relationships:** KO-DW-IDENT-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source states which specific customer problems (greasy dishes,
hand dryness/skin-feel, value vs. established brands, fragrance preference) this product targets.

---

## KO-DW-IDENT-004 — Target Customers

- **KOID:** KO-DW-IDENT-004
- **Title:** MUV Dishwash Gel™ — Target Customers
- **Category:** Product Identity
- **Tags:** [dishwash-gel, target-customer, segments]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document defines a target customer.
- **Relationships:** none yet
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** The 5 L pack size (matching Liquid Detergent and Toilet Cleaner's
own largest size) is suggestive of institutional/bulk kitchen use alongside a household 500
ml/1 L pack — the platform's own `lib/inst-sales/consumption-rules.ts` even has a
`DISHWASH: (s) => s.kitchens * 8 Ltr/month` institutional-consumption formula (a real, code-
verified fact about platform capability) — but this package does not assert institutional
targeting as a confirmed fact, only notes the plausibility.

---

## KO-DW-IDENT-005 — Usage Scenarios

- **KOID:** KO-DW-IDENT-005
- **Title:** MUV Dishwash Gel™ — Usage Scenarios
- **Category:** Product Identity
- **Tags:** [dishwash-gel, usage-scenarios]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document describes specific usage scenarios beyond "dishwashing."
- **Relationships:** KO-DW-IDENT-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** Beyond "used to wash dishes/utensils by hand" (a safe inference from
formulation and QC criteria), no source describes dosage-per-wash, water volume, or specific
institutional kitchen protocol.
