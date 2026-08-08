# MUV Pure Bleach™ — Missing Knowledge Report

> Every gap below is a real, confirmed absence — not an oversight. Per the strict Never-Invent
> rule, none of these are filled with general chemistry/cleaning-product knowledge.

## Highest priority

1. **First aid (eye/skin/inhalation/ingestion)** — zero sourced guidance for a hypochlorite-based
   product. This is the single most important gap in the package given the hazard class involved.
2. **Consumer usage instructions** — the only source is a manufacturing SOP; there is no
   "how to use this product" guidance anywhere. This affects nearly every customer-facing
   conversation flow.
3. **Shelf life / expiry duration** — the label is confirmed to carry an expiry date, but the
   actual duration is never stated.

## Also missing

4. Dilution ratio (if any)
5. Contact/soak time
6. Surface and fabric compatibility (including colour-fastness on fabric)
7. Numeric available-chlorine QC specification (the SOP references an "internal specification"
   without giving its value)
8. Equipment specification (only "a clean mixing vessel," generic)
9. Fill weight (unlike five of the six prior products' SOPs, no gram figure is given)
10. Manufacturer name
11. SKU code, barcode
12. Packaging dimensions, shipping weight
13. Product images (none exist in the source at all — no embedded photo)
14. Spill management procedure
15. Disposal guidance
16. Child/pet-specific safety guidance
17. Institutional consumption-estimation tooling (no `BLEACH` category exists in
    `lib/inst-sales/consumption-rules.ts`, unlike Floor Cleaner/Glass Cleaner)
18. Formal positioning/marketing statement
19. Competitive differentiation (none sourced, none invented)

## What this means practically

Roughly half of this package's 62 Knowledge Objects are explicit gap markers (see
`03_Knowledge_Object_Statistics.md`). The AI can confidently state the product's purpose,
formulation-level ingredients, storage condition, and the one real mixing restriction — but
cannot answer "how do I use this," "how long does it last," or "what do I do if it touches my
skin" from this package alone. Every one of these gaps is recommended for real Founder input
(ideally sourced from an actual product label, SDS, or a revised consumer-facing SOP) before this
package should be considered ready for a full customer-facing launch — see
`08_Freeze_Recommendation.md`.
