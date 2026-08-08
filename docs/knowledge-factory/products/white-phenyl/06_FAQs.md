# MUV White Phenyl™ — FAQs

---

## KO-WP-FAQ-001 — Customer FAQ Set

- **Confidence:** MIXED — some answers confirmed, several explicit "not documented"
- **Source:** Derived from `00_Source_Register.md` through `04_Decision_Trees.md`

**Content:**

| Question | Answer |
|---|---|
| What is MUV White Phenyl™? | A pine-oil-emulsion-based, milky white floor cleaner, per the SOP's Objective. |
| What sizes does it come in? | 1L and 5L, both confirmed by both the Product Chart and the SOP — no conflict. |
| How much does it cost? | LIVE — resolve from Product Catalog API (see `10_LIVE_DATA_MAPPING.md`); the AI does not answer from package content. |
| What's in it? | Pine Oil (cleaning & fragrance), Turkey Red Oil (emulsifier), Non-Ionic Surfactant, Sodium Carbonate, Preservative, Phenyl Fragrance, pH adjuster/colour — SOP §3. |
| How do I use it? | Not documented — the only source is a manufacturing SOP. |
| Do I need to dilute it? | Not documented. |
| How long should I leave it on the floor? | Not documented. |
| Can I use it on any floor surface? | Not documented — do not assume safe. |
| Is this the same as MUV Black Phenyl™? | No — confirmed by this package's own audit to be a genuinely separate, distinctly formulated product (pine-oil-emulsion vs. black-phenyl-concentrate), not a colour variant. |
| Does it disinfect? | The formula's stated roles are cleaning-focused (cleaning & fragrance, emulsion stability) — no specific disinfection efficacy claim is sourced. |
| How should I store it? | Not documented — no storage condition exists in the SOP. |
| What's the shelf life? | Not documented — the label carries an expiry date, but the duration isn't sourced. |
| What should I do if it gets in my eyes/on my skin? | Not documented in this package. Seek professional medical guidance / emergency services. |
| Is it safe around kids and pets? | Not confirmed. |
| Is this available to buy right now? | Not yet in the product catalogue. |
| What does it smell like? | The SOP's QC criteria describe a "characteristic pine/phenyl fragrance" — a normal, expected trait, not a defect. |

---

## KO-WP-FAQ-002 — AI Response Guidance

- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`

**Content:** The AI must never answer a price, stock, image, URL, slug, or availability question
from this package's content — those fields always resolve live (`10_LIVE_DATA_MAPPING.md`). The
AI must never state a dilution ratio, contact time, surface compatibility claim, storage
condition, shelf-life figure, disinfection efficacy claim, or first-aid instruction that isn't
sourced. The AI must never conflate this product with MUV Black Phenyl™.
