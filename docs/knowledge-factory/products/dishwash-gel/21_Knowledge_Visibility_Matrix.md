# MUV Dishwash Gel™ — Knowledge Visibility Matrix

> Grounded in the platform's real, already-existing access model rather than inventing a new
> one: `KnowledgeLayer` (`PUBLIC` / `INTERNAL` / `CONFIDENTIAL`, `prisma/schema.prisma`, Modules
> 1–4) and `lib/retrieval/permissions.ts`'s real clearance mapping (`ANONYMOUS`/`CUSTOMER` →
> `PUBLIC` only; `STAFF` → `PUBLIC`+`INTERNAL`; `ADMIN` → all three). Audience-to-role mapping
> below uses the platform's real RBAC/permission systems (`lib/rbac.ts`, `lib/sales/authorization.ts`,
> `lib/support/context.ts`, `lib/founder-os/context.ts`) — this file does not invent a new
> authorization model, only classifies this product's content against the one that already
> exists and is enforced in code.

---

## KO-DW-VISIBILITY-001 — Visibility Classification by Knowledge Category

- **KOID:** KO-DW-VISIBILITY-001
- **Title:** MUV Dishwash Gel™ — Knowledge Visibility Matrix
- **Category:** Knowledge Visibility
- **Tags:** [dishwash-gel, visibility, governance, access-control]
- **Version:** 1.0
- **Confidence:** MEDIUM — the underlying platform access model (KnowledgeLayer, RBAC roles) is
  HIGH confidence (real, code-verified), but the specific classification of each *content
  category* below into a layer is this package's own proposed governance mapping, not yet
  Founder-ratified.
- **Relationships:** every KOID in this package (this matrix classifies the whole package)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `prisma/schema.prisma` (`KnowledgeLayer` enum); `lib/retrieval/permissions.ts`;
  `lib/rbac.ts`; `lib/sales/authorization.ts`; `lib/support/context.ts`; `lib/founder-os/context.ts`

**Content — Access Matrix (✓ = visible, ✗ = not visible, per real platform enforcement):**

| Knowledge Category (this package's file) | Proposed Layer | Customer | Sales | Inst. Sales | Support | Manufacturing | QC | Founder | Admin | MUV AI (customer-facing) | MUV AI (internal staff) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Product Identity (`01`) | PUBLIC | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Family & SKUs / pricing (`02`) | PUBLIC | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Product Description (`03`) | PUBLIC | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ingredients & Functions (`04`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| Manufacturing Theory (`05`) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | **✗** | ✗ (see note) |
| Manufacturing SOP (`06`) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | **✗** | ✗ (see note) |
| Batch Reconciliation (`07`) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | **✗** | ✗ (see note) |
| Quality Control (`08`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| Safety & Risk (`09`) | INTERNAL | ✗ (see note) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (see note) | ✓ |
| Packaging/Storage/Transport (`10`) | INTERNAL | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Sales Intelligence (`11`) | INTERNAL | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Marketing Intelligence (`12`) | INTERNAL | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Customer Support process (`13`) | INTERNAL | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| FAQs (`14`, FAQ section) | PUBLIC | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| AI Response/Escalation/Confidence rules (`14`, AI section) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | n/a (governs the AI itself) | ✓ |
| Troubleshooting & Complaints (`15`) | INTERNAL | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Golden Questions (`16`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | n/a (test spec) | ✓ |
| Founder Input Register (`17`) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Source Conflict Register (`18`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ (may explain a "not confirmed" answer) |
| Canonical Naming Register (`19`) | INTERNAL | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Competitor Reference Register (`20`) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Knowledge Visibility Matrix (`21`, this file) | CONFIDENTIAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Knowledge Reuse Report (`22`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Validation Report (`23`) | INTERNAL | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |

**Explicit design rule honoured (per instruction):** *"No confidential manufacturing information
should be visible to customer-facing AI."* Rows `05`/`06`/`07` (Manufacturing Theory, SOP, Batch
Reconciliation) are marked CONFIDENTIAL and **✗ for both customer-facing MUV AI and, on
reflection, internal-staff MUV AI too** — this package's proposed default is that even the
internal governed chat (`lib/muv-ai/*`) should not surface full batch formulations
conversationally (a human should read the actual SOP document for that), only acknowledge that a
formulation exists and point to the real document — a stricter proposed rule than "internal
staff can see everything," flagged for explicit Founder confirmation since it goes beyond a
literal reading of the instruction.

**Notes:**
- **Safety & Risk (`09`) customer row:** marked ✗ by default since no sourced consumer safety
  data exists yet (KO-DW-SAFETY-002) — there is nothing safe to show a customer either way; once
  real consumer safety data exists, that specific subset should become PUBLIC while
  manufacturing-safety content (KO-DW-SAFETY-001) stays INTERNAL.
- This matrix maps conceptually to the platform's real `KnowledgeLayer` enum
  (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`) and `lib/retrieval/permissions.ts`'s real clearance
  ladder — implementing it for real (e.g. as an actual `ProductIntelligence`/`CategoryIntelligence`
  row once this product is catalogued) is a future engineering task, not something this
  documentation package performs itself.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Founder ratification of the proposed layer classifications above (this package's own proposal,
  not a confirmed governance decision)
- Confirmation of the stricter-than-literal internal-AI manufacturing-content rule noted above
