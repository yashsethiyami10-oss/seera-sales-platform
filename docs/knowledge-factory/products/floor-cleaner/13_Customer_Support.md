# MUV Floor Cleaner™ — Customer Support

> Parent-level (shared) Knowledge Object.

---

## KO-FC-SUPPORT-001 — Support Process

- **KOID:** KO-FC-SUPPORT-001
- **Title:** MUV Floor Cleaner™ — Support Process
- **Category:** Customer Support
- **Tags:** [floor-cleaner, support, shared, parent]
- **Version:** 1.0
- **Confidence:** HIGH — grounded in real, already-built platform infrastructure
- **Evidence:** `lib/support/ticket-service.ts`, `lib/support/product-issue-service.ts`, `lib/support/context.ts`
- **Relationships:** KO-FC-QC-001, KO-FC-CRO-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Real platform code (`lib/support/*`)

**Content:**

Product-related complaints for any MUV Floor Cleaner™ variant route through the same real,
already-built support infrastructure used across all six product packages: a `SupportTicket` is
created (`category: PRODUCT_ISSUE`) via `lib/support/ticket-service.ts` /
`lib/support/product-issue-service.ts`. This process is shared/parent-level and applies
identically regardless of which variant (Velvet Mist, Cloud Walk, or an eventual Rose Water) the
complaint is about — the variant name should be captured as ticket metadata, not treated as
changing the support process itself. No product-specific troubleshooting guide or batch/lot
numbering scheme exists yet — REQUIRES FOUNDER INPUT.
