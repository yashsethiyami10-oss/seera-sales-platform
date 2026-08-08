# MUV Crystal Glass Cleaner™ — Sales Intelligence

---

## KO-GC-SALES-001 — Sales Intelligence

- **KOID:** KO-GC-SALES-001
- **Title:** MUV Crystal Glass Cleaner™ — Sales Intelligence
- **Category:** Sales Intelligence
- **Tags:** [glass-cleaner, sales, pricing]
- **Version:** 1.0
- **Confidence:** HIGH — pricing sourced and agreeing across both authoritative sources
- **Evidence:** Product Chart row 13; SOP Packing Standard table
- **Relationships:** KO-GC-VAR-001, KO-GC-CRO-005
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** CONFIDENTIAL — Sales/Founder/Admin (see `22_Knowledge_Visibility_Matrix.md`)
- **Review Date:** Upon Founder approval
- **Source:** Product Chart row 13; SOP Packing Standard table

**Content:**

**Retail pricing (500 ml): LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`).**
Per FR-001/FR-002 (Constitution Article 2.1), no retail price figure is stated here as a live,
AI-usable fact. Historical source citation only (recorded during source audit) — NOT a live
commercial value: both the Product Chart and the Production SOP recorded the same figure (₹90) at
the time of research, with full two-source agreement, unlike Bathroom Cleaner's genuine historical
₹70/₹65 conflict — see `00_Source_Register.md` and `19_Source_Conflict_Register.md`. This was the
first pricing fact in this session's five product families with full two-source agreement combined
with a fully-specified formulation (Toilet Cleaner also had agreeing pricing, but see that
package's own notes on other gaps).

**Institutional/placeholder pricing (explicitly NOT the real MRP, and NOT a Knowledge Factory
value either):**
`lib/inst-sales/consumption-rules.ts` carries a placeholder institutional business-rule estimate
for `GLASS_CLEANER`, self-labeled in the file's own header comment as a "placeholder institutional
price list, not a lookup into the real storefront Product catalog." This package never presents
that figure as a real product price and it must never be quoted to a customer — see
`LIVE_DATA_MAPPING.md`'s "Institutional/placeholder pricing note" for detail — matching the
discipline established in the Toilet Cleaner and Dishwash Gel packages for their own respective
consumption-rules constants.

No pre-existing conflict-comment reference to Glass Cleaner exists in
`lib/knowledge-factory/conflict-service.ts` (confirmed by direct grep) — unlike Bathroom
Cleaner, there is no prior codebase signal that this product's pricing was already known to be
contested.

---

## KO-GC-SALES-002 — Competitor Comparison

- **KOID:** KO-GC-SALES-002
- **Title:** MUV Crystal Glass Cleaner™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [glass-cleaner, competitor]
- **Version:** 1.0
- **Confidence:** HIGH — clean scan result
- **Evidence:** `21_Competitor_Reference_Register.md`
- **Relationships:** KO-GC-COMPETITOR-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Competitor Reference Register

**Content:**

No competitor brand comparison data exists in any source. The scan explicitly checked for
"Colin" — a real, well-known glass-cleaner competitor brand in the Indian market — with zero
hits anywhere in the Product Chart, SOP, or Knowledge Library. See
`21_Competitor_Reference_Register.md` for the full scan record.

---

## KO-GC-SALES-003 — Founder Notes

- **KOID:** KO-GC-SALES-003
- **Title:** MUV Crystal Glass Cleaner™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [glass-cleaner, founder-notes]
- **Version:** 1.0
- **Confidence:** N/A
- **Evidence:** None
- **Relationships:** KO-GC-18-Founder-Input
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — placeholder for future Founder input

**Content:**

No wholesale/institutional pricing, cost of goods, margin data, or marketing campaign history
exists in any source for this product. REQUIRES FOUNDER INPUT.
