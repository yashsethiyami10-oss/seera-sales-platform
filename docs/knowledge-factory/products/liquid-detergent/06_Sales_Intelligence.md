# MUV Liquid Detergent™ — Sales & Marketing Intelligence

---

## KO-LD-SALES-001 — Sales Intelligence

- **KOID:** KO-LD-SALES-001
- **Title:** MUV Liquid Detergent™ — Sales Intelligence
- **Category:** Sales Intelligence
- **Tags:** [liquid-detergent, sales, pricing]
- **Version:** 1.0
- **Confidence:** MEDIUM (pricing) / LOW (everything else)
- **Evidence:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 1–6 for pricing; no sales-performance
  data (units sold, conversion rate, repeat-purchase rate) exists because the product is not yet
  in the platform's catalogue (`Product`/`ProductVariant` tables) — confirmed absent in
  `01_Product_Identity.md`.
- **Relationships:** KO-LD-VAR-001/002/003, KO-LD-CONFLICT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

**Content:**

Per FR-001/FR-002 (Commercial/Knowledge Separation), pricing is never stated as static content in
this package — it must always be resolved live from the Product Catalog (see
`LIVE_DATA_MAPPING.md`).

| Variant | 1 L | 5 L |
|---|---|---|
| Lavender Garden | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| Indian Rose | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| Cool Water | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |

Historical note: source documents disagreed on Cool Water's MRP during original research — that
record (`KO-LD-CONFLICT-001` in `10_Product_Variants.md`) is a **historical source citation only
(recorded during source audit) — NOT a live commercial value.** Per FR-001/FR-002, current pricing
for all variants must always be resolved from the Product Catalog API, never from this figure.

Because the product does not yet exist as a real `Product`/`ProductVariant` row in the
platform's commerce database (confirmed in `01_Product_Identity.md`), none of the platform's
real, already-built sales-intelligence systems have any data for it yet — specifically:
`CustomerIntelligenceProfile` (Phase 6 purchase-history/segmentation), the Institutional Sales
OS's `SalesIntelligenceSnapshot` (deal-health scoring, built this session's Sprint 11), or
`actions/inst-reports.ts`'s reporting functions. These systems are real and would apply to this
product automatically once it is catalogued and sold — that is a fact about platform capability,
not a claim about this product's current sales performance (which doesn't exist yet).

**REQUIRES FOUNDER INPUT:**
- Wholesale/institutional pricing tiers
- Cost of goods / margin data
- Any sales history (none exists — product not yet catalogued)
- Sales channel strategy (D2C only, institutional only, both)

---

## KO-LD-SALES-002 — Marketing Intelligence

- **KOID:** KO-LD-SALES-002
- **Title:** MUV Liquid Detergent™ — Marketing Intelligence
- **Category:** Marketing Intelligence
- **Tags:** [liquid-detergent, marketing]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found beyond the variant fragrance/colour identity already documented in
  `03_Manufacturing.md`/`10_Product_Variants.md`.
- **Relationships:** KO-LD-VAR-001/002/003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No marketing campaign history, brand messaging guidelines, target
channel strategy (social, marketplace, retail), or content calendar reference was found for this
product. Per CLAUDE.md's own binding constitution, any future marketing copy for this product
must additionally be checked against `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`'s forbidden-copy-
pattern rules (no fear/shame marketing) before being written — this package does not draft any
marketing copy itself, to avoid pre-empting that governance check.

---

## KO-LD-SALES-003 — Competitor Comparison

- **KOID:** KO-LD-SALES-003
- **Title:** MUV Liquid Detergent™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [liquid-detergent, competitors, comparison]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found.
- **Relationships:** none yet
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No competitor product names, pricing comparisons, or feature/
performance comparisons were found in any source document. Fabricating a competitor comparison
would be a direct violation of the No Hallucination Rule ("Never invent ... Performance data")
and is not attempted here.

---

## KO-LD-SALES-004 — Founder Notes

- **KOID:** KO-LD-SALES-004
- **Title:** MUV Liquid Detergent™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [liquid-detergent, founder-notes]
- **Version:** 1.0
- **Confidence:** N/A — placeholder section
- **Evidence:** N/A
- **Relationships:** none
- **Owner:** Founder
- **Approval Status:** OPEN — awaiting Founder input
- **Review Date:** Upon Founder input
- **Source:** N/A

**Content:**

This section is intentionally left open for direct Founder notes, context, or corrections that
don't fit elsewhere in this package (e.g. "why Cool Water is priced differently," "which
fragrance house supplies Lavender Eco/Rose Petal/DM Comfort," historical context on this product
line). Nothing has been written here on the Founder's behalf.
