# MUV Liquid Detergent™ — Quality Control Knowledge

---

## KO-LD-QC-001 — Quality Control & Acceptance Criteria

- **KOID:** KO-LD-QC-001
- **Title:** MUV Liquid Detergent™ — Quality Control
- **Category:** Quality Control
- **Tags:** [liquid-detergent, quality-control, acceptance-criteria]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** Only the pH check documented in the SOP (see KO-LD-MFG-004); no separate QC/
  acceptance-criteria document was found.
- **Relationships:** KO-LD-MFG-004
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Liquid_Detergent_Final_Production_SOP_v2-1.docx` (pH check only)

**Content:**

The only quality checkpoint confirmed by any source document is the in-process pH check
described in `03_Manufacturing.md` (KO-LD-MFG-004): target pH ≈ 6, checked after CDEA addition
(Step 7).

**REQUIRES FOUNDER INPUT — no source document defines:**
- Finished-product acceptance criteria (appearance, clarity, viscosity, colour match tolerance,
  fragrance strength, foam performance)
- Batch release / hold procedure
- Sampling plan or frequency
- Test methods and equipment used for any QC parameter
- Out-of-specification (OOS) handling procedure
- Retention sample policy

---

## KO-LD-QC-002 — Shelf Life

- **KOID:** KO-LD-QC-002
- **Title:** MUV Liquid Detergent™ — Shelf Life
- **Category:** Quality Control
- **Tags:** [liquid-detergent, shelf-life]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found.
- **Relationships:** KO-LD-QC-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No shelf-life duration, stability-testing data, or expiry-dating
policy for this product was found in any source document. This must not be estimated — shelf
life for surfactant-based liquid formulations varies significantly by exact formulation and
packaging, and stating an unverified figure would be a direct violation of the No Hallucination
Rule ("Never invent... Performance data").

---

## KO-LD-QC-003 — Storage

- **KOID:** KO-LD-QC-003
- **Title:** MUV Liquid Detergent™ — Storage Requirements
- **Category:** Quality Control
- **Tags:** [liquid-detergent, storage]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found.
- **Relationships:** KO-LD-QC-002, KO-LD-SAFETY-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No storage condition guidance (temperature range, light exposure,
stacking limits for 5 L containers, humidity) was found in any source document for this product.

---

## KO-LD-QC-004 — Transportation

- **KOID:** KO-LD-QC-004
- **Title:** MUV Liquid Detergent™ — Transportation Requirements
- **Category:** Quality Control
- **Tags:** [liquid-detergent, transportation, logistics]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found.
- **Relationships:** KO-LD-MFG-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No transportation/logistics guidance (hazard classification for
shipping, orientation requirements, temperature limits in transit, carton weight/palletization)
was found. Note the platform's own shipping integration (`lib/shipping/*`) is provider-agnostic
and carries no product-specific hazard/handling data today — this is a genuine content gap, not
a code gap.
