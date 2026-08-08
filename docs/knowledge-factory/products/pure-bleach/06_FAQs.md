# MUV Pure Bleach™ — FAQs

---

## KO-PB-FAQ-001 — Customer FAQ Set

- **KOID:** KO-PB-FAQ-001
- **Confidence:** MIXED — some answers confirmed, several explicit "not documented"
- **Evidence:** All prior sections
- **Source:** Derived from `00_Source_Register.md` through `04_Decision_Trees.md`

**Content:**

| Question | Answer |
|---|---|
| What is MUV Pure Bleach™? | A sodium-hypochlorite-based liquid bleach formulated for household cleaning and whitening applications (SOP §1). |
| What size does it come in? | 500 ml only — no other size is confirmed. |
| How much does it cost? | LIVE — resolve from Product Catalog API (see `10_LIVE_DATA_MAPPING.md`); the AI does not answer from package content. |
| What's in it? | Sodium Hypochlorite Solution (10–12%) as the active bleaching & disinfecting agent, RO/DM Water, and, if required, Sodium Hydroxide Solution (pH adjustment) and Sodium Silicate (stabilizer) — SOP §3. |
| How do I use it? | Not documented — the only source is a manufacturing SOP, not a consumer usage guide. See `03_Product_Intelligence.md` KO-PB-INTEL-005. |
| Do I need to dilute it? | Not documented. See KO-PB-INTEL-006. |
| How long should I leave it on a surface? | Not documented. See KO-PB-INTEL-007. |
| Can I use it on coloured fabric? | Not documented — no surface/fabric compatibility guidance exists. Do not assume it's safe. See KO-PB-INTEL-003. |
| Can I mix it with other cleaners? | No — the SOP explicitly states: "Do not mix with acids or ammonia-based cleaners." This includes several other MUV products with a sourced acid ingredient (Toilet Cleaner, Bathroom Cleaner, Glass Cleaner). See `04_Decision_Trees.md`. |
| How should I store it? | Below 30°C, away from direct sunlight (SOP §7). |
| What's the shelf life? | Not documented — the label carries an expiry date, but the duration itself isn't sourced. See KO-PB-INTEL-010. |
| What should I do if it gets in my eyes/on my skin? | Not documented in this package. Seek professional medical guidance / emergency services — do not rely on this AI for first-aid instructions. See `08_Safety.md`. |
| Is it safe around kids and pets? | Not confirmed. See KO-PB-INTEL-003, `08_Safety.md`. |
| Is this available to buy right now? | Not yet in the product catalogue. |
| What does it smell like? | The SOP's QC criteria describe an expected "characteristic chlorine odour" — this is a normal, expected trait per QC, not a defect. |

---

## KO-PB-FAQ-002 — AI Response Guidance

- **KOID:** KO-PB-FAQ-002
- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`
- **Source:** Real platform code

**Content:** The AI must never answer a price, stock, image, URL, slug, or availability question
from this package's content — those fields are always resolved live from the Product Catalog
(`10_LIVE_DATA_MAPPING.md`). The AI must never state a dilution ratio, contact time, surface
compatibility claim, shelf-life figure, or first-aid instruction that isn't sourced — every one of
those is marked Unknown/Founder Decision Required in `03_Product_Intelligence.md` and
`08_Safety.md`, and the AI must answer accordingly, not fill the gap with general chemistry
knowledge.
