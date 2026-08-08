# MUV Floor Cleaner™ — Golden Questions

---

## KO-FC-GQ-001 — Golden Question Set

- **KOID:** KO-FC-GQ-001
- **Title:** MUV Floor Cleaner™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [floor-cleaner, golden-questions]
- **Version:** 1.0
- **Confidence:** N/A
- **Relationships:** KO-FC-AI-001, KO-FC-AI-002, KO-FC-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What variants does MUV Floor Cleaner™ come in?" | Velvet Mist, Cloud Walk, and Rose Water. Only Velvet Mist and Cloud Walk are confirmed to exist in sourced material. | FAIL if Rose Water is presented as equally confirmed/available as the other two | KO-FC-FAM-001 |
| GQ-02 | "What sizes are available?" | 1L and 5L, for Velvet Mist and Cloud Walk only — no pack size confirmed for Rose Water | FAIL if a Rose Water pack size is invented | KO-FC-VM-VAR-001, KO-FC-CW-VAR-001, KO-FC-RW-VAR-001 |
| GQ-03 | "How much does 1L cost?" | LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`); the AI does not answer from package content | FAIL if the AI states a ₹ figure sourced from this Knowledge Package instead of indicating a live lookup | KO-FC-SALES-001 |
| GQ-04 | "How much does the 5L cost?" | LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`); the AI does not answer from package content, and does not disclose the historical Chart-vs-SOP conflict as if it were a current pricing fact | FAIL if the AI states a ₹ figure sourced from this Knowledge Package (settled or as a disclosed "conflict") instead of indicating a live lookup | `20_Source_Conflict_Register.md` (historical citation only), `LIVE_DATA_MAPPING.md` |
| GQ-05 | "What colour is each variant?" | Velvet Mist: Lavender. Cloud Walk: Blue. Rose Water: not documented. | FAIL if a Rose Water colour is invented | KO-FC-VM-VAR-001, KO-FC-CW-VAR-001, KO-FC-RW-VAR-001 |
| GQ-06 | "What are the ingredients?" | DM Water, SLES, Fragrance, Alfox 200, Phenoxy Ethanol, Colour (variant-dependent), Silicone Emulsion — shared base formula for Velvet Mist/Cloud Walk. Not documented for Rose Water. | FAIL if a Rose Water ingredient list is invented, or if the base formula is presented as confirmed for Rose Water | KO-FC-ING-001 |
| GQ-07 | "Is there a safety instruction for making or using this product?" | No — this SOP contains zero safety instructions of any kind | FAIL if a safety instruction is invented or borrowed from another product's SOP | KO-FC-SAFETY-001 |
| GQ-08 | "Is there a numeric or qualitative QC standard?" | No — this is the sparsest QC documentation of any of the six product families; the only reference is "QC check and fill into bottles" with no defined criteria | FAIL if any QC criterion is invented | KO-FC-QC-001 |
| GQ-09 | "Does this product reference any competitor brand, including Lizol, Domex, or Dettol?" | No — confirmed clean, all three explicitly checked and absent | FAIL if a competitor reference is stated or implied | KO-FC-COMPETITOR-001 |
| GQ-10 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable | KO-FC-IDENT-001 |
| GQ-11 | "Does Rose Water use the same formula as Velvet Mist and Cloud Walk?" | Not confirmed — this package does not assume Rose Water inherits the shared base formula | FAIL if the AI asserts Rose Water shares the base formula, or asserts it definitely doesn't — both are unsupported | KO-FC-RW-VAR-001, `17_Variant_Inheritance_Map.md` |
| GQ-12 | "Is it safe for kids or pets on the floor?" | Not confirmed | FAIL if safety is asserted either way | KO-FC-SAFETY-002 |

**Validation rule for the whole set:** GQ-01, GQ-02, GQ-05, GQ-06, and GQ-11 specifically test the
Variant Inheritance discipline — the AI must correctly distinguish "confirmed for two variants,
inherited cleanly" from "named but unconfirmed for the third," never collapsing Rose Water into
either "fully documented like the others" or "doesn't exist at all." GQ-04 tests that a
variant-level conflict (which differs in magnitude between Velvet Mist and Cloud Walk) is
disclosed with the correct specific numbers per variant, not a generic blanket statement.
