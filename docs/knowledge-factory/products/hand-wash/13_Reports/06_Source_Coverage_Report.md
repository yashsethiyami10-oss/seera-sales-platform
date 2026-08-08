# MUV Hand Wash™ — Source Coverage Report

## Sources checked (9 total)

| Source | Result |
|---|---|
| Product Chart | FOUND — rows 24–31; conflicts with the Founder's matrix (see Variant Availability Report) |
| Production SOP | FOUND — full formulation, process, QC; zero safety content; generic pricing conflicts numerically with the Chart |
| Knowledge Library | FOUND (governance rule only) — no Hand Wash-specific facts |
| AI Sutra Master | NOT FOUND |
| AI Sutra Phase1 | NOT FOUND (duplicate location, same result) |
| `prisma/seed.ts` | CONFLICT FOUND — two naming-adjacency placeholders, no direct match |
| `prisma/schema.prisma` | NOT FOUND |
| `lib/inst-sales/consumption-rules.ts` | FOUND — generic `HAND_WASH` category, not variant-aware |
| `lib/knowledge-factory/conflict-service.ts` | FOUND (header only) — "GLOW" naming conflicts already named |

**5 sources found real content; 4 confirmed absent or irrelevant.**

## Competitor brand scan

9 brands checked (Lifebuoy, Dettol, Savlon, Godrej Protekt, Santoor, Dove, Pears, Palmolive,
Fiama) across the Product Chart, SOP, Knowledge Library, and AI Sutra. **Zero hits.**

## What this means for content authority

Formula, process, and QC facts are HIGH confidence (directly sourced, unambiguous). Safety,
usage, and skin-type facts are entirely unsourced (N/A, per `FR-005`'s explicit field-by-field
marking). Availability facts are governed by direct Founder Instruction, not purely by source
material — see the Variant Availability Report for how the Chart's own conflicting data was
handled.
