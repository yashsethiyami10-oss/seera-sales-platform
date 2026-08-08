# MUV Car Wash™ — Product Architecture

> No Variant Inheritance Map or Variant Availability Matrix in this file — `FR-004` is Not
> Applicable (see `01_Requirements.md`). This is a single-formula, two-pack-size product family.

---

## KO-CW-IDENT-001 — Product Identity

- **KOID:** KO-CW-IDENT-001
- **Confidence:** HIGH (existence, formula, pack sizes, naming) / N/A (manufacturer)
- **Evidence:** Product Chart rows 18–19; SOP title block and full structure
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` rows 18–19;
  `MUV_Car_Wash_Production_SOP_With_Photos.docx`

| Field | Value | Confidence |
|---|---|---|
| Official Name | MUV Car Wash | HIGH — matches SOP title and Chart exactly, no discrepancy |
| Category | Car Care | HIGH — stated directly in the task instruction, corroborated by SOP filing location (`SOPs/CARE CARE/`, apparent typo for "CAR CARE") |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | SLES/CAPB/CDEA-based liquid vehicle wash with silicone emulsion for finish | HIGH — SOP §2 formula |
| Variant Structure | Single variant — no fragrance/colour sub-name exists in either source | HIGH |
| Catalogue Status | Not yet in the online storefront catalogue under this name. **A different, non-matching product ("MUV Shield") exists in `prisma/seed.ts`** — see `00_Source_Register.md` §3, never used as a source here. | HIGH |

---

## KO-CW-FAM-001 — Product Family Overview

- **KOID:** KO-CW-FAM-001
- **Confidence:** HIGH — Chart and SOP agree exactly
- **Evidence:** Product Chart rows 18–19; SOP Packing Standard table
- **Source:** `00_Source_Register.md` §1–§2

| Pack Size | Fill Weight | Sourcing Status |
|---|---|---|
| 500ml | 510g | FULLY SOURCED — Chart and SOP agree exactly |
| 5L | 5100g | FULLY SOURCED — Chart and SOP agree exactly |

**Zero conflict between the two sources** — the cleanest source agreement of any product this
session. One shared 11-litre-batch formula fills both pack sizes; nothing in the process differs
by pack size beyond the fill quantity itself.

---

## KO-CW-SKU-500 — 500ml SKU

- **KOID:** KO-CW-SKU-500
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 18; SOP Packing Standard table

| Field | Value |
|---|---|
| Pack Size | 500ml |
| Fill Weight | 510g |
| Pricing (MRP) | **Commercial data — never stored here.** See `10_LIVE_DATA_MAPPING.md`. Historical Chart citation recorded only in `00_Source_Register.md`. |
| SKU Code / Barcode / Dimensions / Shipping Weight | Not stated |
| Product Images | The SOP references embedded reference photos per pack size, but they are uncaptioned in the extracted XML — not usable as sourced per-SKU imagery |

---

## KO-CW-SKU-5L — 5L SKU

- **KOID:** KO-CW-SKU-5L
- **Confidence:** HIGH — sourced, no conflict
- **Evidence:** Product Chart row 19; SOP Packing Standard table

| Field | Value |
|---|---|
| Pack Size | 5L |
| Fill Weight | 5100g |
| Pricing (MRP) | Commercial data — never stored here. See `10_LIVE_DATA_MAPPING.md`. |
| Other fields | Not stated |

---

## KO-CW-NAME-001 — Canonical Naming

- **KOID:** KO-CW-NAME-001
- **Confidence:** HIGH — no discrepancy between Chart and SOP; one real external naming-adjacency
  conflict independently investigated and resolved
- **Evidence:** `00_Source_Register.md` §1–§3

| Field | Value |
|---|---|
| Official Name | MUV Car Wash |
| Source Names | Chart and SOP both say "MUV Car Wash" exactly — no discrepancy, unlike Hand Wash's "GLOW"/"Lifeshield" or Black Phenyl's pack-size conflict |
| Forbidden/Legacy Names | None |
| Naming-Adjacency Conflict | **"MUV Shield" (`prisma/seed.ts`) is explicitly NOT this product** — different name, ~10× different price, single vs. dual pack size, unsourced wax/gloss-lock claims. Confirmed by direct field-by-field comparison, not assumed from name similarity alone. Never used as a source or naming precedent for this Product Family. |
