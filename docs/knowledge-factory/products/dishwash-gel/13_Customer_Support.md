# MUV Dishwash Gel™ — Customer Support

---

## KO-DW-SUPPORT-001 — Support Process

- **KOID:** KO-DW-SUPPORT-001
- **Title:** MUV Dishwash Gel™ — Support Process
- **Category:** Customer Support
- **Tags:** [dishwash-gel, support, process]
- **Version:** 1.0
- **Confidence:** MEDIUM (process only, via real platform infrastructure) / LOW (product-specific
  history)
- **Evidence:** No product-specific support history exists (product not yet catalogued). The
  real, existing `lib/support/*` infrastructure is the same platform capability already
  documented identically for Liquid Detergent and Toilet Cleaner.
- **Relationships:** KO-DW-SAFETY-001, KO-DW-QC-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `lib/support/ticket-service.ts`, `lib/support/product-issue-service.ts` (platform
  code)

**Content:**

**Process (real, platform-verified, identical mechanism across all three product families):** a
complaint against this product would be raised as a `SupportTicket` with `category:
PRODUCT_ISSUE`, optionally linked to a `ProductIssueReport` via
`lib/support/product-issue-service.ts`'s `createProductIssueReport`/`lookupBatch`/
`getTicketCountByBatch` functions.

**Product-specific consideration:** given this product involves direct hand contact during
normal use (more so than Liquid Detergent or Toilet Cleaner), and given no consumer safety data
is sourced (`09_Safety_and_Risk.md`, KO-DW-SAFETY-002), a support agent handling a skin-reaction
report should treat it with the same escalation discipline as a safety report, not a routine
product-quality complaint — see `14_FAQs_and_AI_Responses.md` for the corresponding AI
escalation rule.

**Not yet available (REQUIRES FOUNDER INPUT):**
- No complaint has been logged for this product (not yet catalogued)
- No batch-numbering scheme was found in the source SOP
