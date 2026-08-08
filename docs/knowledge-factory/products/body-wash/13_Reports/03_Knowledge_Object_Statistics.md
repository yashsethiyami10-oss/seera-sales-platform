# MUV Body Wash™ — Knowledge Object Statistics

## Totals

- **Total Knowledge Objects: 72** (verified via `PowerShell`/`ConvertFrom-Json`)

## By category

| Category | Count |
|---|---|
| Product Architecture (incl. Variant Inheritance Map, 6 variant SKUs) | 10 |
| Product Intelligence | 15 |
| Decision Trees (incl. 3 variant recommendation KOs) | 8 |
| Customer Conversation | 12 |
| FAQs | 2 |
| Objection Handling | 8 |
| Safety | 10 |
| Founder Rules | 7 |
| **Total** | **72** |

## By confidence tier

| Tier | Count | % |
|---|---|---|
| HIGH | 29 | 40.3% |
| MEDIUM | 12 | 16.7% |
| LOW | 1 | 1.4% |
| MIXED | 2 | 2.8% |
| N/A (Unknown/Founder Decision Required) | 28 | 38.9% |

**Interpretation:** N/A proportion (38.9%) is the lowest of the four manufacturing-only-SOP-
style products this session (Pure Bleach 48.4%, Black Phenyl 47.7%, White Phenyl 46.2%) —
somewhat counterintuitive given this package has the single most severe individual gap (zero
safety content). This is because Body Wash's HIGH-confidence count is unusually large: all six
SKUs are cleanly sourced (no conflict, unlike Black Phenyl), all three fragrance families are
sourced (unlike Floor Cleaner's Rose Water), and the formulation/active-ingredient facts are
fully sourced. The severity of the safety gap is better reflected in the Product Quality Score's
separate treatment (see `07_Product_Quality_Score.md`) than in the raw N/A percentage alone.
