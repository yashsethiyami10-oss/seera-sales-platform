# MUV Body Wash™ — FAQs

---

## KO-BW-FAQ-001 — Customer FAQ Set

- **Confidence:** MIXED — some answers confirmed, several explicit "not documented"
- **Source:** Derived from `00_Source_Register.md` through `04_Decision_Trees.md`

**Content:**

| Question | Answer |
|---|---|
| What is MUV Body Wash™? | A liquid body wash containing 1% Salicylic Acid, formulated with an SLES/CAPB cleansing system, in three fragrance variants: Crimson Veil, Velvet Oak, Midnight Frost. |
| What sizes does it come in? | 250ml and 950ml, both confirmed for all three variants. |
| How much does it cost? | LIVE — resolve from Product Catalog API (see `10_LIVE_DATA_MAPPING.md`); the AI does not answer from package content. |
| What's in it? | RO/DM Water, SLES 28%, CAPB, Cocamide DEA, Glycerin, Propylene Glycol, Salicylic Acid (1%), HEC, Preservative, Fragrance, Colour, pH Adjuster — a manufacturing formula, not a consumer INCI label. |
| Is it suitable for my skin type? | Not documented for any skin type (oily, dry, sensitive, or otherwise). |
| How do I use it? | Not documented — the only source is a manufacturing SOP. |
| What does each variant smell like? | Crimson Veil: Premium Floral. Velvet Oak: Woody Premium. Midnight Frost: Fresh Cooling. No deeper fragrance-note detail is sourced for any variant. |
| Is it dermatologically tested / hypoallergenic / pH balanced? | Not documented — no such claim exists in any source. The product's pH target (4.5–5.0) is an internal manufacturing/QC specification, not a "pH balanced" marketing claim. |
| Is it safe? | No safety information of any kind is sourced for this product — the most significant gap in this package. See `08_Safety.md`. |
| What should I do if it irritates my skin? | Not documented in this package. Discontinue use and consult a healthcare professional — do not rely on this AI for dermatological guidance. |
| Is it safe around kids? | Not confirmed. |
| Is this available to buy right now? | Not yet in the product catalogue under any of the three real variant names. |
| Is "MUV Cleanse" the same as MUV Body Wash™? | No — "MUV Cleanse" is a different, unrelated placeholder product in MUV's internal records, with a different fragrance, pack sizes, and pricing. It is not one of the three real variants (Crimson Veil, Velvet Oak, Midnight Frost). |

---

## KO-BW-FAQ-002 — AI Response Guidance

- **Confidence:** HIGH
- **Evidence:** `lib/intelligence/confidence-engine.ts`

**Content:** The AI must never answer a price, stock, image, URL, slug, or availability question
from this package's content. The AI must never state a skin-type suitability claim, benefit
claim, usage instruction, storage condition, shelf-life figure, contraindication answer, or any
cosmetic/dermatological claim ("sensitive skin safe," "dermatologically tested," "pH balanced,"
"hypoallergenic," "moisturizing") that isn't sourced — none of these are sourced for this
product. The AI must never use the "MUV Cleanse" seed-data record as a source for any of the
three real variants.
