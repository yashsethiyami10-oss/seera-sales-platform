# MUV Dishwash Gel™ — Product Family & SKUs

> One parent product, ONE formulation (lemon fragrance, yellow colour, no named variants),
> THREE pack-size SKUs. Per-SKU fields only — shared knowledge is written once in the other
> files.

---

## KO-DW-VAR-001 — 500 ml

- **KOID:** KO-DW-VAR-001
- **Title:** MUV Dishwash Gel™ — 500 ml SKU
- **Category:** Product Family / SKU
- **Tags:** [dishwash-gel, 500ml, sku]
- **Version:** 1.0
- **Confidence:** HIGH (pricing/fill weight) / LOW (SKU code, barcode, images)
- **Evidence:** SOP "Filling Standards" table; Product Chart row 9
- **Relationships:** KO-DW-MFG-001, KO-DW-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`; `MUV_Product_Chart_with_USP (1)(1).pdf` row 9

| Field | Value |
|---|---|
| SKU / Product Code | REQUIRES FOUNDER INPUT |
| Barcode | REQUIRES FOUNDER INPUT |
| Fragrance | Lemon (15 ml per 10 L batch) |
| Colour Profile | Yellow ("as required" quantity — no fixed gram weight stated, unlike the fixed colourant weights in the other two product families) |
| Pack Size | 500 ml |
| Fill Weight (per SOP) | 508 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| Packaging Dimensions | REQUIRES FOUNDER INPUT |
| Shipping Weight | REQUIRES FOUNDER INPUT |
| Marketplace Metadata | REQUIRES FOUNDER INPUT |
| Variant Images | REQUIRES FOUNDER INPUT (none found in repo) |

---

## KO-DW-VAR-002 — 1 Litre

- **KOID:** KO-DW-VAR-002
- **Title:** MUV Dishwash Gel™ — 1 Litre SKU
- **Category:** Product Family / SKU
- **Tags:** [dishwash-gel, 1l, sku]
- **Version:** 1.0
- **Confidence:** HIGH (pricing/fill weight) / LOW (SKU code, barcode, images)
- **Evidence:** SOP "Filling Standards" table; Product Chart row 10
- **Relationships:** KO-DW-MFG-001, KO-DW-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`; `MUV_Product_Chart_with_USP (1)(1).pdf` row 10

| Field | Value |
|---|---|
| SKU / Product Code | REQUIRES FOUNDER INPUT |
| Barcode | REQUIRES FOUNDER INPUT |
| Fragrance | Lemon (15 ml per 10 L batch) |
| Colour Profile | Yellow ("as required") |
| Pack Size | 1 Litre |
| Fill Weight (per SOP) | 1012 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| Packaging Dimensions | REQUIRES FOUNDER INPUT |
| Shipping Weight | REQUIRES FOUNDER INPUT |
| Marketplace Metadata | REQUIRES FOUNDER INPUT |
| Variant Images | REQUIRES FOUNDER INPUT (none found in repo) |

---

## KO-DW-VAR-003 — 5 Litre

- **KOID:** KO-DW-VAR-003
- **Title:** MUV Dishwash Gel™ — 5 Litre SKU
- **Category:** Product Family / SKU
- **Tags:** [dishwash-gel, 5l, sku]
- **Version:** 1.0
- **Confidence:** HIGH (pricing/fill weight) / LOW (SKU code, barcode, images)
- **Evidence:** SOP "Filling Standards" table; Product Chart row 11
- **Relationships:** KO-DW-MFG-001, KO-DW-IDENT-001
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`; `MUV_Product_Chart_with_USP (1)(1).pdf` row 11

| Field | Value |
|---|---|
| SKU / Product Code | REQUIRES FOUNDER INPUT |
| Barcode | REQUIRES FOUNDER INPUT |
| Fragrance | Lemon (15 ml per 10 L batch) |
| Colour Profile | Yellow ("as required") |
| Pack Size | 5 Litre |
| Fill Weight (per SOP) | 5020 g |
| Pricing (MRP) | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** |
| Packaging Dimensions | REQUIRES FOUNDER INPUT |
| Shipping Weight | REQUIRES FOUNDER INPUT |
| Marketplace Metadata | REQUIRES FOUNDER INPUT |
| Variant Images | REQUIRES FOUNDER INPUT (none found in repo) |

---

## Pricing Summary

> Per FR-001/FR-002: pricing is never stated as fact in this Knowledge Package. See
> `LIVE_DATA_MAPPING.md` for the authoritative live source.

| SKU | MRP | Fill Weight | Source of MRP |
|---|---|---|---|
| 500 ml | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | 508 g | N/A — see `00_Source_Register.md` for the historical audit citation (Product Chart row 9, sole source — SOP has no pricing) |
| 1 L | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | 1012 g | N/A — see `00_Source_Register.md` for the historical audit citation (Product Chart row 10, sole source) |
| 5 L | **LIVE — resolve from Product Catalog API (see `LIVE_DATA_MAPPING.md`)** | 5020 g | N/A — see `00_Source_Register.md` for the historical audit citation (Product Chart row 11, sole source) |

Unlike Liquid Detergent (one conflicting SKU) or Toilet Cleaner (two matching, cross-validated
SKUs), **Dishwash Gel's historical pricing could not be cross-validated at all** — the Production
SOP contained no MRP figures for any pack size, only fill weights. This was recorded as a
data-gap, not a conflict, in `18_Source_Conflict_Register.md`. Per FR-001/FR-002, current pricing
is never sourced from the Product Chart or this file at answer time — it is always resolved live
from the Product Catalog API; the Product Chart citation above is retained solely as a historical
audit record.
