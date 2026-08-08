# MUV Black Phenyl™ — Requirements

> This package's own implementation spec, traceable to the Founder's instruction for Product
> Family 08. Recorded before authoring any Knowledge Object.

---

## Product scope

- **Product Family:** MUV Black Phenyl™ (Parent product, no variants)
- **Available Pack Size:** 1L, per direct Founder Instruction — matching the Production SOP, in
  conflict with the Product Chart's 500ml entry (see `00_Source_Register.md`,
  `14_FOUNDER_GAPS.md`)

## Governance to follow exactly

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md` — the complete,
  and only, governance framework.
- Implementation only. No architecture changes.

## Mandatory execution order (per this task's explicit instruction)

1. Complete Source Audit — done (`00_Source_Register.md`)
2. Build Source Register — done
3. Requirement Analysis — this file
4. Product Architecture (`02`)
5. Product Intelligence (`03`)
6. Knowledge Objects (embedded throughout `02`–`09`)
7. Decision Trees (`04`)
8. Customer Conversations (`05`)
9. FAQs (`06`)
10. Objection Handling (`07`)
11. Safety (`08`)
12. Founder Rules (`09`)
13. LIVE_DATA_MAPPING (`10`)
14. FOUNDER_GAPS (`14`, new file type)
15. JSON Generation (`11_JSON/`)
16. Validation (`12_Validation/`)
17. Reports (`13_Reports/`)
18. MASTER Document
19. Freeze Recommendation

## Mandatory rules applied throughout

1. **Never Invent.** Every fact traces to a real source. Unverifiable information is marked
   **Unknown**, **Not Available**, or **Founder Decision Required** — never inferred.
2. **Source First.** Complete audit before authoring. Done.
3. **Repository First.** Actual current repository state (not memory) is the source of truth —
   confirmed via `Glob` at the start of this task.
4. **Care Intelligence.** Truth → Safety → Care → Clarity → Actionability → Validation.
5. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).** No MRP, selling price, discount,
   offers, stock, availability, product URL, slug, or marketplace pricing stored anywhere. All
   resolve via `10_LIVE_DATA_MAPPING.md`.

## Customer conversation flows required (13)

First-time customer, returning customer, household cleaning, commercial cleaning, office, school,
hospital, restaurant, hotel, heavy floor cleaning, daily floor maintenance, odour control,
hygiene-related queries — `05_Customer_Conversation.md`. (This is a different, larger set than
Pure Bleach's 11 flows — no flow is reused verbatim from that package; each is authored fresh for
Black Phenyl's own real facts.)

## Safety requirement

Include only verified safety information. Never generate unsupported medical or chemical
guidance. Every missing safety area is documented in `14_FOUNDER_GAPS.md`, not filled in.

## Required end-of-package outputs

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Source Coverage Report
5. Missing Knowledge Report
6. Product Quality Score
7. Care Intelligence Report
8. Freeze Recommendation

All eight live in `13_Reports/`.

## Stop Rule

After this package is complete: **STOP.** Do not begin the next Product Family without explicit
Founder approval.
