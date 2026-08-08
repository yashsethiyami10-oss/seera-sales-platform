# MUV Liquid Detergent™ — Product Identity

> **Product Family Status:** ONE parent product, THREE fragrance variants, TWO pack sizes each
> (six SKUs total). This file documents identity knowledge shared by all six SKUs. Variant-only
> facts (fragrance, colour, pack size, pricing) live in `10_Product_Variants.md` — never repeated
> here.

---

## KO-LD-IDENT-001 — Parent Product Identity

- **KOID:** KO-LD-IDENT-001
- **Title:** MUV Liquid Detergent™ — Parent Product Identity
- **Category:** Product Identity
- **Tags:** [liquid-detergent, fabric-care, parent-product, identity]
- **Version:** 1.0
- **Confidence:** HIGH
- **Evidence:** `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx` (document title: "Liquid
  Detergent - Final Production SOP (10 L Batch)"); `MUV_Product_Chart_with_USP (1)(1).pdf`
  (rows 1–6, product names all begin "MUV ... Liquid Detergent")
- **Relationships:** KO-LD-VAR-001, KO-LD-VAR-002, KO-LD-VAR-003 (the three variants)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/FABRIC CARE/MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`;
  `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

**Content:**

| Field | Value |
|---|---|
| Product Family Name | MUV Liquid Detergent™ |
| Product Category | Fabric Care |
| Catalogue Category (platform) | `Fabric Care` (slug: `fabric-care`) |
| Product Type | Laundry liquid detergent |
| Number of Variants | 3 (Lavender Garden, Indian Rose, Cool Water) |
| Number of SKUs | 6 (each variant × 1 Litre / 5 Litre) |
| Manufacturer | MUV Care Co. |
| Batch Basis (as documented) | 10 Litre production batch |

**Not yet available (REQUIRES FOUNDER INPUT):**
- Formal brand positioning statement for the Liquid Detergent family specifically
- Product line launch date / market history
- SKU codes (no product code system was found for these variants anywhere in the repo)
- Barcode/EAN numbers
- HSN code and GST rate specific to this product (the seeded but unrelated "MUV Renew" product
  uses HSN `3402` / GST `18%` for a liquid detergent — this may be a reasonable HSN/GST
  reference for the same product category, but it is not confirmed as this product's own
  classification and must not be asserted as fact without Founder confirmation)

---

## KO-LD-IDENT-002 — Product Purpose

- **KOID:** KO-LD-IDENT-002
- **Title:** MUV Liquid Detergent™ — Product Purpose
- **Category:** Product Identity
- **Tags:** [liquid-detergent, purpose, function]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** Derived from the SOP's raw-material composition (surfactant system: SLES, CAPB,
  CDEA — see `03_Manufacturing.md`, KO-LD-MFG-001) and standard, undisputed function of a liquid
  laundry detergent formulated with those materials. No separate "purpose statement" document
  was found.
- **Relationships:** KO-LD-MFG-001, KO-LD-IDENT-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Inferred from `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx`'s raw-material
  list. Marked MEDIUM confidence because the purpose statement itself is not verbatim from a
  source document — it is a reasonable, standard description of what this formulation class
  does, not a founder-authored claim.

**Content:**

MUV Liquid Detergent™ is formulated as a liquid laundry cleaning product intended to remove
soil, stains, and odour from fabric during washing. The formulation is a surfactant-based liquid
system (see `03_Manufacturing.md` for the full raw-material list) combined with a fragrance and
colour identity unique to each of the three variants.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Any specific performance claim (e.g. "removes 99% of stains," "works in cold water," "safe for
  all fabric types") — none of these appear in any source document found, and none may be
  asserted without Founder-approved, evidence-backed language
- Intended machine type (top-load / front-load / hand-wash) — not stated in the SOP
- Water hardness or dosage-per-load guidance beyond what may exist on retail packaging (not
  found in the repo)

---

## KO-LD-IDENT-003 — Customer Problems Solved

- **KOID:** KO-LD-IDENT-003
- **Title:** MUV Liquid Detergent™ — Customer Problems Solved
- **Category:** Product Identity
- **Tags:** [liquid-detergent, customer-problems, use-case]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document states customer problems explicitly for this product.
- **Relationships:** KO-LD-IDENT-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No source document in this repository states which specific
customer problems (e.g. tough stains, sensitive skin, fragrance longevity, hard water
performance, value-for-money positioning vs. competitors) this product is meant to solve. This
must not be inferred or invented — it should come from the Founder, marketing brief, or a
customer-research source once available.

---

## KO-LD-IDENT-004 — Target Customers

- **KOID:** KO-LD-IDENT-004
- **Title:** MUV Liquid Detergent™ — Target Customers
- **Category:** Product Identity
- **Tags:** [liquid-detergent, target-customer, segments]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document defines a target customer for this product specifically.
- **Relationships:** none yet
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No document defines the intended customer segment(s) — household
type, income bracket, D2C vs. institutional buyer, geography, or channel — for this product. The
platform's own commerce data model supports both direct (`Customer`) and institutional
(`InstOpportunity`/`InstLead`) buyers, so this product may plausibly serve both, but no source
confirms which segment(s) this specific product targets. Must not be guessed.

---

## KO-LD-IDENT-005 — Usage Scenarios

- **KOID:** KO-LD-IDENT-005
- **Title:** MUV Liquid Detergent™ — Usage Scenarios
- **Category:** Product Identity
- **Tags:** [liquid-detergent, usage-scenarios]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** No source document describes specific usage scenarios beyond the general
  category of "laundry detergent."
- **Relationships:** KO-LD-IDENT-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** Beyond "used to wash fabric/clothing" (a safe inference from the
product category and formulation), no source document describes specific usage scenarios (e.g.
daily household wash, institutional/commercial laundry, specific fabric types, specific soil
types). Institutional usage guidance is separately addressed — and separately marked as
unavailable — in `05_Safety.md` under Institutional Usage SOP.
