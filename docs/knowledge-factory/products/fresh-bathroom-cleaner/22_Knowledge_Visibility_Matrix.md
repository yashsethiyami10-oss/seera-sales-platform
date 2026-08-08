# MUV Fresh Bathroom Cleaner™ — Knowledge Visibility Matrix

> Grounded in the real, already-built platform layers: the `KnowledgeLayer` enum
> (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`, `prisma/schema.prisma`), `lib/retrieval/permissions.ts`'s
> clearance ladder, `lib/rbac.ts`'s role checks, `lib/sales/authorization.ts`, and
> `lib/support/context.ts`/`lib/founder-os/context.ts`'s audience-scoped context builders. This
> is not a new access-control system — it maps this package's own Knowledge Objects onto systems
> that already exist.

---

## KO-BC-VIS-001 — Knowledge Visibility Matrix

- **KOID:** KO-BC-VIS-001
- **Title:** MUV Fresh Bathroom Cleaner™ — Knowledge Visibility Matrix
- **Category:** Knowledge Visibility
- **Tags:** [bathroom-cleaner, visibility, rbac, governance]
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
| SKUs & Variants (`02`) | PUBLIC | ✅ (500ml only) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (500ml only; 5L withheld — not confirmed) |
| Product Description (`03`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ingredients & Functions (`04`) | INTERNAL (named materials only; no INCI/%/supplier) | ⚠️ named materials only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ named materials only, no invented chemistry |
| Manufacturing Theory (`05`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manufacturing SOP (`06`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Batch Reconciliation (`07`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Quality Control (`08`) | INTERNAL (criteria only, no test method) | ❌ | ⚠️ criteria only | ⚠️ criteria only | ⚠️ criteria only (for complaint triage) | ✅ | ✅ | ✅ | ✅ | ⚠️ criteria only, if asked |
| Safety & Risk (`09`) | MIXED — KO-BC-SAFETY-001 (manufacturing) CONFIDENTIAL; consumer-facing safety guidance PUBLIC once sourced | ⚠️ consumer-relevant only, currently unsourced | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ consumer-safety only; manufacturing safety never surfaced to customers |
| Packaging/Storage/Transport (`10`) | INTERNAL | ❌ (mostly REQUIRES FOUNDER INPUT) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (not yet sourced) |
| Sales Intelligence (`11`) | CONFIDENTIAL (margin; pricing itself is not knowledge-factory content — see Commercial Fields row below) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (must defer to the live Product Catalog for pricing per FR-001/FR-002, never expose internal historical pricing detail) |
| Marketing Intelligence (`12`) | INTERNAL | ⚠️ published copy only, once written | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ published copy only |
| Customer Support (`13`) | INTERNAL (process); PUBLIC (customer-facing outcomes) | ⚠️ outcomes only | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ outcomes only |
| FAQs & AI Responses (`14`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Troubleshooting/Complaints (`15`) | INTERNAL (triage logic); PUBLIC (customer-safe guidance) | ⚠️ customer-safe guidance only | ✅ | ✅ | ✅ | ⚠️ QC-relevant only | ✅ | ✅ | ✅ | ⚠️ customer-safe guidance only |
| Golden Questions (`16`) | INTERNAL (QA tooling) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (used to test the AI, not shown to it as content) |
| Care Response Objects (`17`) | INTERNAL (behavior templates) | ❌ (experienced as behavior, not read directly) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (this is what governs its own responses) |
| Founder Input Register (`18`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Source Conflict Register (`19`) | CONFIDENTIAL (register itself, retains the historical pricing-discrepancy figures as an audit citation only — see `19_Source_Conflict_Register.md`); per FR-001/FR-002 the specific historical figures are never disclosed to customers — CRO-001 defers to the live Product Catalog instead | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ (never the register or its historical figures — only a live catalog lookup) |
| **Commercial Fields (MRP/price/discount/images/stock/URL/slug/availability)** | **NOT KNOWLEDGE FACTORY CONTENT** — owned entirely by the Product Catalog | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✅ always live-fetched, never from Knowledge Factory |

**Binding rule (unchanged from Dishwash Gel/Toilet Cleaner/Liquid Detergent):** No confidential
manufacturing information (Manufacturing Theory, SOP, Batch Reconciliation, internal QC test
methods, internal pricing/margin detail) is ever visible to customer-facing AI. This is the
single rule every other row in this table exists to enforce consistently, per
`lib/retrieval/permissions.ts`'s real clearance ladder.

**Bathroom-Cleaner-specific note:** because Manufacturing SOP contains the one genuinely strong,
real safety instruction in this package ("Never add water into acid," KO-BC-SAFETY-001), it is
tempting to want it surfaced to customers as a safety tip — but it is a **manufacturing-process**
instruction (about making the product, not using it) and stays CONFIDENTIAL/manufacturing-only.
Confusing "safety instruction that exists" with "safety instruction relevant to the customer" is
exactly the kind of layer-collapse this matrix exists to prevent.
