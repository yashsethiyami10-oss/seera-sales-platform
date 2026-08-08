# MUV Hand Wash™ — Knowledge Object Statistics

## Totals

| Metric | Count |
|---|---|
| Total Knowledge Objects | 77 |
| Parent-level KOs | 65 (84.4%) |
| Variant-level KOs | 12 (15.6%) |

## By file

| File | KOs |
|---|---|
| `02_Product_Architecture.md` | 13 |
| `03_Product_Intelligence.md` | 15 |
| `04_Decision_Trees.md` | 8 |
| `05_Customer_Conversation.md` | 12 |
| `06_FAQs.md` | 2 |
| `07_Objection_Handling.md` | 8 |
| `08_Safety.md` | 11 |
| `09_Founder_Rules.md` | 8 |
| **Total** | **77** |

## By confidence

| Confidence | Count | % |
|---|---|---|
| HIGH | 37 | 48.1% |
| MEDIUM | 16 | 20.8% |
| MIXED | 4 | 5.2% |
| N/A (unsourced, explicitly flagged) | 20 | 26.0% |
| LOW | 0 | 0% |

Weighted confidence average (HIGH=1.0, MEDIUM=0.6, LOW=0.3, MIXED=0.5, N/A=0.0):
(37×1.0 + 16×0.6 + 4×0.5 + 20×0) ÷ 77 = 48.6 ÷ 77 = **63.1%.**

## Comparison to Body Wash

| Metric | Body Wash | Hand Wash |
|---|---|---|
| Total KOs | 72 | **77** |
| Parent KOs | 63 | 65 |
| Variant KOs | 9 | **12** |
| HIGH confidence | — | 37 (48.1%) |
| N/A (unsourced) | — | 20 (26.0%) |
| Weighted confidence average | 52.1% | **63.1%** |

Hand Wash's higher variant-KO count reflects 4 variants with asymmetric availability (8 real
SKUs + 4 recommendation-logic KOs = 12) versus Body Wash's 3 symmetric variants (6 SKUs + 3
recommendation-logic KOs = 9). The higher weighted confidence average reflects a more thoroughly
and exactly sourced manufacturing process (13 steps vs. 12, with both override points identified
precisely) — it does **not** reflect better safety documentation, which is equally absent in both
packages. See `07_Product_Quality_Score.md`'s Safety Risk Flag.
