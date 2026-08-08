# MUV Black Phenyl™ — Founder Gaps Register

> **New file type, introduced for this package.** A standalone, dedicated register of every
> unresolved gap requiring Founder input — distinct from (but cross-referenced by)
> `13_Reports/05_Missing_Knowledge_Report.md`, which narrates the same gaps in report form. This
> file is the structured, priority-ordered source of truth for what needs Founder attention.

---

## Priority 1 — Critical (blocks confident customer-facing use)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 1 | **Pack-size conflict**: Product Chart states 500ml (₹80); Production SOP states 1L (no MRP given). This task's Founder Instruction specifies 1L, which this package presents to customers — but the Chart's 500ml entry is unexplained. | Corroborates a pre-existing, named codebase conflict (`lib/knowledge-factory/conflict-service.ts`). Is the 500ml entry an error, a discontinued SKU, or a real second pack size with no SOP yet? | KO-BP-ARCH-002 |
| 2 | **First aid instructions** (eye, skin, inhalation, ingestion) — zero sourced anywhere. | Highest-consequence gap for a product this session; the SOP itself references real SDS documents that aren't accessible to this package. | KO-BP-SAFETY-004/005/006/007 |
| 3 | **Consumer usage/dilution/contact-time instructions** — the only source is a manufacturing SOP. | The AI cannot currently tell a customer how to use the product at all, only what it's made of. | KO-BP-INTEL-005/006/007 |

## Priority 2 — Important (materially limits customer-facing usefulness)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 4 | **Storage condition** — completely unsourced (a real difference from Pure Bleach, which had one). | No temperature/light/humidity guidance exists at all. | KO-BP-SAFETY-010 |
| 5 | **Surface compatibility** — which floor types is this safe/effective on? | Not sourced; relevant to nearly every customer conversation flow. | KO-BP-INTEL-003 |
| 6 | **Shelf-life duration** — an expiry date is confirmed to exist on the label, but its length isn't stated. | KO-BP-INTEL-010 |
| 7 | **The real Safety Data Sheets** the SOP itself references ("handle raw materials according to their safety data sheets") — not included in or accessible from any source searched. | Obtaining these would directly close gaps #2, #4, #5, and #9. | KO-BP-SAFETY-001 |
| 8 | **Disinfection efficacy / regulatory certification** — the formula table calls the concentrate a "cleaning & disinfecting base," but no kill-rate, pathogen list, or regulatory registration is sourced. | Directly relevant to Hospital, School, and Restaurant conversation flows, where this is the single most likely question. | KO-BP-CONV-007, KO-BP-CONV-013 |
| 9 | **Mixing compatibility with other cleaning products** — no restriction OR confirmation of safety exists (unlike Pure Bleach, which had an explicit restriction). | The AI currently cannot say whether mixing is safe or unsafe — it must say "unknown," which is a weaker answer than either a confirmed restriction or confirmed compatibility would be. | KO-BP-SAFETY-003 |

## Priority 3 — Standard completeness gaps

| # | Gap | Related KOID |
|---|---|---|
| 10 | Manufacturer name | KO-BP-ARCH-001 |
| 11 | SKU code, barcode | KO-BP-ARCH-002 |
| 12 | Fill weight (not given, unlike several prior products' SOPs) | KO-BP-ARCH-002 |
| 13 | Packaging dimensions, shipping weight | KO-BP-ARCH-002 |
| 14 | Product images (none exist in source at all) | `10_LIVE_DATA_MAPPING.md` |
| 15 | Spill management procedure | KO-BP-SAFETY-011 |
| 16 | Disposal guidance | KO-BP-SAFETY-012 |
| 17 | Child/pet-specific safety guidance | KO-BP-SAFETY-008/009 |
| 18 | Institutional consumption-estimation tooling (no `PHENYL` category exists in `lib/inst-sales/consumption-rules.ts`) | — |
| 19 | Formal positioning/marketing statement | — |
| 20 | Confirm the relationship between "MUV Black Phenyl" and the separate "MUV Phenyl"/(presumed) "White Phenyl" product — same manufacturer line, different formula entirely, or something else? | KO-BP-INTEL-015 |

---

## Summary

**20 distinct gaps recorded — 3 Critical, 6 Important, 11 Standard.** None are filled with
inference or general chemistry/floor-cleaner knowledge. Every gap above is cross-referenced from
the specific Knowledge Object(s) it affects, so a future update only needs to touch the KOs
listed here once real information becomes available.
