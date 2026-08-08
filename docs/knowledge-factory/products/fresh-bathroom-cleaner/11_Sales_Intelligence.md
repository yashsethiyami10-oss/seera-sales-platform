# MUV Fresh Bathroom Cleaner™ — Sales Intelligence

---

## KO-BC-SALES-001 — Sales Intelligence

- **KOID:** KO-BC-SALES-001
- **Title:** MUV Fresh Bathroom Cleaner™ — Sales Intelligence
- **Category:** Sales Intelligence
- **Tags:** [bathroom-cleaner, sales, pricing]
- **Version:** 1.0
- **Confidence:** CONFLICTED (tier unchanged by FR-001/FR-002 remediation, preserved for count
  reconciliation with `knowledge_metadata.json`/`24_Validation_Report.md` — reflects the historical
  sourcing state, not a stored pricing value; pricing itself is now a live-only field, see below)
- **Evidence:** N/A for pricing (see `LIVE_DATA_MAPPING.md`). Historical note: the Product Chart
  and SOP recorded two different figures for this SKU during source research — retained as a
  historical audit citation only in `19_Source_Conflict_Register.md`, never as a live fact.
- **Relationships:** KO-BC-VAR-001, `19_Source_Conflict_Register.md`
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review; **pricing field removed per FR-001/FR-002 —
  no longer a Founder-decision blocker for this package**
- **Review Date:** Upon Founder approval
- **Source:** N/A — commercial field, resolved live only

**Content:**

| SKU | MRP |
|---|---|
| 500 ml | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |

Because the product does not yet exist as a real `Product`/`ProductVariant` row, there is
currently no live catalog record to resolve this field from at all — see `LIVE_DATA_MAPPING.md`
for this package's current catalog status. No institutional-consumption placeholder exists in
`lib/inst-sales/consumption-rules.ts` for this category either (unlike Toilet Cleaner/Dishwash
Gel, which each have one).

(Historical note, audit trail only: two pre-launch source documents recorded two different
figures for this SKU — see `19_Source_Conflict_Register.md` CONFLICT-001, which independently
reproduced the specific numbers that `lib/knowledge-factory/conflict-service.ts`'s own header
comment had only referenced generically. Per FR-001/FR-002, this is no longer treated as a
customer/AI-facing pricing question — it is resolved live, and the historical discrepancy is kept
solely for audit traceability.)

**Not yet available (REQUIRES FOUNDER INPUT):**
- Wholesale/institutional pricing
- Cost of goods / margin data

---

## KO-BC-SALES-002 — Competitor Comparison

- **KOID:** KO-BC-SALES-002
- **Title:** MUV Fresh Bathroom Cleaner™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [bathroom-cleaner, competitors]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found — confirmed clean via `21_Competitor_Reference_Register.md`.
- **Relationships:** KO-BC-SALES-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No competitor data exists for this product.

---

## KO-BC-SALES-003 — Founder Notes

- **KOID:** KO-BC-SALES-003
- **Title:** MUV Fresh Bathroom Cleaner™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [bathroom-cleaner, founder-notes]
- **Version:** 1.0
- **Confidence:** N/A
- **Relationships:** []
- **Owner:** Founder
- **Approval Status:** OPEN — awaiting Founder input
- **Review Date:** Upon Founder input
- **Source:** N/A

**Content:**

Intentionally left open. Given this product's pricing conflict traces to a comment written
early in this session's own history, this section would especially benefit from the Founder's
own memory of what happened during that original "found by hand" audit, if available.
