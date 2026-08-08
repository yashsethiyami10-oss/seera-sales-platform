# MUV Black Phenyl™ — Product Architecture

---

## KO-BP-ARCH-001 — Parent Product Identity

- **KOID:** KO-BP-ARCH-001
- **Confidence:** HIGH (existence) / MEDIUM (category, inferred from SOP filing) / N/A (manufacturer)
- **Evidence:** Product Chart row 22; SOP title block; SOP filing location (HOME CARE)
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 22; `MUV_Black_Phenyl_SOP_10L_Batch.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Name | MUV Black Phenyl™ | Direct Founder Instruction, matching both sources exactly |
| Source Name | "MUV Black Phenyl" (Chart, SOP) — no discrepancy | HIGH |
| Category | Home Care | MEDIUM — inferred from SOP folder placement (`SOPs/HOME CARE/`), the same inference strength used for five of the eight products this session |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | Black-phenyl-concentrate-based floor cleaner/disinfectant, per the SOP's own Objective statement | HIGH |
| Catalogue Status | Not yet in the online storefront catalogue (`prisma/seed.ts` has zero matching records) | HIGH |
| Related but distinct product | "MUV Phenyl" (Chart rows 20–21, 1L/5L) — believed to correspond to the separate "White Phenyl" SOP; not part of this package | MEDIUM (inference, not confirmed identity) |

---

## KO-BP-ARCH-002 — SKU / Pack Size (contains the confirmed conflict)

- **KOID:** KO-BP-ARCH-002
- **Confidence:** CONFLICTED — two sources directly disagree on pack size
- **Evidence:** Product Chart row 22; SOP §2 "Packaging" and §6 "Filling & Packaging"
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 22; `MUV_Black_Phenyl_SOP_10L_Batch.docx`

**Content:**

| Field | Product Chart | Production SOP | Resolution |
|---|---|---|---|
| Pack Size | 500ml | 1 L HDPE Bottle | **1L confirmed per direct Founder Instruction** (this task's own "Available Pack Sizes: 1L"), matching the SOP. The Chart's 500ml entry is **not deleted** — recorded as an open, unexplained discrepancy in `14_FOUNDER_GAPS.md`. |
| MRP | Commercial data — never stored here. The Chart ties a historical figure to its 500ml entry, recorded only in `00_Source_Register.md`. | Not stated | See `10_LIVE_DATA_MAPPING.md`. |
| Fill Weight | N/A | Not stated (unlike several prior SOPs) | Unknown — Founder Decision Required |
| SKU Code / Barcode | N/A | Not stated | Unknown — Founder Decision Required |
| Dimensions / Shipping Weight | N/A | Not stated | Unknown — Founder Decision Required |
| Product Images | N/A | No embedded photo exists in the source SOP (confirmed: no `word/media/` folder) | Unknown — see `10_LIVE_DATA_MAPPING.md` |

**This is a real, confirmed conflict, not a data gap** — both sources state a specific, different
pack size, and neither can be dismissed as simply missing data. It directly corroborates the
pre-existing `conflict-service.ts` header comment naming Black Phenyl among known conflicts. See
`14_FOUNDER_GAPS.md` for the priority Founder decision this creates: is the Chart's 500ml entry
an error, a discontinued/different SKU, or does a real 500ml Black Phenyl variant exist without
its own documented SOP?

---

## KO-BP-ARCH-003 — Naming Architecture

- **KOID:** KO-BP-ARCH-003
- **Confidence:** HIGH — both sources match the official name exactly
- **Evidence:** Product Chart row 22 ("MUV Black Phenyl"); SOP title ("MUV Black Phenyl SOP")
- **Source:** `00_Source_Register.md` naming finding

**Content:**

| Field | Value |
|---|---|
| Official Name | MUV Black Phenyl™ |
| Source Name | "MUV Black Phenyl" — identical, no legacy-name resolution needed |
| AI Canonical Name | MUV Black Phenyl™ |
| Forbidden Names | None stated |
| Related product to never confuse with | "MUV Phenyl" / (presumed) "White Phenyl" — a separate, distinct SKU family, out of scope for this package |

This is the first product family this session where the source material already matches the
Founder-given name exactly with zero discrepancy — the same clean-naming situation Floor Cleaner
had for Velvet Mist and Cloud Walk, now true for the parent product itself.
