# MUV Fresh Bathroom Cleaner™ — Founder Input Register

---

## Priority Items

| Item | Why it matters | KOID |
|---|---|---|
| **Historical pricing discrepancy in pre-launch source documents (see `19_Source_Conflict_Register.md` CONFLICT-001, historical audit citation only — not a live figure)** | Traces directly to a pre-existing, named codebase conflict comment. Per FR-001/FR-002 (2026-07-31), this no longer blocks anything customer/AI-facing — pricing is always resolved live from the Product Catalog API (see `LIVE_DATA_MAPPING.md`) regardless of which pre-launch document was "correct." Retained here only in case whoever creates the real `Product`/`ProductVariant` row wants the historical context. | KO-BC-SALES-001, `19_Source_Conflict_Register.md` |
| Confirm whether a 5 Litre SKU should exist at all | No source has one; if the Founder intends one, new source material is needed, not inference | KO-BC-VAR-002 |
| Colour and fragrance identity | Unlike all three prior products, neither is named anywhere — the product has no descriptive identity to build FAQs/marketing on yet | KO-BC-VAR-001, KO-BC-ING-001 |
| Manufacturing PPE requirements | None sourced at all, despite direct HCl handling — sharper gap than Toilet Cleaner (which has some PPE guidance) | KO-BC-SAFETY-001 |
| Rationale for "Fresh" in the official name | Neither source uses this word — worth Founder elaboration for future marketing copy, though the name itself is already settled | KO-BC-NAME-001 |

## Product Identity & Description

- Manufacturer name confirmation
- Formal brand positioning statement
- Customer problems solved
- Target customer segment
- Usage scenarios
- Rationale for "Fresh" (naming itself is settled; the rationale is not)

## Identification & Catalogue Data

- SKU code, barcode
- Packaging dimensions, shipping weight, marketplace metadata
- Variant image (one embedded photo exists, not reviewed)
- HSN code / GST rate
- Packaging container material/format

## Ingredients & Manufacturing

- Full INCI/chemical names for HCl/SLES, concentrations, grades, suppliers
- Colour and fragrance identity/names
- Equipment specification
- Real measured batch yield

## Quality Control

- Any numeric target for the five qualitative QC criteria
- Test methods
- Sampling plan, OOS handling, retention samples

## Safety

- Manufacturing PPE requirements
- Consumer safety data sheet, first-aid procedure
- Surface/material compatibility and mixing-hazard guidance

## Storage & Transport

- Shelf life
- Storage temperature range
- Transportation/hazard classification

## Sales & Marketing

- **Pricing conflict resolution** (see Priority Items)
- Wholesale/institutional pricing
- Cost of goods / margin data
- Marketing campaign history

## Support

- Product-specific troubleshooting guide
- Batch/lot numbering scheme

---

**Total distinct gap categories:** 33 (see `knowledge_metadata.json` for the itemized array).
