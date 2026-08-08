# MUV White Phenyl™ — Requirements

> This package's own implementation spec, traceable to the Founder's instruction for Product
> Family 09. Recorded before authoring any Knowledge Object.

---

## Product scope

- **Product Family:** MUV White Phenyl™ (Parent product, no fragrance/colour variants — one
  formula, two pack sizes)
- **Available Pack Sizes:** 1L, 5L — both confirmed by both sources, no conflict

## Governance to follow exactly

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md`.
- Implementation only. No architecture changes.

## Mandatory execution order

Source Audit → Source Register → Requirement Analysis → Product Architecture → Product
Intelligence → Knowledge Objects → Decision Trees → Customer Conversations → FAQs → Objection
Handling → Safety → Founder Rules → LIVE_DATA_MAPPING → FOUNDER_GAPS → JSON Generation →
Validation → Reports → MASTER Document → Freeze Recommendation.

## Mandatory rules applied throughout

1. **Never Invent.** Every fact traces to a real source; unverifiable information is marked
   Unknown/Not Available/Founder Decision Required.
2. **Source First.** Complete audit before authoring. Done.
3. **Repository First.** Actual current repository state, confirmed directly, is the source of
   truth.
4. **Care Intelligence.** Truth → Safety → Care → Clarity → Actionability → Validation.
5. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).** No commercial field stored anywhere;
   all resolve via `10_LIVE_DATA_MAPPING.md`.
6. **Knowledge Reuse First (`FR-003`, new for this package).** Before authoring, compared against
   Floor Cleaner, Black Phenyl, Pure Bleach, Bathroom Cleaner, and Glass Cleaner (the exact
   Founder-named subset for this task). Reused verified patterns/methodology; created new content
   only where genuinely product-specific. Full account in
   `13_Reports/08_Knowledge_Reuse_Summary.md`, with complete traceability back to the originating
   package/KOID or real platform code for every reused pattern.

## Customer conversation flows required (12)

First-time customer, returning customer, household cleaning, daily floor cleaning, commercial
cleaning, hotel, hospital, school, office, washroom cleaning, odour control, hygiene maintenance
— `05_Customer_Conversation.md`.

## Safety requirement

Include only verified safety information. **Do not copy safety guidance from previous products
unless it is directly supported by verified sources** — White Phenyl's own SOP safety section
(§7) was independently extracted and is structurally similar to, but not verbatim identical to,
Black Phenyl's — each product's safety content is sourced from its own document, never borrowed.
Every unresolved safety gap is documented in `14_FOUNDER_GAPS.md`.

## Required end-of-package outputs

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Source Coverage Report
5. Missing Knowledge Report
6. Product Quality Score
7. Care Intelligence Report
8. Knowledge Reuse Summary (new, per `FR-003`)
9. Freeze Recommendation

All nine live in `13_Reports/`.

## Stop Rule

After this package is complete: **STOP.** Do not begin the next Product Family without explicit
Founder approval.
