# MUV Floor Cleaner™ — Knowledge Visibility Matrix

> Grounded in the real, already-built platform layers: the `KnowledgeLayer` enum
> (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`, `prisma/schema.prisma`), `lib/retrieval/permissions.ts`'s
> clearance ladder, `lib/rbac.ts`'s role checks, and `lib/sales/authorization.ts`. Not a new
> access-control system. This matrix also documents how visibility applies across the Parent /
> Variant structure — the first package where that distinction matters.

---

## KO-FC-VIS-001 — Knowledge Visibility Matrix

- **KOID:** KO-FC-VIS-001
- **Title:** MUV Floor Cleaner™ — Knowledge Visibility Matrix
- **Category:** Knowledge Visibility
- **Tags:** [floor-cleaner, visibility, rbac, governance]
- **Version:** 1.0
- **Confidence:** HIGH — directly mapped to real `KnowledgeLayer`/RBAC code
- **Relationships:** all KOs in this package
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `prisma/schema.prisma` (`KnowledgeLayer`), `lib/retrieval/permissions.ts`,
  `lib/rbac.ts`, `lib/sales/authorization.ts`

**Content:**

| Knowledge Category | Layer | Customer | Sales | Inst. Sales | Support | Manufacturing | QC | Founder | Admin | MUV AI (customer-facing) |
|---|---|---|---|---|---|---|---|---|---|---|
| Product Identity (`01`, Parent) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Family & Variants (`02`) | PUBLIC (VM/CW); Rose Water disclosure is PUBLIC-but-honest | ✅ (VM/CW); ⚠️ RW disclosed as unsourced | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ with explicit RW caveat |
| Product Description (`03`) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ingredients (`04`, Parent) | INTERNAL (named materials only) | ⚠️ named materials only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ named materials only, VM/CW only, never RW |
| Manufacturing Theory (`05`, Parent) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manufacturing SOP (`06`, Parent) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Batch Reconciliation (`07`, Parent) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Quality Control (`08`, Parent) | INTERNAL (documents absence only) | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ discloses absence, if asked |
| Safety & Risk (`09`, Parent) | CONFIDENTIAL (manufacturing gap); consumer-safety absence disclosed PUBLICLY via CRO-004/005 | ⚠️ absence disclosed via CRO only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ discloses "not documented," never internal register |
| Packaging/Storage/Transport (`10`, Parent) | INTERNAL | ❌ (mostly REQUIRES FOUNDER INPUT) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Sales Intelligence (`11`) | CONFIDENTIAL (institutional placeholder pricing, margin, historical pricing-conflict detail) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ never answers pricing from this KO — all pricing (1L, 5L, any variant) is LIVE-resolved from the Product Catalog per FR-001/FR-002; the historical pricing-conflict record and the ₹110/Ltr institutional placeholder are never customer/AI-facing |
| **Commercial Fields** (MRP/price/discount/images/stock/URL/slug/availability) | **NOT KNOWLEDGE FACTORY CONTENT** — owned entirely by the Product Catalog | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | ✅ always live-fetched, never from Knowledge Factory |
| Marketing Intelligence (`12`) | INTERNAL | ⚠️ published copy only, once written | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ⚠️ published copy only |
| Customer Support (`13`, Parent) | INTERNAL (process); PUBLIC (outcomes) | ⚠️ outcomes only | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ outcomes only |
| FAQs & AI Responses (`14`, Parent) | PUBLIC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Troubleshooting/Complaints (`15`, Parent) | INTERNAL (triage); PUBLIC (customer-safe guidance) | ⚠️ customer-safe guidance only | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ customer-safe guidance only |
| Care Response Objects (`16`) | INTERNAL (behavior templates) | ❌ (experienced as behavior) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ (governs its own responses) |
| Variant Inheritance Map (`17`) | INTERNAL (architecture/governance) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ (used as internal logic, not shown as content) |
| Golden Questions (`18`) | INTERNAL (QA tooling) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Founder Input Register (`19`) | CONFIDENTIAL | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Source Conflict Register (`20`) | CONFIDENTIAL | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |

**Binding rule (unchanged across all six packages):** No confidential manufacturing information
is ever visible to customer-facing AI.

**Floor-Cleaner-specific note — Rose Water visibility:** the AI must never present Rose Water's
name-only status as equivalent visibility/confidence to Velvet Mist or Cloud Walk's fully sourced
status. A customer-facing query about Rose Water should always route through the honest-
disclosure CRO (KO-FC-CRO-009), never silently inherit Parent-level PUBLIC facts (ingredients,
QC, etc.) as if they applied to Rose Water by default — this is the Variant Inheritance
discipline applied specifically to the visibility layer.
