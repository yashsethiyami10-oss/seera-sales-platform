# MUV Car Wash™ — Source Coverage Report

## Sources checked (9 total)

| Source | Result |
|---|---|
| Product Chart | FOUND — rows 18–19; exact agreement with SOP |
| Production SOP | FOUND — full formulation, process, QC; zero safety content; exact pricing/pack-size match with Chart |
| Knowledge Library | FOUND (category-level only) — no product-specific facts, one exploratory colour-philosophy note |
| AI Sutra Master | NOT FOUND |
| AI Sutra Phase1 | NOT FOUND (duplicate location) |
| `prisma/seed.ts` | CONFLICT FOUND — "MUV Shield" confirmed a different, unrelated product |
| `prisma/schema.prisma` | NOT FOUND |
| `lib/inst-sales/consumption-rules.ts` | NOT FOUND — no `CAR_WASH` category |
| `lib/validations/inquiry.ts` | FOUND — "Car Wash" is a real, tracked `BUSINESS_TYPES` value |

**5 sources found real content; 4 confirmed absent.**

## Competitor brand scan

9 brands checked (3M, Turtle Wax, Meguiar's, Bosch, CarPlan, Autoglym, Griot's Garage, Chemical
Guys, Armor All). **Zero hits.**

## What this means for content authority

Formula, process, and QC facts are HIGH confidence (directly sourced, unambiguous, and — for the
first time this session — carry zero Chart/SOP conflict). Compatibility and claims-beyond-QC
facts are entirely unsourced (N/A). Usage/Safety/Contraindications/First Aid/Storage/Shelf Life
are governed by `FR-006`'s CMS-reference architecture rather than sourced directly by this
audit — a mechanism difference, not a content difference, from every prior package's equally
empty safety section.
