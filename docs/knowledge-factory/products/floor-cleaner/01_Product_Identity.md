# MUV Floor Cleaner™ — Product Identity

> Parent-level (shared) Knowledge Objects. These describe the family as a whole and apply to all
> three named variants equally, per the Variant Inheritance architecture (see
> `17_Variant_Inheritance_Map.md`). Variant-specific identity facts (colour, pricing) live in
> `02_Product_Family_and_Variants.md`, not here.

---

## KO-FC-IDENT-001 — Parent Product Identity

- **KOID:** KO-FC-IDENT-001
- **Title:** MUV Floor Cleaner™ — Parent Product Identity
- **Category:** Product Identity
- **Tags:** [floor-cleaner, identity, parent, shared]
- **Version:** 1.0
- **Confidence:** HIGH (existence, family structure) / MIXED (per-variant — see note)
- **Evidence:** Product Chart rows 14–17; SOP title block
- **Relationships:** KO-FC-FAM-001, KO-FC-NAME-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 14–17; `MUV_Floor_Cleaner_Production_SOP_With_Product_Photos.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Parent Name | MUV Floor Cleaner™ | HIGH — SOP title "MUV FLOOR CLEANER" |
| Official Variants (per Founder Instruction) | MUV Velvet Mist Floor Cleaner™, MUV Cloud Walk Floor Cleaner™, MUV Rose Water Floor Cleaner™ | Direct Founder Instruction (all three); **only Velvet Mist and Cloud Walk are additionally corroborated by the Product Chart and SOP — Rose Water has zero corroborating source** |
| Category | Home Care | MEDIUM — inferred, not explicitly labeled, consistent with the "SOPs/HOME CARE/" folder location |
| Manufacturer | REQUIRES FOUNDER INPUT | N/A |
| Product Type | Liquid floor surface cleaner | HIGH — from formulation and packing standard |
| Catalogue Status | Not yet in the online storefront catalogue (`prisma/seed.ts` has zero matching records) | HIGH |

---

## KO-FC-IDENT-002 — Product Purpose

- **KOID:** KO-FC-IDENT-002
- **Title:** MUV Floor Cleaner™ — Product Purpose
- **Category:** Product Identity
- **Tags:** [floor-cleaner, purpose, shared]
- **Version:** 1.0
- **Confidence:** MEDIUM — inferred from formulation and packing facts, no stated purpose passage
- **Evidence:** SOP Raw Materials/Process; Packing Standard
- **Relationships:** KO-FC-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from KO-FC-MFG-001/002

**Content:**

No source states a purpose/positioning sentence directly. What can responsibly be inferred: a
fragranced liquid floor surface cleaner sold in 1L and 5L packs, formulated with a
surfactant/silicone-emulsion base. This is an inference from real formulation and packing facts,
not an invented performance or marketing claim.

---

## KO-FC-IDENT-003 — Customer Problems Solved

- **KOID:** KO-FC-IDENT-003
- **Title:** MUV Floor Cleaner™ — Customer Problems Solved
- **Category:** Product Identity
- **Tags:** [floor-cleaner, customer-problems, shared]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source
- **Evidence:** None
- **Relationships:** KO-FC-IDENT-001, KO-FC-CRO-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source describes specific customer problems (sticky spills, bad
odour, everyday grime) this product family is positioned to solve. The Care Response Objects
(`16_Care_Response_Objects.md`) use generically real, common floor-cleaning scenarios as CRO
situations because they are self-evidently what a floor cleaner is used for, not because any
source specifically names them as MUV's positioning — this distinction is preserved throughout.

---

## KO-FC-IDENT-004 — Target Customers

- **KOID:** KO-FC-IDENT-004
- **Title:** MUV Floor Cleaner™ — Target Customers
- **Category:** Product Identity
- **Tags:** [floor-cleaner, target-customer, shared]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source
- **Evidence:** None
- **Relationships:** KO-FC-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source names a target customer segment. The institutional-sales
consumption formula in `lib/inst-sales/consumption-rules.ts` (`cleaningAreaSqft × 0.004 Ltr/sqft
× frequency factor`) implies a real, wired institutional/commercial usage context exists as a
business rule, but this is a consumption-estimation formula, not a stated marketing target
segment, and it is not variant-aware.

---

## KO-FC-IDENT-005 — Usage Scenarios

- **KOID:** KO-FC-IDENT-005
- **Title:** MUV Floor Cleaner™ — Usage Scenarios
- **Category:** Product Identity
- **Tags:** [floor-cleaner, usage, shared]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source
- **Evidence:** None
- **Relationships:** KO-FC-IDENT-001, KO-FC-CRO-001–009
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source lists specific usage scenarios. The Care Response Objects
use plausible, generically real floor-cleaning contexts (daily cleaning, spills, pet accidents,
festival cleaning) to build customer-care behavior around, not as MUV-confirmed marketing
scenarios.
