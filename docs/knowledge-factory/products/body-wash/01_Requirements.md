# MUV Body Wash™ — Requirements

> This package's own implementation spec, traceable to the Founder's instruction for Product
> Family 10. Recorded before authoring any Knowledge Object.

---

## Product scope

- **Product Family:** MUV Body Wash™ (Category: Body Care) — Parent product with **three
  fragrance variants**: Crimson Veil, Velvet Oak, Midnight Frost
- **Available Pack Sizes:** 250ml, 950ml — both confirmed for all three variants, no conflict
- **First Body Care category product this session** — heightened discipline against inventing
  cosmetic/dermatological claims, fragrance notes, or emotional claims

## Governance to follow exactly

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`
  (`FR-001`–`FR-004`).
- Implementation only. No architecture changes.

## Mandatory execution order

Source Audit → Source Register → Requirement Analysis → Product Architecture → **Design Variant
Inheritance Architecture** (new step, per `FR-004`) → Product Intelligence → Knowledge Objects →
Decision Trees → Customer Conversations → FAQs → Objection Handling → Safety → Founder Rules →
LIVE_DATA_MAPPING → FOUNDER_GAPS → JSON Generation → Validation → Reports → MASTER Document →
Freeze Recommendation.

## Mandatory rules applied throughout

1. **Never Invent**, extended explicitly to cosmetic/dermatological claims, fragrance notes, and
   emotional claims about any variant — none are sourced, none are invented.
2. **Source First / Repository First.**
3. **Care Intelligence.** Truth → Safety → Care → Clarity → Actionability → Validation.
4. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).**
5. **Knowledge Reuse First (`FR-003`).** No specific prior-package subset was named in this
   task's instruction (unlike White Phenyl's explicit list) — this package therefore compares
   against the full set of nine prior packages, with Floor Cleaner given particular weight as the
   only other Variant Inheritance precedent. Full account in
   `13_Reports/09_Knowledge_Reuse_Summary.md`.
6. **Variant Inheritance Architecture (`FR-004`, first applied here).** Shared knowledge exists
   exactly once at Parent level. Only genuinely variant-specific knowledge (fragrance identity)
   exists in Variant Knowledge Objects. Never duplicate common knowledge across variants. The
   Variant Inheritance Map is embedded in `02_Product_Architecture.md`.

## Body Care requirements (specific to this package)

Treat MUV Body Wash™ as one Product Family with three fragrance variants. Colour is **shared**
across all variants (a real, sourced structural difference from Floor Cleaner, where colour was
the variant override) — the single variant-specific override point in this product's formula is
**fragrance** (SOP Step 9).

## Product Intelligence coverage required

Product purpose, skin cleansing mechanism, key benefits, suitable skin types, usage instructions,
ingredients (only if verified), active ingredients, fragrance characteristics, packaging,
storage, shelf life, limitations, safety, contraindications, customer expectations —
`03_Product_Intelligence.md`. Never invent cosmetic or dermatological claims.

## Customer conversation flows required (12)

First-time customer, returning customer, daily shower routine, oily skin, dry skin, sensitive
skin (only if verified — none is, so this flow documents that honestly), gym users, family use,
premium fragrance selection, fragrance comparison, variant recommendation, gift recommendation —
`05_Customer_Conversation.md`.

## Variant Intelligence required

Recommendation logic for Crimson Veil, Velvet Oak, Midnight Frost — recommend variants only using
verified differences (the sourced fragrance-family labels); do not invent fragrance notes or
emotional claims — `04_Decision_Trees.md`.

## Safety requirement

Include only verified safety information. Do not generate unsupported dermatological advice.
Mark unsupported information as Unknown/Founder Decision Required. **This SOP contains zero
sourced safety content of any kind** — the most severe such gap of any product this session,
documented prominently in `08_Safety.md` and `14_FOUNDER_GAPS.md`.

## Knowledge Reuse requirement

Reuse verified Parent Knowledge Objects wherever appropriate. Generate a Knowledge Reuse Summary
including: Parent Objects, Variant Objects, Shared Objects, New Objects, Reuse Percentage — a
five-category structure, distinct from White Phenyl's four-category structure (which had no
separate "Variant Objects" category, since White Phenyl had no variants) — `13_Reports/`.

## Required end-of-package outputs

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Variant Statistics (new, per this task's multi-variant structure)
5. Source Coverage Report
6. Missing Knowledge Report
7. Product Quality Score
8. Care Intelligence Report
9. Knowledge Reuse Summary
10. Freeze Recommendation

All ten live in `13_Reports/`.

## Stop Rule

After this package is complete: **STOP.** Do not begin MUV Hand Wash™ or any other Product
Family without explicit Founder approval.
