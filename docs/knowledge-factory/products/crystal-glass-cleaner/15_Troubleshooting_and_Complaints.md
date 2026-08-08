# MUV Crystal Glass Cleaner™ — Troubleshooting & Complaints

---

## KO-GC-TROUBLE-001 — Troubleshooting

- **KOID:** KO-GC-TROUBLE-001
- **Title:** MUV Crystal Glass Cleaner™ — Troubleshooting
- **Category:** Troubleshooting & Complaints
- **Tags:** [glass-cleaner, troubleshooting]
- **Version:** 1.0
- **Confidence:** MEDIUM — mapped from real, sourced QC criteria; no dedicated troubleshooting
  guide exists
- **Evidence:** KO-GC-QC-001
- **Relationships:** KO-GC-QC-001, KO-GC-COMPLAINT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from KO-GC-QC-001

**Content:**

No dedicated troubleshooting guide exists in any source. The only responsibly-groundable
guidance is to map a reported problem back to the five sourced QC criteria (colour/appearance
off, streaking, slow drying, visible particles, weak/off fragrance) and treat any deviation as a
potential quality issue requiring a real support ticket, not a self-diagnosed cause — no root
cause (e.g. "this happens when diluted incorrectly") is sourced anywhere and none should be
asserted.

---

## KO-GC-COMPLAINT-001 — Complaint Handling & Root Cause Analysis

- **KOID:** KO-GC-COMPLAINT-001
- **Title:** MUV Crystal Glass Cleaner™ — Complaint Handling & Root Cause Analysis
- **Category:** Troubleshooting & Complaints
- **Tags:** [glass-cleaner, complaints]
- **Version:** 1.0
- **Confidence:** MEDIUM
- **Evidence:** `lib/support/product-issue-service.ts`
- **Relationships:** KO-GC-TROUBLE-001, KO-GC-CRO-004
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Real platform code + KO-GC-QC-001

**Content:**

Complaints route through the real `lib/support/product-issue-service.ts` flow (same as all four
prior products). No sourced root-cause library exists for this product — any complaint should
result in a real ticket and, if relevant, be cross-checked against the five real QC criteria, not
diagnosed algorithmically.
