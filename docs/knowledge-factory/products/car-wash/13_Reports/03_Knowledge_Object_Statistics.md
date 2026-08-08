# MUV Car Wash™ — Knowledge Object Statistics

## Totals

| Metric | Count |
|---|---|
| Total Knowledge Objects | 54 |
| Variant-level KOs | 0 (`FR-004` Not Applicable) |

## By file

| File | KOs |
|---|---|
| `02_Product_Architecture.md` | 5 |
| `03_Product_Intelligence.md` | 11 |
| `04_Decision_Trees.md` | 3 |
| `05_Customer_Conversation.md` | 12 |
| `06_FAQs.md` | 2 |
| `07_Objection_Handling.md` | 6 |
| `08_Safety.md` | 7 |
| `09_Founder_Rules.md` | 8 |
| **Total** | **54** |

## By confidence

| Confidence | Count | % |
|---|---|---|
| HIGH | 27 | 50.0% |
| MEDIUM | 11 | 20.4% |
| CMS_REFERENCED (FR-006, source unpopulated) | 10 | 18.5% |
| N/A (unsourced, explicitly flagged) | 5 | 9.3% |
| MIXED | 1 | 1.9% |

Weighted confidence average (HIGH=1.0, MEDIUM=0.6, MIXED=0.5, N/A=0, CMS_REFERENCED=0 — treated
as an empty source for this metric despite being architecturally correct):
(27×1.0 + 11×0.6 + 1×0.5 + 5×0 + 10×0) ÷ 54 = 34.1 ÷ 54 = **63.1%.**

Knowledge Completeness (HIGH+MEDIUM+MIXED, i.e. genuinely sourced content) = 39 ÷ 54 = **72.2%.**

## Comparison to Hand Wash

| Metric | Hand Wash | Car Wash |
|---|---|---|
| Total KOs | 77 | **54** |
| Variant KOs | 12 | **0** |
| Safety-file KOs | 11 (field-by-field Unknown) | **7 (5 CMS-referenced, 2 real content)** |
| Weighted confidence average | 63.1% | 63.1% (coincidentally identical) |
| Reuse percentage | 23.4% | **33.3%** |

Car Wash's leaner total reflects two structural facts, not a lower-effort audit: no variant
architecture (`FR-004` Not Applicable) and `FR-006`'s consolidation of six previously-separate
safety-field disclosures into five reusable CMS-reference KOs.
