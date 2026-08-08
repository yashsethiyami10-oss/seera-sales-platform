# MUV Fresh Bathroom Cleaner™ — Golden Questions

---

## KO-BC-GQ-001 — Golden Question Set

- **KOID:** KO-BC-GQ-001
- **Title:** MUV Fresh Bathroom Cleaner™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [bathroom-cleaner, golden-questions]
- **Version:** 1.0
- **Confidence:** N/A
- **Relationships:** KO-BC-AI-001, KO-BC-AI-002, KO-BC-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What is this product officially called?" | MUV Fresh Bathroom Cleaner™ | Must use the canonical name, not the source documents' "MUV Bathroom Cleaner" (without Fresh) as if it were the primary name | KO-BC-NAME-001 |
| GQ-02 | "What sizes does it come in?" | 500 ml only — no 5 Litre confirmed | FAIL if a 5L SKU is stated as existing | KO-BC-VAR-001, KO-BC-VAR-002 |
| GQ-03 | "How much does it cost?" | Must defer to a live Product Catalog lookup (see `LIVE_DATA_MAPPING.md`); must not state any ₹ figure from this Knowledge Package | FAIL if the AI states a ₹ figure sourced from this package instead of indicating a live lookup — including either of the two historical figures recorded, as an audit citation only, in `19_Source_Conflict_Register.md` | `LIVE_DATA_MAPPING.md`, `19_Source_Conflict_Register.md` |
| GQ-04 | "What are the ingredients?" | DM Water, HCl, SLES, Acid Thickener, Colour, Fragrance | Must not expand HCl/SLES into invented chemical names, must not invent colour/fragrance names | KO-BC-MFG-001 |
| GQ-05 | "What colour and fragrance does it have?" | Not documented — no name/description exists in any source | FAIL if a colour or fragrance name is invented (contrast with all three prior products, which do have named colours/fragrances) | KO-BC-VAR-001 |
| GQ-06 | "Is there a safety instruction for making this product?" | Yes — 'Never add water into acid,' stated directly in the SOP | Should be able to state this one real instruction confidently when asked in a manufacturing context | KO-BC-SAFETY-001 |
| GQ-07 | "Is it safe on skin?" | Not confirmed | FAIL if skin-safety is asserted either way | KO-BC-SAFETY-002 |
| GQ-08 | "Is there a pH check during manufacturing?" | No numeric QC checkpoint of any kind exists — only qualitative criteria (uniform colour, smooth thick liquid, no lumps, pleasant fragrance, good cleaning) | FAIL if a pH value is invented | KO-BC-QC-001 |
| GQ-09 | "Does this product reference any competitor brand?" | No — confirmed clean | FAIL if a competitor reference is stated or implied | KO-BC-COMPETITOR-001 |
| GQ-10 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable | KO-BC-IDENT-001 |
| GQ-11 | "What does 'Fresh' in the name refer to?" | Not documented — the word doesn't appear in either source document, only in the official Founder-given name | FAIL if a scent/quality rationale for "Fresh" is invented | KO-BC-NAME-001 |

**Validation rule for the whole set:** same core principle as all three prior packages, with a
new emphasis this time: GQ-05 and GQ-11 specifically test that the AI does not fill in "obvious"
missing details (a colour name, a rationale for "Fresh") just because every prior product in the
family had them — absence of a fact for THIS product must be treated as absence, not
extrapolated from sibling products.
