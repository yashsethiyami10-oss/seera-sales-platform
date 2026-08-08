# MUV Crystal Glass Cleaner™ — Product Identity

---

## KO-GC-IDENT-001 — Parent Product Identity

- **KOID:** KO-GC-IDENT-001
- **Title:** MUV Crystal Glass Cleaner™ — Parent Product Identity
- **Category:** Product Identity
- **Tags:** [glass-cleaner, identity]
- **Version:** 1.0
- **Confidence:** HIGH (existence, pack size, price) / MEDIUM (category classification, inferred not stated)
- **Evidence:** Product Chart row 13; SOP title block
- **Relationships:** KO-GC-VAR-001, KO-GC-NAME-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 13; `MUV_Glass_Cleaner_Production_SOP_With_Photo_Rev1.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Name | MUV Crystal Glass Cleaner™ | Founder Instruction (direct, this task) |
| Source Name | "MUV Glass Cleaner" (both Product Chart and SOP; no "Crystal" in either) | HIGH |
| Category | Home Care (inferred — not explicitly labeled in either source; consistent with Bathroom Cleaner/Toilet Cleaner/Dishwash Gel's SOP folder, "SOPs/HOME CARE/") | MEDIUM |
| Manufacturer | REQUIRES FOUNDER INPUT — neither source restates a manufacturer/company name | N/A |
| Product Type | Liquid glass/mirror surface cleaner | HIGH (from formulation and QC criteria — "streak-free," "clear blue liquid") |
| Catalogue Status | Not yet in the online storefront catalogue (`prisma/seed.ts` has zero matching records) | HIGH |

---

## KO-GC-IDENT-002 — Product Purpose

- **KOID:** KO-GC-IDENT-002
- **Title:** MUV Crystal Glass Cleaner™ — Product Purpose
- **Category:** Product Identity
- **Tags:** [glass-cleaner, purpose]
- **Version:** 1.0
- **Confidence:** MEDIUM — inferred directly from QC criteria and raw materials, not a stated purpose passage
- **Evidence:** SOP Quality Control section ("Streak-free cleaning," "Fast drying")
- **Relationships:** KO-GC-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from KO-GC-QC-001

**Content:**

No source states a purpose/positioning sentence directly. What can be responsibly inferred from
the sourced QC criteria and formulation: a liquid cleaner intended for glass and mirror surfaces,
formulated for a streak-free, fast-drying finish. This is an inference from real QC language, not
an invented marketing claim — it should not be extended into performance claims (e.g. "removes
99% of grime") that aren't sourced.

---

## KO-GC-IDENT-003 — Customer Problems Solved

- **KOID:** KO-GC-IDENT-003
- **Title:** MUV Crystal Glass Cleaner™ — Customer Problems Solved
- **Category:** Product Identity
- **Tags:** [glass-cleaner, customer-problems]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source; only generically inferable from the QC language
- **Evidence:** SOP Quality Control section
- **Relationships:** KO-GC-IDENT-001, KO-GC-CRO-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source describes specific customer problems (fingerprints,
streaks, mineral spots, etc.) this product is positioned to solve. The Care Response Objects
(`16_Care_Response_Objects.md`) use generically real, common glass-cleaning scenarios
(fingerprints, mirror streaks) as CRO situations because they are self-evidently what a glass
cleaner is used for, not because any source specifically names them as MUV's positioning — this
distinction is preserved throughout the package.

---

## KO-GC-IDENT-004 — Target Customers

- **KOID:** KO-GC-IDENT-004
- **Title:** MUV Crystal Glass Cleaner™ — Target Customers
- **Category:** Product Identity
- **Tags:** [glass-cleaner, target-customer]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source
- **Evidence:** None
- **Relationships:** KO-GC-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source names a target customer segment. The institutional-sales
consumption formula in `lib/inst-sales/consumption-rules.ts` (floors × glass frontage + lobby
allowance) implies an institutional/commercial usage context exists as a real, wired business
rule, but this is a consumption-estimation formula, not a stated marketing target segment — it
should not be presented to a customer as an official "who this is for" statement.

---

## KO-GC-IDENT-005 — Usage Scenarios

- **KOID:** KO-GC-IDENT-005
- **Title:** MUV Crystal Glass Cleaner™ — Usage Scenarios
- **Category:** Product Identity
- **Tags:** [glass-cleaner, usage]
- **Version:** 1.0
- **Confidence:** LOW — not stated in any source as explicit usage scenarios
- **Evidence:** None
- **Relationships:** KO-GC-IDENT-001, KO-GC-CRO-001–006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source lists specific usage scenarios (home glass surfaces,
mirrors, office glass, car windows, shop displays). The Care Response Objects use these as
plausible, generically real glass-cleaning contexts to build customer-care behavior around, not
as MUV-confirmed marketing scenarios — a distinction preserved consistently across this package.
