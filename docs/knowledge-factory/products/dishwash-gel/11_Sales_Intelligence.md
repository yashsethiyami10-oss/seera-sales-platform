# MUV Dishwash Gel™ — Sales Intelligence

---

## KO-DW-SALES-001 — Sales Intelligence

- **KOID:** KO-DW-SALES-001
- **Title:** MUV Dishwash Gel™ — Sales Intelligence
- **Category:** Sales Intelligence
- **Tags:** [dishwash-gel, sales, pricing]
- **Version:** 1.0
- **Confidence:** HIGH (retail pricing, sole-sourced) / LOW (everything else)
- **Evidence:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 9–11 — the ONLY pricing source for
  this product (the SOP has none, so there is nothing to cross-validate against, unlike the
  other two packages).
- **Relationships:** KO-DW-VAR-001/002/003, KO-DW-CONFLICT (n/a — see `18_Source_Conflict_Register.md`)
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

**Content:**

| SKU | MRP |
|---|---|
| 500 ml | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| 1 L | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| 5 L | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |

*(Historical MRP figures for these three SKUs, as recorded from the Product Chart during source
research, are preserved only in `00_Source_Register.md` — historical source citation only, NOT a
live commercial value. Per FR-001/FR-002, current pricing must always be resolved from the
Product Catalog API, never from this figure.)*

Because the product does not yet exist as a real `Product`/`ProductVariant` row in the
platform's commerce database, the platform's real sales-intelligence systems
(`CustomerIntelligenceProfile`, `SalesIntelligenceSnapshot`, `actions/inst-reports.ts`) have no
data for it yet — same disclosed fact as both prior packages.

**Institutional pricing caveat:** `lib/inst-sales/consumption-rules.ts` carries a placeholder
`DISHWASH: 150` (₹/Ltr) institutional-estimation constant with the same "not a real lookup"
disclaimer already documented for Liquid Detergent and Toilet Cleaner. Not used here as sourced
pricing, and not a live commercial value under any circumstance — per FR-001/FR-002, any real
institutional/wholesale pricing must be resolved live, never from this code placeholder. The same
file's consumption formula (`kitchens × 8 Ltr/month`) is a real, code-verified fact about
platform capability for future institutional-sales modeling, not a claim about this product's
actual institutional demand.

**Notable interproduct observation (historical, non-live):** at the time of source research, the
Product Chart's recorded 1L and 5L MRP figures for Dishwash Gel exactly matched the Product
Chart's recorded 1L and 5L figures for Liquid Detergent's Lavender Garden/Indian Rose variants —
a coincidence noted for pricing-strategy awareness at the time, not asserted as intentional
without Founder confirmation. The underlying figures are historical source citations only (see
`00_Source_Register.md`), NOT live commercial values — per FR-001/FR-002, whether this coincidence
still holds must be checked against current, live Product Catalog data, never against this note.

**Not yet available (REQUIRES FOUNDER INPUT):**
- Wholesale/institutional pricing (distinct from the ₹150/Ltr placeholder)
- Cost of goods / margin data
- Sales history (product not yet catalogued)

---

## KO-DW-SALES-002 — Competitor Comparison

- **KOID:** KO-DW-SALES-002
- **Title:** MUV Dishwash Gel™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [dishwash-gel, competitors]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found. Confirmed via the explicit competitor-name scan in
  `20_Competitor_Reference_Register.md` — zero competitor references exist in any Dishwash Gel
  source material, so there is nothing to build a comparison from even indirectly.
- **Relationships:** KO-DW-SALES-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No competitor product names, pricing, or feature comparisons exist
in any source. Unlike Toilet Cleaner (where a competitor name appeared incidentally as a
fragrance descriptor), this product's sources are entirely clean of competitor references —
there is no residual naming question to resolve here.

---

## KO-DW-SALES-003 — Founder Notes

- **KOID:** KO-DW-SALES-003
- **Title:** MUV Dishwash Gel™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [dishwash-gel, founder-notes]
- **Version:** 1.0
- **Confidence:** N/A — placeholder section
- **Evidence:** N/A
- **Relationships:** none
- **Owner:** Founder
- **Approval Status:** OPEN — awaiting Founder input
- **Review Date:** Upon Founder input
- **Source:** N/A

**Content:**

Intentionally left open for direct Founder notes.
