# MUV Body Wash™ — Founder Gaps Register

> Structure reused from Black Phenyl/White Phenyl (see
> `13_Reports/09_Knowledge_Reuse_Summary.md`), content independently compiled for this product.

---

## Priority 1 — Critical (blocks confident customer-facing use)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 1 | **Zero safety content of any kind exists in the source SOP.** | The most severe safety-documentation gap of any of the ten product families audited this session, for a product with direct, sustained skin contact. | KO-BW-SAFETY-001 through 010 |
| 2 | **"MUV Cleanse" seed-data conflict** — a different, non-matching product exists in `prisma/seed.ts` with a different fragrance, pack sizes, and pricing, plus unsourced marketing claims. | A genuinely new conflict this session discovered by hand, not yet reflected in `lib/knowledge-factory/conflict-service.ts`. Needs a real Founder decision: is this an obsolete placeholder to remove, or does it represent a real fourth product/positioning MUV intends to keep? | `00_Source_Register.md` §5, KO-BW-IDENT-001 |
| 3 | **Consumer usage instructions** — the only source is a manufacturing SOP. | The AI cannot currently tell a customer how to use the product at all. | KO-BW-INTEL-005 |

## Priority 2 — Important (materially limits customer-facing usefulness)

| # | Gap | Why it matters | Related KOID |
|---|---|---|---|
| 4 | **Skin-type suitability** (oily, dry, sensitive) — none sourced for any type. | Directly relevant to 3 of the 12 required conversation flows. | KO-BW-INTEL-004 |
| 5 | **Contraindications** — none sourced. | Especially relevant given the salicylic-acid active ingredient. | KO-BW-INTEL-014 |
| 6 | **Storage condition** — completely unsourced. | KO-BW-SAFETY-008 |
| 7 | **Shelf-life duration** — an expiry date is confirmed to exist on the label, but its length isn't stated. | KO-BW-INTEL-011 |
| 8 | **Container material** — not stated for either pack size (a real difference from most prior products, which at least named a material). | KO-BW-INTEL-009 |
| 9 | **Fill weight** — not stated for either pack size. | KO-BW-CV/VO/MF-VAR-001/002 |
| 10 | **Fragrance-note detail beyond the two-word family label** — no notes, sensory, or emotional description sourced for any variant. | Directly limits how richly `04_Decision_Trees.md`'s variant recommendation logic and marketing copy can ever be built without inventing content. | KO-BW-INTEL-008 |

## Priority 3 — Standard completeness gaps

| # | Gap | Related KOID |
|---|---|---|
| 11 | Manufacturer name | KO-BW-IDENT-001 |
| 12 | SKU codes, barcodes (per variant, per pack size — 6 real SKUs) | KO-BW-CV/VO/MF-VAR-001/002 |
| 13 | Packaging dimensions, shipping weight | Same |
| 14 | Product images (none exist in source at all) | `10_LIVE_DATA_MAPPING.md` |
| 15 | Disposal guidance | KO-BW-SAFETY-009 |
| 16 | Institutional consumption-estimation tooling (no `BODY_WASH` category exists in code) | — |
| 17 | Formal positioning/marketing statement beyond the SOP's single "premium-quality" word | KO-BW-INTEL-015 |
| 18 | Equipment specification (no equipment named anywhere in the SOP) | KO-BW-MFG-003 |

---

## Summary

**18 distinct gaps recorded — 3 Critical, 7 Important, 8 Standard.** The Critical tier this time
is unusually consequential: the total absence of safety content for a direct-skin-contact
product, and a genuinely new data-integrity conflict ("MUV Cleanse") that wasn't anticipated
going into this audit. Both are recommended for the Founder's immediate attention ahead of the
more routine completeness gaps.
