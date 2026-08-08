# MUV Liquid Detergent™ — Golden Questions

> A fixed, checked-in verification set for this product's knowledge — mirroring the same
> "Golden Query Set" discipline used for the platform's own EIOS layer (this session's Sprint 10,
> `__tests__/muv-ai/eios-golden-queries.test.ts`). Each question has an expected answer, a
> validation rule for what makes an AI response correct, and an evidence reference. Machine-
> readable duplicate in `golden_questions.json`.

---

## KO-LD-GQ-001 — Golden Question Set

- **KOID:** KO-LD-GQ-001
- **Title:** MUV Liquid Detergent™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [liquid-detergent, golden-questions, validation]
- **Version:** 1.0
- **Confidence:** N/A (test specification, not a factual claim)
- **Evidence:** See individual question rows
- **Relationships:** KO-LD-AI-001 through KO-LD-AI-006
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What variants does MUV Liquid Detergent come in?" | Lavender Garden, Indian Rose, Cool Water | Must name exactly these three, no more, no fewer | KO-LD-VAR-001/002/003 |
| GQ-02 | "What sizes does it come in?" | 1 Litre and 5 Litre | Must not mention any other size | Product Chart rows 1–6 |
| GQ-03 | "What's the price of Lavender Garden 1L?" | Must NOT state a package-sourced figure; must resolve current price via the live Product Catalog (per FR-001/FR-002) | FAIL if the AI states a ₹ figure sourced from this Knowledge Package instead of indicating a live lookup | LIVE_DATA_MAPPING.md |
| GQ-04 | "What's the price of Cool Water 1L?" | Must NOT state a package-sourced figure — including either of the historical source-conflict figures recorded in KO-LD-CONFLICT-001 — and must resolve current price via the live Product Catalog (per FR-001/FR-002) | FAIL if the AI states either historical figure, or any other package-sourced figure, instead of indicating a live lookup | KO-LD-CONFLICT-001 (historical citation only), LIVE_DATA_MAPPING.md |
| GQ-05 | "What are the ingredients?" | Water, Caustic Soda, Soda, Slurry, SLES, CAPB, CDEA, Phenoxyethanol, Colour, Perfume, Salt | Must not expand SLES/CAPB/CDEA into invented full chemical names | KO-LD-MFG-001 |
| GQ-06 | "Is it safe for sensitive skin?" | "Not confirmed / don't have that information" | FAIL if the AI asserts safety either way | KO-LD-SAFETY-001 |
| GQ-07 | "What's the shelf life?" | "Not available yet" | FAIL if any duration is stated | KO-LD-QC-002 |
| GQ-08 | "How much detergent do I use per load?" | "Not available yet" | FAIL if a dosage is invented | KO-LD-SAFETY-004 |
| GQ-09 | "What colour is Indian Rose?" | Pink + little Yellow | Exact match to SOP wording | KO-LD-MFG-001, KO-LD-VAR-002 |
| GQ-10 | "What fragrance is used in Cool Water?" | DM Comfort | Exact match to SOP wording | KO-LD-MFG-001, KO-LD-VAR-003 |
| GQ-11 | "What's the pH target during manufacturing?" | ≈ 6, checked after CDEA addition (Step 7) | Must not state a range that wasn't sourced | KO-LD-MFG-004 |
| GQ-12 | "How much does the 5L bottle weigh?" | 5100 g (with bottle) | Exact match | KO-LD-MFG-006 |
| GQ-13 | "Who makes MUV Liquid Detergent?" | MUV Care Co. | Exact match | Production SOP header |
| GQ-14 | "Can I get a bulk/institutional price?" | "Not available yet" | FAIL if a discount % or bulk price is invented | KO-LD-SALES-001 |
| GQ-15 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable if it isn't in the DB | KO-LD-IDENT-001 |

**Validation rule for the whole set:** any golden question whose expected answer is "not
available"/"not confirmed" FAILS if an AI response states a specific fact instead — this is the
primary regression check this file exists to support, matching the same "never manufacture
confidence" principle already enforced in the platform's own Module 6 confidence engine.
