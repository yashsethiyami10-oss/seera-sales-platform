# MUV Pure Bleach™ — Knowledge Object Statistics

## Totals

- **Total Knowledge Objects: 62** (verified via `PowerShell`/`ConvertFrom-Json` against
  `11_JSON/knowledge_objects.json`)

## By category

| Category | Count |
|---|---|
| Product Architecture | 3 |
| Product Intelligence | 16 |
| Decision Trees | 4 |
| Customer Conversation | 11 |
| FAQs | 2 |
| Objection Handling | 8 |
| Safety | 13 |
| Founder Rules | 5 |
| **Total** | **62** |

## By confidence tier

| Tier | Count | % |
|---|---|---|
| HIGH | 21 | 33.9% |
| MEDIUM | 6 | 9.7% |
| MIXED | 5 | 8.1% |
| N/A (Unknown/Founder Decision Required) | 30 | 48.4% |

**Interpretation:** nearly half of all Knowledge Objects in this package are explicit
Unknown/Founder Decision Required markers — a direct, honest consequence of the source material
being a manufacturing-only SOP for a product family with no consumer usage documentation. This is
the highest N/A proportion of any of the seven product families built this session, and is
flagged prominently rather than smoothed over — see `05_Missing_Knowledge_Report.md`.
