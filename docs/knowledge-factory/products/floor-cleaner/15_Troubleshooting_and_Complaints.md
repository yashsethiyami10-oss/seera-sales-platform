# MUV Floor Cleaner™ — Troubleshooting & Complaints

> Parent-level (shared) Knowledge Objects.

---

## KO-FC-TROUBLE-001 — Troubleshooting

- **KOID:** KO-FC-TROUBLE-001
- **Title:** MUV Floor Cleaner™ — Troubleshooting
- **Category:** Troubleshooting & Complaints
- **Tags:** [floor-cleaner, troubleshooting, shared, parent]
- **Version:** 1.0
- **Confidence:** LOW — no QC criteria exist to map complaints against, unlike prior packages
- **Evidence:** KO-FC-QC-001 (documents the absence)
- **Relationships:** KO-FC-QC-001, KO-FC-COMPLAINT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from KO-FC-QC-001

**Content:**

Unlike every prior product package, this one has **no sourced QC criteria to map a complaint
against** — there is no "appearance," "streak-free," or "fragrance" checklist to reference. Any
reported problem (colour off, weak fragrance, poor cleaning result, separation) can only be
acknowledged honestly as a real product concern worth logging, without any sourced standard to
compare it to. No root cause is sourced anywhere and none should be asserted.

---

## KO-FC-COMPLAINT-001 — Complaint Handling & Root Cause Analysis

- **KOID:** KO-FC-COMPLAINT-001
- **Title:** MUV Floor Cleaner™ — Complaint Handling & Root Cause Analysis
- **Category:** Troubleshooting & Complaints
- **Tags:** [floor-cleaner, complaints, shared, parent]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** `lib/support/product-issue-service.ts`
- **Relationships:** KO-FC-TROUBLE-001, KO-FC-CRO-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Real platform code + KO-FC-QC-001

**Content:**

Complaints route through the real `lib/support/product-issue-service.ts` flow (same as all six
product packages). No sourced root-cause library or QC checklist exists for this product — any
complaint should result in a real ticket, capturing which variant is involved as metadata, not
diagnosed algorithmically.
