# MUV Hand Wash™ — Founder Gaps Register

> Structure reused from Black Phenyl/White Phenyl/Body Wash (see
> `13_Reports/10_Knowledge_Reuse_Summary.md`), content independently compiled for this product.

---

## Priority 1 — Critical (blocks confident customer-facing use)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 1 | **All six `FR-005` mandatory Safety Critical fields are unsourced** — Usage, Safety, Contraindications, First Aid, Storage, Shelf Life. | The same severity of gap found for Body Wash (which directly triggered `FR-005`), now for a product used on hands potentially several times daily. | KO-HW-INTEL-003; KO-HW-SAFETY-002 through 009 |
| 2 | **Life Shield's antibacterial/protective status is completely unconfirmed** — no source (Chart, SOP, Knowledge Library, AI Sutra) assigns any germ-killing or protective property to this variant, despite its name. | `FR-005` names this exact risk by example. A customer or a future content author could easily assume "Shield" implies protection; nothing in this package may state or imply that without a real source. | KO-HW-SAFETY-010, KO-HW-DT-REC-LS-001, KO-HW-CONV-008 |
| 3 | **Product Chart vs. Founder-verified Variant Availability Matrix conflict** — the Chart has no Silk Blossom 5L row (Founder says it's real) and prices a Citrus Blast 5L row (Founder says it's not real). | Two source-of-record documents genuinely disagree about which SKUs exist. This package follows the Founder's matrix for what gets built, but the underlying discrepancy needs real reconciliation (was the Chart never updated? Is Citrus Blast 5L being discontinued? Is Silk Blossom 5L a recent addition?). | KO-HW-AVAIL-001; `00_Source_Register.md` §1 |

## Priority 2 — Important (materially limits customer-facing usefulness)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 4 | **Consumer usage instructions** — the only source is a manufacturing SOP. | The AI cannot currently tell a customer how to use the product with a MUV-confirmed instruction. | KO-HW-INTEL-003 |
| 5 | **Skin-type suitability** — none sourced for any variant. | Directly relevant to the safety/sensitivity conversation flow. | KO-HW-INTEL-010 |
| 6 | **Consumer-facing ingredient (INCI) disclosure** — only manufacturing raw-material names exist. | Needed for any real product-label or ingredient-transparency page. | KO-HW-INTEL-011 |
| 7 | **Fragrance-note detail beyond the variant name** — no notes, sensory, or emotional description sourced for any variant. | Limits how richly `04_Decision_Trees.md`'s recommendation logic and marketing copy can ever be built without inventing content. | KO-HW-INTEL-008 |
| 8 | **SOP pricing table is generic, not variant-specific**, and numerically conflicts with the Chart's per-variant prices. | A real data-quality issue in the source material itself, independent of the Founder matrix question (Gap 3). | `00_Source_Register.md` §2 |
| 9 | **"MUV GLOW HAND WASH" title vs. "MUV Hand Wash™"** — resolved for this package by direct Founder Instruction, but the underlying source document itself was never corrected/renamed at its origin. | Future SOP revisions may perpetuate the "GLOW" branding if not corrected at the source. | KO-HW-NAME-001, KO-HW-INTEL-014 |
| 10 | **"MUV Silk Hair Wash" and "MUV Shield" naming-adjacency conflicts in `prisma/seed.ts`.** | Real risk of future catalog confusion if Hand Wash SKUs are added without renaming/disambiguating these existing records. | `00_Source_Register.md` §5 |
| 11 | **Container material, cap type, dispenser mechanism** — not stated for any pack size. | A real difference from most prior products, which at least named a material for some SKUs. | KO-HW-INTEL-007 |

## Priority 3 — Standard completeness gaps

| # | Gap | Related KOID |
|---|---|---|
| 12 | Manufacturer name | KO-HW-IDENT-001 |
| 13 | SKU codes, barcodes (8 real SKUs) | KO-HW-*-VAR-* |
| 14 | Packaging dimensions, shipping weight | Same |
| 15 | Product images (8 exist in source but uncaptioned/unusable per-SKU) | `10_LIVE_DATA_MAPPING.md` |
| 16 | Disposal guidance | `08_Safety.md` |
| 17 | Institutional consumption tooling is category-wide only, not variant-aware (`lib/inst-sales/consumption-rules.ts` `HAND_WASH`, a placeholder estimate) | `00_Source_Register.md` §6 |
| 18 | Formal positioning/marketing statement (no descriptive language exists in the SOP at all, not even one adjective) | KO-HW-INTEL-001 |

---

## Summary

**18 distinct gaps recorded — 3 Critical, 8 Important, 7 Standard.** The Critical tier is
unusually consequential for a repeat-use, direct-hand-contact Safety Critical product: total
absence of all six `FR-005` mandatory fields, a real and Founder-anticipated risk of an assumed
antibacterial claim for Life Shield, and a genuine, unresolved conflict between the Product Chart
and the Founder's own verified availability matrix. All three are recommended for the Founder's
immediate attention ahead of the more routine completeness gaps.
