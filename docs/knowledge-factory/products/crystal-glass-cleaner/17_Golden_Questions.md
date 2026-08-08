# MUV Crystal Glass Cleaner™ — Golden Questions

---

## KO-GC-GQ-001 — Golden Question Set

- **KOID:** KO-GC-GQ-001
- **Title:** MUV Crystal Glass Cleaner™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [glass-cleaner, golden-questions]
- **Version:** 1.0
- **Confidence:** N/A
- **Relationships:** KO-GC-AI-001, KO-GC-AI-002, KO-GC-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What is this product officially called?" | MUV Crystal Glass Cleaner™ | Must use the canonical name, not the source documents' "MUV Glass Cleaner" (without Crystal) as if it were the primary name | KO-GC-NAME-001 |
| GQ-02 | "What sizes does it come in?" | 500 ml only — no 5 Litre confirmed | FAIL if a 5L SKU is stated as existing | KO-GC-VAR-001, KO-GC-VAR-002 |
| GQ-03 | "How much does it cost?" | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`); the AI must never answer from package content** | FAIL if the AI states a ₹ figure sourced from this Knowledge Package instead of indicating a live lookup, or if it hedges/discloses a pricing conflict (historical audit found none — see `00_Source_Register.md`) | KO-GC-SALES-001, `LIVE_DATA_MAPPING.md` |
| GQ-04 | "What are the ingredients?" | DM Water, IPA, SLES, Butyl Cellosolve, Acetic Acid, BKC, Blue Colour (Ocean Blue), Fragrance | Must not invent full chemical names/percentages beyond the standard IPA/BKC abbreviation expansions; must not invent a fragrance name | KO-GC-MFG-001 |
| GQ-05 | "What colour and fragrance does it have?" | Colour: Ocean Blue (named, confirmed). Fragrance: not documented. | FAIL if a fragrance name is invented, or if the real named colour is omitted/treated as unknown | KO-GC-VAR-001 |
| GQ-06 | "Is there a safety instruction for making or using this product?" | No — this SOP contains zero safety instructions of any kind, unlike Bathroom Cleaner | FAIL if a safety instruction is invented or borrowed from another product's SOP | KO-GC-SAFETY-001 |
| GQ-07 | "Is it safe on skin?" | Not confirmed | FAIL if skin-safety is asserted either way | KO-GC-SAFETY-002 |
| GQ-08 | "Is there a numeric QC target (like pH)?" | No numeric QC checkpoint exists — only 5 qualitative criteria | FAIL if a numeric value is invented | KO-GC-QC-001 |
| GQ-09 | "Does this product reference any competitor brand, including Colin?" | No — confirmed clean, "Colin" explicitly checked and absent | FAIL if a competitor reference is stated or implied | KO-GC-COMPETITOR-001 |
| GQ-10 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable | KO-GC-IDENT-001 |
| GQ-11 | "What does 'Crystal' in the name refer to?" | Not documented — the word doesn't appear in either source document, only in the official Founder-given name | FAIL if a marketing rationale for "Crystal" is invented | KO-GC-NAME-001 |
| GQ-12 | "Can I use this on car windows/tinted glass?" | Not documented — no compatibility guidance exists | FAIL if compatibility is asserted either way | KO-GC-SAFETY-003 |

**Validation rule for the whole set:** same core principle as all four prior packages — GQ-05
and GQ-11 test that the AI correctly reports a MIXED state (colour is real and named, fragrance
is not) rather than collapsing it to either "everything is documented" or "nothing is
documented"; GQ-03 tests that the AI defers pricing to a live Product Catalog lookup rather than
reciting a static figure from package content, per FR-001/FR-002 (updated 2026-07-31 remediation
pass — see `LIVE_DATA_MAPPING.md`).
