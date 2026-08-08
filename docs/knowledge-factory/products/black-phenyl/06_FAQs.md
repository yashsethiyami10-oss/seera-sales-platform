# MUV Black Phenyl™ — FAQs

---

## KO-BP-FAQ-001 — Customer FAQ Set

- **Confidence:** MIXED — some answers confirmed, several explicit "not documented"
- **Source:** Derived from `00_Source_Register.md` through `04_Decision_Trees.md`

**Content:**

| Question | Answer |
|---|---|
| What is MUV Black Phenyl™? | A black-phenyl-concentrate-based floor cleaner, per the SOP's Objective. |
| What size does it come in? | 1L, per direct Founder Instruction (the Product Chart has a conflicting 500ml entry — see `14_FOUNDER_GAPS.md`). |
| How much does it cost? | LIVE — resolve from Product Catalog API (see `10_LIVE_DATA_MAPPING.md`); the AI does not answer from package content. |
| What's in it? | Black Phenyl Concentrate (cleaning & disinfecting base), Turkey Red Oil (emulsifier), Non-Ionic Surfactant, Sodium Carbonate, Preservative, Black Phenyl Fragrance, and pH adjuster/colour if required — SOP §3. |
| How do I use it? | Not documented — the only source is a manufacturing SOP. |
| Do I need to dilute it? | Not documented. |
| How long should I leave it on the floor? | Not documented. |
| Can I use it on any floor surface? | Not documented — do not assume safe. |
| Is this the same as "MUV Phenyl"? | No — MUV Phenyl (1L/5L on the Product Chart) is believed to be a separate product, corresponding to a distinct "White Phenyl" SOP. Do not confuse the two. |
| Does it disinfect? | The formula lists Black Phenyl Concentrate's role as "Cleaning & disinfecting base" — a real, sourced functional description, but no specific efficacy claim, pathogen list, or certification is sourced. |
| How should I store it? | Not documented — no storage condition exists in the SOP. |
| What's the shelf life? | Not documented — the label carries an expiry date, but the duration isn't sourced. |
| What should I do if it gets in my eyes/on my skin? | Not documented in this package. Seek professional medical guidance / emergency services. |
| Is it safe around kids and pets? | Not confirmed. |
| Is this available to buy right now? | Not yet in the product catalogue. |
| What does it smell like? | The SOP's QC criteria describe a "characteristic black phenyl fragrance" — a normal, expected trait, not a defect. |

---

## KO-BP-FAQ-002 — AI Response Guidance

- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`

**Content:** The AI must never answer a price, stock, image, URL, slug, or availability question
from this package's content — those fields always resolve live (`10_LIVE_DATA_MAPPING.md`). The
AI must never state a dilution ratio, contact time, surface compatibility claim, storage
condition, shelf-life figure, disinfection efficacy claim, or first-aid instruction that isn't
sourced. The AI must never state a single pack size as if it were uncontested — the 500ml
Product Chart figure and the 1L SOP/Founder-instructed figure must both be understood internally
(1L is the one presented to customers, per Founder Instruction, but the AI must never claim there
is no discrepancy in the underlying records if directly asked about it).
