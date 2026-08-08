# MUV Pure Bleach™ — Requirements

> This package's own implementation spec, traceable to the Founder's instruction for Product
> Family 07. Recorded before authoring any Knowledge Object, per the Source-First / Validation-
> First rules.

---

## Product scope

- **Product Family:** MUV Pure Bleach™ (Parent product, no fragrance/colour variants)
- **Available Pack Size:** 500ml (the only pack size confirmed in any source — see
  `00_Source_Register.md`)
- **Reuse policy:** do not reuse another product package's Knowledge Objects directly; cross-
  reference other packages' already-sourced facts only where genuinely relevant (e.g. safety
  decision trees comparing Bleach's mixing restriction against other products' real, sourced acid
  content) — never copy content wholesale.

## Governance to follow exactly

- `CONSTITUTION.md`, `ARCHITECTURE.md`, `VALIDATION_RULES.md`, `FOUNDER_RULES.md` — the complete,
  and only, governance framework. No other named framework document is assumed to exist.
- Implementation only. No architecture changes.

## Mandatory rules applied throughout this package

1. **Never Invent, strictly.** Every fact must trace to a real source in `00_Source_Register.md`.
   Anything that cannot be verified is marked **"Unknown"** or **"Founder Decision Required"** —
   never filled in from general chemistry/cleaning-product knowledge, even where that general
   knowledge is true. This is a stricter formulation than some earlier packages' looser "generic
   caution, clearly labeled" pattern — this package defaults to explicit Unknown/Founder-Decision
   labeling first, and only uses clearly-scoped generic safety caution where a real customer
   question requires *some* answer and the alternative is silence on a safety-relevant topic (see
   `08_Safety.md`'s emergency-guidance framing for the one deliberate exception, itself scoped to
   "always escalate to a professional," never a home remedy).
2. **Source First.** Complete source audit (`00_Source_Register.md`) before authoring any
   Knowledge Object. Done.
3. **Care Intelligence.** Every recommendation passes: Truth → Safety → Care → Clarity →
   Actionability → Validation. Care before Commerce. Guidance before Promotion. Truth before
   Persuasion.
4. **Commercial/Knowledge Separation (`FR-001`/`FR-002`).** This package stores **no** MRP,
   selling price, discount, product image, stock, availability, product URL, slug, or
   marketplace-pricing value anywhere. All eleven commercial fields resolve live via
   `10_LIVE_DATA_MAPPING.md`. Unlike the six remediated packages, there is no legacy content to
   clean up here — commercial separation is enforced from the first Knowledge Object onward.
5. **Validation First.** Every section is checked in `12_Validation/` before the package is
   considered complete.
6. **Repository First.** The repository's actual current state (not memory of a prior
   conversation) is the source of truth for what already exists — confirmed directly at the start
   of this session via `Glob`/`PowerShell` checks of the six prior packages' file counts and the
   governance folder's contents.

## Mandatory deliverables (this package's file list)

`README.md`, `00_Source_Register.md`, `01_Requirements.md` (this file),
`02_Product_Architecture.md`, `03_Product_Intelligence.md`, `04_Decision_Trees.md`,
`05_Customer_Conversation.md`, `06_FAQs.md`, `07_Objection_Handling.md`, `08_Safety.md`,
`09_Founder_Rules.md`, `10_LIVE_DATA_MAPPING.md`, `11_JSON/`, `12_Validation/`, `13_Reports/`,
`MASTER_Pure_Bleach.md`.

## Knowledge coverage required (per Founder instruction)

Product purpose, category, suitable applications, surface compatibility, cleaning mechanism,
usage instructions, dilution, contact time, safety precautions, storage, shelf life, packaging,
first aid, disposal guidance, limitations, frequently misunderstood use cases, escalation
conditions — documented in `03_Product_Intelligence.md`, cross-referencing `08_Safety.md` where
overlapping.

## Customer conversation flows required (11)

First-time customer, regular customer, household use, bathroom cleaning, toilet stain removal,
white fabric stain queries (explain if not applicable), institutional customer, hotel, hospital,
school, office — `05_Customer_Conversation.md`.

## Decision trees required

Whether Bleach is the correct product; when NOT to recommend Bleach; when another MUV product is
more suitable; safety escalation conditions — `04_Decision_Trees.md`.

## Safety coverage required

Safe handling, mixing restrictions, eye contact, skin contact, inhalation, accidental ingestion,
child safety, pet safety, storage, spill management, disposal, emergency guidance — `08_Safety.md`.
Never generate unsupported medical advice — any real exposure incident is escalated to a
professional/emergency service, never treated with an invented home remedy.

## Required end-of-package outputs

1. Coverage Report
2. Validation Report
3. Knowledge Object Statistics
4. Source Coverage Report
5. Missing Knowledge Report
6. Product Quality Score (Source Coverage, Knowledge Completeness, Validation Status, JSON
   Integrity, Care Intelligence Compliance, Governance Compliance, Confidence Level)
7. Care Intelligence Report
8. Freeze Recommendation

All eight live in `13_Reports/`.

## Stop Rule

After this package is complete: **STOP.** Do not begin the next Product Family without explicit
Founder approval.
