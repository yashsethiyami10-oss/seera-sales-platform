# MUV Floor Cleaner™ — Sales Intelligence

---

## KO-FC-SALES-001 — Sales Intelligence (Family Overview)

- **KOID:** KO-FC-SALES-001
- **Title:** MUV Floor Cleaner™ — Sales Intelligence (Family Overview)
- **Category:** Sales Intelligence
- **Tags:** [floor-cleaner, sales, pricing, shared, parent]
- **Version:** 1.0
- **Confidence:** MIXED — 1L pricing HIGH/clean; 5L pricing CONFLICTED for both variants
- **Evidence:** Product Chart rows 14–17; SOP Packing Standard
- **Relationships:** KO-FC-VM-VAR-001, KO-FC-VM-VAR-002, KO-FC-CW-VAR-001, KO-FC-CW-VAR-002, `20_Source_Conflict_Register.md`
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** CONFIDENTIAL — Sales/Founder/Admin (see `23_Knowledge_Visibility_Matrix.md`)
- **Review Date:** Upon Founder approval
- **Source:** Product Chart rows 14–17; SOP Packing Standard table

**Content:**

**Pricing (1L and 5L, all variants): LIVE — resolve from Product Catalog API (see
`LIVE_DATA_MAPPING.md`).** Per FR-001/FR-002, this Knowledge Object never states a live MRP or
selling price as fact — pricing must always be read at answer time from `ProductVariant.mrp` /
`ProductVariant.price` once each variant is catalogued.

A historical Chart-vs-SOP pricing discrepancy was recorded during source audit for both variants'
5L pack (a genuine three-way figure mismatch), and the 1L pack figures agreed cleanly across
sources — see `20_Source_Conflict_Register.md` CONFLICT-001/CONFLICT-002 for the full historical
record. Those figures are historical source citations only, recorded during source audit — never
live, AI-answerable facts. This directly corroborates the pre-existing
`lib/knowledge-factory/conflict-service.ts` header comment, which explicitly names "Floor
Cleaner" among products with known pricing/naming conflicts found by hand this session — this
package's own audit independently reproduced the specific numbers that comment only referenced by
name; that reproduction remains a source-audit finding, not a live pricing fact.

**Institutional/placeholder pricing (explicitly NOT the real MRP, and NOT a Knowledge Factory
value either):** `lib/inst-sales/consumption-rules.ts` carries an internal, non-customer-facing
business-rule placeholder institutional estimate of ₹110/Ltr for `FLOOR_CLEANER`, self-labeled a
"placeholder institutional price list" in the file's own header. This figure is never presented
to a customer or to the customer-facing AI as a real product price — it exists solely to drive an
internal institutional-sales consumption estimate (`cleaningAreaSqft × 0.004 Ltr/sqft × frequency
factor`) and is not variant-aware. It is not resolved from, or duplicated into, the Product
Catalog, and it is not a Knowledge Factory commercial fact under FR-001 — it is flagged here only
so the placeholder's existence and its non-authoritative status are documented.

**Rose Water:** no pricing exists anywhere, live or historical. See
`02_Product_Family_and_Variants.md` KO-FC-RW-VAR-001.

---

## KO-FC-SALES-002 — Competitor Comparison

- **KOID:** KO-FC-SALES-002
- **Title:** MUV Floor Cleaner™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [floor-cleaner, competitor, shared, parent]
- **Version:** 1.0
- **Confidence:** HIGH — clean scan result
- **Evidence:** `22_Competitor_Reference_Register.md`
- **Relationships:** KO-FC-COMPETITOR-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Competitor Reference Register

**Content:**

No competitor brand comparison data exists in any source. The scan gave special attention to
Lizol, Domex, and Dettol — real, well-known floor-cleaner competitor brands in the Indian market
— with zero hits anywhere in the Product Chart, SOP, or Knowledge Library. See
`22_Competitor_Reference_Register.md` for the full scan record, including the word-boundary
methodology used to eliminate "Rin"-style substring false positives.

---

## KO-FC-SALES-003 — Founder Notes

- **KOID:** KO-FC-SALES-003
- **Title:** MUV Floor Cleaner™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [floor-cleaner, founder-notes, shared, parent]
- **Version:** 1.0
- **Confidence:** N/A
- **Evidence:** None
- **Relationships:** KO-FC-19-Founder-Input
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None — placeholder for future Founder input

**Content:**

No wholesale/institutional pricing, cost of goods, margin data, or marketing campaign history
exists in any source for this product family. REQUIRES FOUNDER INPUT.
