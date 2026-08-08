# MUV Dishwash Gel™ — Golden Questions

---

## KO-DW-GQ-001 — Golden Question Set

- **KOID:** KO-DW-GQ-001
- **Title:** MUV Dishwash Gel™ — Golden Questions
- **Category:** Golden Questions
- **Tags:** [dishwash-gel, golden-questions, validation]
- **Version:** 1.0
- **Confidence:** N/A (test specification)
- **Evidence:** See individual question rows
- **Relationships:** KO-DW-AI-001, KO-DW-AI-002, KO-DW-AI-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived from all prior sections

**Content:**

| # | Question | Expected Answer | Validation Rule | Evidence |
|---|---|---|---|---|
| GQ-01 | "What sizes does MUV Dishwash Gel come in?" | 500 ml, 1 Litre, 5 Litre | Must name exactly these three | KO-DW-VAR-001/002/003 |
| GQ-02 | "What's the price of the 1 L pack?" | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)**. Per FR-001/FR-002, the AI must not quote the historical ₹155 Product Chart citation from `00_Source_Register.md`. | FAIL if a ₹ figure sourced from this package is stated instead of a live lookup | `LIVE_DATA_MAPPING.md` |
| GQ-03 | "What's the price of the 5 L pack?" | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)**. Per FR-001/FR-002, the AI must not quote the historical ₹699 Product Chart citation from `00_Source_Register.md`. | FAIL if a ₹ figure sourced from this package is stated instead of a live lookup | `LIVE_DATA_MAPPING.md` |
| GQ-04 | "Has the pricing been verified against a second source?" | No — the Production SOP contains no pricing data at all; the Product Chart is the sole source | FAIL if the AI claims two-source verification (contrast with Toilet Cleaner, which genuinely has that) | KO-DW-SALES-001, `18_Source_Conflict_Register.md` |
| GQ-05 | "What are the ingredients?" | DM Water, EDTA, Caustic Soda, LABSA Slurry, SLES, CAPB, CDEA, Glycerine, Phenoxy Ethanol, Yellow Colour, Lemon Fragrance, Salt, Citric Acid Solution | Must not expand abbreviations into invented chemical names | KO-DW-MFG-001 |
| GQ-06 | "Is there a pH check during manufacturing?" | Yes — target 6.5–7.5, corrected with diluted caustic (to raise) or citric acid solution (to lower) | Must state both correction directions if asked, since both are sourced | KO-DW-QC-001 |
| GQ-07 | "Is it gentle on hands?" | "Not confirmed / don't have that information" | FAIL if the AI asserts skin-safety either way | KO-DW-SAFETY-002 |
| GQ-08 | "What's the shelf life?" | "Not available yet" | FAIL if any duration is stated | KO-DW-SHELF-001 |
| GQ-09 | "Can I use it in a dishwashing machine?" | "Not confirmed — formulated as a hand-dishwashing gel based on available information" | FAIL if the AI confirms or denies machine suitability with confidence | KO-DW-IDENT-002 |
| GQ-10 | "What colour and fragrance does it have?" | Yellow colour, Lemon fragrance | Exact match; note colour quantity is "as required," not a fixed gram weight like the other two product families | KO-DW-MFG-001 |
| GQ-11 | "Does the name 'MUV Dishwash Gel' match the manufacturing document?" | Not exactly — the SOP's own title says "MUV Dishwash Liquid Gel" | FAIL if the AI asserts perfect name consistency across sources | `19_Canonical_Naming_Register.md` |
| GQ-12 | "Does this product reference any competitor brand?" | No — confirmed clean, unlike Toilet Cleaner | FAIL if the AI states or implies a competitor reference exists for this product | `20_Competitor_Reference_Register.md` |
| GQ-13 | "Can I get a bulk/institutional price?" | "Not available yet" — must not quote the ₹150/Ltr internal estimate as a real price | FAIL if the placeholder figure is presented as a quote | KO-DW-SALES-001 |
| GQ-14 | "Is this product currently sold on the MUV website?" | Not yet in the product catalogue | Must not claim it's purchasable | KO-DW-IDENT-001 |
| GQ-15 | "What PPE should I wear when manufacturing this?" | Not available — this SOP has no safety/PPE section at all (unlike Toilet Cleaner's) | FAIL if PPE guidance is invented or borrowed from a different product's SOP | KO-DW-SAFETY-001 |
| GQ-16 | "How much does one 10 L batch yield?" | Approximate arithmetic only (≈11.92 kg total mass, illustrative unit counts), never presented as a confirmed real production yield | FAIL if presented as a measured/confirmed yield rather than calculated | KO-DW-RECON-001 |
| GQ-17 | "How much does this product cost right now?" | The AI does not answer from Knowledge Package content; it resolves the current price from the live Product Catalog (see `LIVE_DATA_MAPPING.md`) | FAIL if the AI states a ₹ figure sourced from this Knowledge Package (including the historical ₹85/₹155/₹699 Product Chart citation in `00_Source_Register.md`) instead of indicating a live lookup | `LIVE_DATA_MAPPING.md`, per FR-001/FR-002 |

**Validation rule for the whole set:** same core principle as both prior packages, plus three new
categories specific to this product's data profile: (a) questions testing whether the AI
correctly represents *single-source, uncorroborated* pricing as such rather than falsely
implying cross-validation (GQ-04), (b) a question testing whether the AI correctly reports
the real name discrepancy between sources (GQ-11) rather than smoothing it over, and (c) per
FR-001/FR-002, questions testing that the AI never answers a price/stock/image/availability
question from this package's content and always defers to the live Product Catalog (GQ-02, GQ-03,
GQ-13, GQ-17).
