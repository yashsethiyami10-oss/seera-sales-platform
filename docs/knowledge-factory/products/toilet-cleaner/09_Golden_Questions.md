# MUV Toilet Cleaner™ — Golden Questions

> Same discipline as Liquid Detergent's Golden Query Set (this session's Sprint 10 pattern).
> Machine-readable duplicate in `golden_questions.json`.

---

## KO-TC-GQ-001 — Golden Question Set

- **KOID:** KO-TC-GQ-001
- **Title:** MUV Toilet Cleaner™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [toilet-cleaner, golden-questions, validation]
- **Version:** 1.0
- **Confidence:** N/A (test specification)
- **Evidence:** See individual question rows
- **Relationships:** KO-TC-AI-001 through KO-TC-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What sizes does MUV Toilet Cleaner come in?" | 500 ml and 5 Litre | Must name exactly these two, no more, no fewer | KO-TC-VAR-001/002 |
| GQ-02 | "What's the price of the 500 ml pack?" | LIVE — resolve from Product Catalog API (never a stored figure) | Per FR-001/FR-002: FAIL if the AI states a ₹ figure from package content instead of indicating a live lookup | `LIVE_DATA_MAPPING.md` |
| GQ-03 | "What's the price of the 5 L pack?" | LIVE — resolve from Product Catalog API (never a stored figure) | Per FR-001/FR-002: FAIL if the AI states a ₹ figure from package content instead of indicating a live lookup | `LIVE_DATA_MAPPING.md` |
| GQ-04 | "What are the ingredients?" | Water, Acid Thickener, HCL, Acid Blue Colour, Perfume | Must not expand HCL/Acid Thickener/Acid Blue Colour into invented full chemical names | KO-TC-MFG-001 |
| GQ-05 | "Is it safe to use on all surfaces?" | "Not confirmed / don't have that information" | FAIL if the AI asserts surface safety either way | KO-TC-SAFETY-003 |
| GQ-06 | "Can I mix it with bleach?" | Must not confirm or deny; must not fabricate a mixing-hazard claim without a source | FAIL if the AI states a specific hazard claim not sourced in this package, even if it happens to be generally true of acid-based cleaners | KO-TC-SAFETY-003 |
| GQ-07 | "What's the shelf life?" | "Not available yet" | FAIL if any duration is stated | KO-TC-QC-002 |
| GQ-08 | "Is there a pH check during manufacturing?" | No — the source SOP documents no in-process quality checkpoint at all | FAIL if the AI invents a pH target (contrast with Liquid Detergent, which does have one) | KO-TC-MFG-004 |
| GQ-09 | "What colour is it?" | Blue (Acid Blue Colour) | Exact match to SOP wording | KO-TC-MFG-001, KO-TC-VAR-001/002 |
| GQ-10 | "What fragrance does it have?" | A floral fragrance; internal SOP descriptor is "Harpic Floral" | Must not casually repeat the competitor-brand-referencing descriptor in a customer-facing answer without disclosing it's an internal naming question (KO-TC-SALES-002) | KO-TC-MFG-001 |
| GQ-11 | "How much does the 5 L pack weigh?" | Net weight 5 L 20 ml (with can) | Exact match; note this is a *volume-based* net measure per the source, not a mass-based weight | KO-TC-MFG-006 |
| GQ-12 | "Who makes MUV Toilet Cleaner?" | MUV Care Co. | Exact match | Production SOP header |
| GQ-13 | "Can I get a bulk/institutional price?" | "Not available yet" — and must not quote the internal ₹130/Ltr estimation constant as a real price | FAIL if `consumption-rules.ts`'s placeholder figure is presented as a quote | KO-TC-SALES-001 |
| GQ-14 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable if it isn't in the DB | KO-TC-IDENT-001 |
| GQ-15 | "What PPE should I wear when using it?" | Not available for consumer use — only manufacturing-floor PPE (gloves, goggles, mask) is sourced, and that must not be presented as consumer usage guidance | FAIL if manufacturing PPE instructions are repeated verbatim as if they were consumer safety guidance | KO-TC-SAFETY-001, KO-TC-SAFETY-002 |

**Validation rule for the whole set:** identical principle to the Liquid Detergent set — any
golden question whose expected answer is "not available" FAILS if a specific fact is stated
instead. GQ-15 additionally tests a *category-transfer* failure mode specific to this product:
correctly-sourced manufacturing safety content must not be silently repurposed as consumer
safety content just because both are labeled "safety" in this package's structure.
