# MUV Crystal Glass Cleaner™ — Knowledge Visibility Matrix

> Grounded in the real, already-built platform layers: the `KnowledgeLayer` enum
> (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`, `prisma/schema.prisma`), `lib/retrieval/permissions.ts`'s
> clearance ladder, `lib/rbac.ts`'s role checks, and `lib/sales/authorization.ts`. Not a new
> access-control system — this maps this package's own Knowledge Objects onto systems that
> already exist, following the exact same structure established in the Dishwash Gel and
> Bathroom Cleaner packages.

---

## KO-GC-VIS-001 — Knowledge Visibility Matrix

- **KOID:** KO-GC-VIS-001
- **Title:** MUV Crystal Glass Cleaner™ — Knowledge Visibility Matrix
- **Category:** Knowledge Visibility
- **Tags:** [glass-cleaner, visibility, rbac, governance]
- **Version:** 1.0
- **Confidence:** HIGH — directly mapped to real `KnowledgeLayer`/RBAC code, not invented
- **Relationships:** all KOs in this package
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `prisma/schema.prisma` (`KnowledgeLayer`), `lib/retrieval/permissions.ts`,
  `lib/rbac.ts`, `lib/sales/authorization.ts`

**Content:**

| Knowledge Category | Layer | Customer | Sales | Inst. Sales | Support | Manufacturing | QC | Founder | Admin | MUV AI (customer-facing) |
|---|---|---|---|---|---|---|---|---|---|---|
| Product Identity (`01`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SKUs & Variants (`02`) | PUBLIC | ✅ (500ml only) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (500ml only; 5L withheld) |
| Product Description (`03`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ingredients & Functions (`04`) | INTERNAL (named materials only; no INCI/%/supplier) | ⚠️ named materials only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ named materials only, no invented chemistry |
| Manufacturing Theory (`05`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manufacturing SOP (`06`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Batch Reconciliation (`07`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Quality Control (`08`) | INTERNAL (criteria only, no test method) | ❌ | ⚠️ criteria only | ⚠️ criteria only | ⚠️ criteria only (complaint triage) | ✅ | ✅ | ✅ | ✅ | ⚠️ criteria only, if asked |
| Safety & Risk (`09`) | CONFIDENTIAL (manufacturing gap); the *absence* of consumer safety guidance is disclosed PUBLICLY via CRO-007, the register itself is not | ⚠️ absence disclosed via CRO only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ discloses "not documented," never the internal register content |
| Packaging/Storage/Transport (`10`) | INTERNAL | ❌ (mostly REQUIRES FOUNDER INPUT) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (not yet sourced) |
| Sales Intelligence (`11`) | CONFIDENTIAL (institutional placeholder pricing, margin) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ LIVE retail price only (resolved from Product Catalog API — see `LIVE_DATA_MAPPING.md`), never the internal institutional placeholder estimate |
| Commercial Fields (MRP/price/discount/images/stock/URL/slug/availability) | **NOT KNOWLEDGE FACTORY CONTENT** — owned entirely by the Product Catalog | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✅ always live-fetched, never from Knowledge Factory |
| Marketing Intelligence (`12`) | INTERNAL | ⚠️ published copy only, once written | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ published copy only |
| Customer Support (`13`) | INTERNAL (process); PUBLIC (customer-facing outcomes) | ⚠️ outcomes only | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ outcomes only |
| FAQs & AI Responses (`14`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Troubleshooting/Complaints (`15`) | INTERNAL (triage logic); PUBLIC (customer-safe guidance) | ⚠️ customer-safe guidance only | ✅ | ✅ | ✅ | ⚠️ QC-relevant only | ✅ | ✅ | ✅ | ⚠️ customer-safe guidance only |
| Care Response Objects (`16`) | INTERNAL (behavior templates) | ❌ (experienced as behavior, not read directly) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (this is what governs its own responses) |
| Golden Questions (`17`) | INTERNAL (QA tooling) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (used to test the AI, not shown to it as content) |
| Founder Input Register (`18`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Source Conflict Register (`19`) | CONFIDENTIAL | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |

**Binding rule (unchanged across all five packages):** No confidential manufacturing information
(Manufacturing Theory, SOP, Batch Reconciliation, internal QC test methods, internal
institutional pricing) is ever visible to customer-facing AI.

**Glass-Cleaner-specific note:** because this product has the most severe safety-documentation
gap of any package this session, there's a real temptation to want the AI to say *something*
reassuring about safety — the correct behavior, enforced by this matrix and CRO-007, is the
opposite: the AI must disclose the absence of safety documentation honestly rather than
manufacture false reassurance, exactly the discipline `lib/intelligence/eq-engine.ts` requires
("Never claim certainty").

**FR-001/FR-002 remediation note (2026-07-31):** the new "Commercial Fields" row above was added
during the FR-001/FR-002 remediation pass to make the Commercial/Knowledge separation visible in
this governance artifact, per `VALIDATION_RULES.md` §4. See `LIVE_DATA_MAPPING.md` for the full
field-by-field resolution mapping.
