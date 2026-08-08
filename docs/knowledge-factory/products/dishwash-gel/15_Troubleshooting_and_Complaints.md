# MUV Dishwash Gel™ — Troubleshooting & Complaints

---

## KO-DW-TROUBLE-001 — Troubleshooting

- **KOID:** KO-DW-TROUBLE-001
- **Title:** MUV Dishwash Gel™ — Troubleshooting
- **Category:** Support
- **Tags:** [dishwash-gel, troubleshooting]
- **Version:** 1.0
- **Confidence:** LOW (no documented guide) / MEDIUM (for the one real, QC-derived observation
  below)
- **Evidence:** No documented troubleshooting guide exists; the one real, sourced observation is
  derived directly from the QC section's own named failure modes.
- **Relationships:** KO-DW-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx` (QC section, indirectly)

**Content:**

**One real, source-derived observation:** the QC section (KO-DW-QC-001) names two specific
failure modes it checks against — "phase separation" and off-target pH/appearance — meaning
these are the two failure modes MUV's own SOP considers worth explicitly guarding against for
this product. This package does not go further and invent root causes or fixes for either
failure mode, since the SOP itself only states the acceptance criterion, not a
troubleshooting/corrective-action guide for a failed batch.

**REQUIRES FOUNDER INPUT:**
- A real troubleshooting guide (batch failure root causes, corrective actions)
- Viscosity/thickness issues specifically (the SOP's own qualitative "desired viscosity"
  criterion has no documented troubleshooting path if a batch is under/over target)

---

## KO-DW-COMPLAINT-001 — Complaint Handling & Root Cause Analysis

- **KOID:** KO-DW-COMPLAINT-001
- **Title:** MUV Dishwash Gel™ — Complaint Handling & Root Cause Analysis
- **Category:** Support
- **Tags:** [dishwash-gel, complaints, root-cause-analysis]
- **Version:** 1.0
- **Confidence:** MEDIUM (process, via real platform infrastructure) / LOW (product-specific
  history)
- **Evidence:** Identical platform mechanism already documented for both prior product families.
- **Relationships:** KO-DW-SUPPORT-001, KO-DW-TROUBLE-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/support/ticket-service.ts`, `lib/support/product-issue-service.ts`

**Content:**

Identical process to Liquid Detergent and Toilet Cleaner: a real `SupportTicket` +
`ProductIssueReport` via `lib/support/product-issue-service.ts`.

**REQUIRES FOUNDER INPUT:**
- No complaint history exists (product not catalogued)
- No batch/lot numbering scheme was found
