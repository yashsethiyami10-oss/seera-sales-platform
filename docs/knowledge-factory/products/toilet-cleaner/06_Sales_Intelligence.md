# MUV Toilet Cleaner™ — Sales & Marketing Intelligence

---

## KO-TC-SALES-001 — Sales Intelligence

- **KOID:** KO-TC-SALES-001
- **Title:** MUV Toilet Cleaner™ — Sales Intelligence
- **Category:** Sales Intelligence
- **Tags:** [toilet-cleaner, sales, pricing]
- **Version:** 1.0
- **Confidence:** HIGH (retail pricing) / LOW (everything else)
- **Evidence:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 7–8, corroborated exactly by the SOP's
  "Finished Product Details" — no conflict, unlike Liquid Detergent's Cool Water case.
- **Relationships:** KO-TC-VAR-001/002, KO-TC-DESC-002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`;
  `MUV_Toilet_Cleaner_Final_Production_SOP.docx`

**Content:**

**Retail pricing:**

| SKU | MRP |
|---|---|
| 500 ml | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| 5 L | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |

Per FR-001/FR-002, this Sales Intelligence Knowledge Object does not store MRP as fact — the
historical research finding (Product Chart and SOP agreed exactly, unconflicted, at time of
source audit) is preserved as a labeled historical citation in `Source_Conflict_Register.md` and
`00_Source_Register.md` only. Because the product does not yet exist as a real `Product`/`ProductVariant` row in the
platform's commerce database, none of the platform's real sales-intelligence systems
(`CustomerIntelligenceProfile`, the Institutional Sales OS's `SalesIntelligenceSnapshot`,
`actions/inst-reports.ts`) have any data for it yet — same disclosed fact as the Liquid
Detergent package, applicable identically here.

**Institutional pricing caveat:** `lib/inst-sales/consumption-rules.ts` has a placeholder
constant of ₹130/Ltr for "Toilet Cleaner" institutional consumption estimation — the file's own
header explicitly warns this is an approximation for opportunity-sizing, not a real quoted
price. This package does **not** use ₹130/Ltr as sourced pricing (see
`Source_Conflict_Register.md` for why this is documented as a distinct, non-conflicting data
point rather than a third pricing conflict).

**REQUIRES FOUNDER INPUT:**
- Real wholesale/institutional pricing tiers (distinct from the consumption-rules.ts estimate)
- Cost of goods / margin data
- Any sales history (none exists — product not yet catalogued)
- Sales channel strategy

---

## KO-TC-SALES-002 — Marketing Intelligence

- **KOID:** KO-TC-SALES-002
- **Title:** MUV Toilet Cleaner™ — Marketing Intelligence
- **Category:** Marketing Intelligence
- **Tags:** [toilet-cleaner, marketing]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found beyond the colour/fragrance identity already documented in
  `03_Manufacturing.md`/`10_Product_Variants.md`.
- **Relationships:** KO-TC-VAR-001/002
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No marketing campaign history, brand messaging guidelines, or
content strategy was found for this product. As with the Liquid Detergent package, any future
marketing copy must be checked against `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`'s governance rules
before being written — not drafted here.

**One naming note carried over from Manufacturing:** the source SOP's fragrance descriptor
"Harpic Floral" references a third-party competitor brand name as a scent-profile shorthand (see
KO-TC-MFG-001). This package flags this explicitly as something requiring Founder review before
any customer-facing content is derived from this SOP — using a competitor's brand name, even as
internal fragrance shorthand, warrants a deliberate decision about whether/how it should ever
surface externally, rather than being carried forward by default.

---

## KO-TC-SALES-003 — Competitor Comparison

- **KOID:** KO-TC-SALES-003
- **Title:** MUV Toilet Cleaner™ — Competitor Comparison
- **Category:** Sales Intelligence
- **Tags:** [toilet-cleaner, competitors, comparison]
- **Version:** 1.0
- **Confidence:** LOW
- **Evidence:** None found as a deliberate comparison document. Note: "Harpic" appears in the
  source SOP only as a fragrance descriptor (KO-TC-MFG-001), not as a comparison — this package
  does not construct a competitor comparison from that incidental mention.
- **Relationships:** none yet
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** None found — REQUIRES FOUNDER INPUT

**Content:**

**REQUIRES FOUNDER INPUT.** No competitor product names, pricing comparisons, or feature/
performance comparisons were found in any source document.

---

## KO-TC-SALES-004 — Founder Notes

- **KOID:** KO-TC-SALES-004
- **Title:** MUV Toilet Cleaner™ — Founder Notes
- **Category:** Sales Intelligence
- **Tags:** [toilet-cleaner, founder-notes]
- **Version:** 1.0
- **Confidence:** N/A — placeholder section
- **Evidence:** N/A
- **Relationships:** none
- **Owner:** Founder
- **Approval Status:** OPEN — awaiting Founder input
- **Review Date:** Upon Founder input
- **Source:** N/A

**Content:**

This section is intentionally left open for direct Founder notes — in particular, a decision on
the "Harpic Floral" fragrance-naming question (KO-TC-SALES-002) would be valuable here before
this package moves beyond DRAFT status.
