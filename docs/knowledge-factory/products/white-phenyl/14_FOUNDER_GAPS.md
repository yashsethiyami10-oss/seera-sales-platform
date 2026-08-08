# MUV White Phenyl™ — Founder Gaps Register

> Structure reused from Black Phenyl's `14_FOUNDER_GAPS.md` (see
> `13_Reports/08_Knowledge_Reuse_Summary.md`), content independently compiled for this product.
> A standalone, priority-ordered register of every unresolved gap requiring Founder input.

---

## Priority 1 — Critical (blocks confident customer-facing use)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 1 | **First aid instructions** (eye, skin, inhalation, ingestion) — zero sourced anywhere. | Highest-consequence gap; the SOP references real SDS documents not accessible to this package. | KO-WP-SAFETY-004/005/006/007 |
| 2 | **Consumer usage/dilution/contact-time instructions** — the only source is a manufacturing SOP. | The AI cannot currently tell a customer how to use the product at all. | KO-WP-INTEL-005/006/007 |

**Note:** unlike Black Phenyl, this package has **no Priority-1 pack-size conflict** — both
sources agree exactly on 1L and 5L.

## Priority 2 — Important (materially limits customer-facing usefulness)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 3 | **Storage condition** — completely unsourced. | No temperature/light/humidity guidance exists at all. | KO-WP-SAFETY-010 |
| 4 | **Surface compatibility** — which floor types is this safe/effective on? | Relevant to nearly every customer conversation flow. | KO-WP-INTEL-003 |
| 5 | **Shelf-life duration** — an expiry date is confirmed to exist on the label, but its length isn't stated. | KO-WP-INTEL-010 |
| 6 | **The real Safety Data Sheets** the SOP itself references — not included in or accessible from any source searched. | Obtaining these would directly close gaps #1, #3, #4. | KO-WP-SAFETY-001 |
| 7 | **Disinfection efficacy / regulatory certification** — the formula table describes cleaning-focused roles, but no kill-rate, pathogen list, or regulatory registration is sourced. | Directly relevant to Hospital and School conversation flows. | KO-WP-CONV-007, KO-WP-CONV-012 |
| 8 | **Mixing compatibility with other cleaning products** — no restriction OR confirmation of safety exists. | Directly relevant to the Washroom Cleaning flow (multiple chemicals often used in rotation). | KO-WP-SAFETY-003, KO-WP-CONV-010 |

## Priority 3 — Standard completeness gaps

| # | Gap | Related KOID |
|---|---|---|
| 9 | Manufacturer name | KO-WP-ARCH-001 |
| 10 | SKU code, barcode (per pack size) | KO-WP-ARCH-002 |
| 11 | Fill weight (both pack sizes) | KO-WP-ARCH-002 |
| 12 | Packaging dimensions, shipping weight | KO-WP-ARCH-002 |
| 13 | Product images (none exist in source at all) | `10_LIVE_DATA_MAPPING.md` |
| 14 | Spill management procedure | KO-WP-SAFETY-011 |
| 15 | Disposal guidance | KO-WP-SAFETY-012 |
| 16 | Child/pet-specific safety guidance | KO-WP-SAFETY-008/009 |
| 17 | Institutional consumption-estimation tooling (no `PHENYL` category exists in code) | — |
| 18 | Formal positioning/marketing statement | — |

---

## Summary

**18 distinct gaps recorded — 2 Critical, 6 Important, 10 Standard.** Two fewer than Black
Phenyl's 20, driven entirely by the absence of a pack-size conflict here (Black Phenyl's #1)
and this package's independently confirmed product-identity relative to Black Phenyl (Black
Phenyl's own #20 gap, not repeated here since it's resolved from this package's perspective).
None of the remaining gaps are filled with inference or general chemistry/floor-cleaner
knowledge.
