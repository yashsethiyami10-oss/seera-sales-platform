# MUV Pure Bleach™ — Product Architecture

---

## KO-PB-ARCH-001 — Parent Product Identity

- **KOID:** KO-PB-ARCH-001
- **Title:** MUV Pure Bleach™ — Parent Product Identity
- **Category:** Product Architecture
- **Tags:** [pure-bleach, identity, architecture]
- **Version:** 1.0
- **Confidence:** HIGH (existence, pack size) / MEDIUM (category, inferred from SOP filing) / N/A (manufacturer)
- **Evidence:** Product Chart row 23; SOP title block; SOP filing location (FABRIC CARE)
- **Relationships:** KO-PB-NAME-001 (see `09_Founder_Rules.md`)
- **Owner:** MUV Product Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 23; `MUV_Bleach_SOP_10L_Batch_500ml.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Official Name | MUV Pure Bleach™ | Direct Founder Instruction (this task) |
| Source Name | "MUV Bleach" (Product Chart row 23; SOP title "MUV Bleach SOP") | HIGH |
| Category | Fabric Care | MEDIUM-HIGH — inferred from the SOP's own folder placement (`SOPs/FABRIC CARE/`), the same folder as Liquid Detergent's SOP; this is a stronger signal than the generic "Home Care" folder-name inference used for five of the six prior products, but still an inference from filing location, not a stated category field |
| Manufacturer | Unknown — Founder Decision Required | N/A |
| Product Type | Sodium-hypochlorite-based liquid bleach, per the SOP's own Objective statement | HIGH |
| Catalogue Status | Not yet in the online storefront catalogue (`prisma/seed.ts` has zero matching records) | HIGH |

---

## KO-PB-ARCH-002 — SKU / Pack Size

- **KOID:** KO-PB-ARCH-002
- **Title:** MUV Pure Bleach™ — 500ml SKU
- **Category:** Product Architecture
- **Tags:** [pure-bleach, sku, 500ml]
- **Version:** 1.0
- **Confidence:** HIGH — single, unambiguous pack size in the only two sources that exist
- **Evidence:** Product Chart row 23; SOP §2 "Packaging" and §6 "Filling & Packaging"
- **Relationships:** KO-PB-ARCH-001
- **Owner:** MUV Product Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** `MUV_Product_Chart_with_USP (1)(1).pdf` row 23; `MUV_Bleach_SOP_10L_Batch_500ml.docx`

**Content:**

| Field | Value | Confidence |
|---|---|---|
| Pack Size | 500 ml | HIGH |
| Container | HDPE bottle, opaque (SOP §2: "500 ml HDPE Bottle"; §6: "Use opaque containers") | HIGH |
| Fill Weight | Unknown — no fill-weight figure is given anywhere in the SOP (unlike five of the six prior SOPs, which stated a specific gram figure) | N/A — Founder Decision Required |
| Pricing (MRP) | **Commercial data — never stored here.** See `10_LIVE_DATA_MAPPING.md`. The historical Chart citation is recorded only in `00_Source_Register.md`. | N/A by design |
| SKU Code / Barcode | Unknown — Founder Decision Required | N/A |
| Dimensions / Shipping Weight | Unknown — Founder Decision Required | N/A |
| Product Images | Unknown — no embedded photo exists in the source SOP (confirmed: no `word/media/` folder in the docx package), unlike several prior products' SOPs | N/A — see `10_LIVE_DATA_MAPPING.md` |

**No second pack size exists in any source.** Per this task's own "Available Pack Size: 500ml"
instruction, this package does not speculate about a larger size.

---

## KO-PB-ARCH-003 — Naming Architecture

- **KOID:** KO-PB-ARCH-003
- **Title:** MUV Pure Bleach™ — Naming Architecture
- **Category:** Product Architecture
- **Tags:** [pure-bleach, naming, governance]
- **Version:** 1.0
- **Confidence:** HIGH — official name is a direct, current Founder Instruction; source name is verbatim
- **Evidence:** Direct Founder Instruction (this task); Product Chart row 23; SOP title block
- **Relationships:** KO-PB-ARCH-001
- **Owner:** MUV Product Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Direct Founder Instruction; `00_Source_Register.md` naming finding

**Content:**

| Field | Value |
|---|---|
| Official Name | MUV Pure Bleach™ |
| Legacy / Source Name (historical reference only) | "MUV Bleach" — used verbatim in both the Product Chart and the SOP title |
| AI Canonical Name | MUV Pure Bleach™ |
| Forbidden Names | None explicitly stated. This package recommends treating "MUV Bleach" (without "Pure") as discouraged for new customer-facing content, matching the pattern already established for Bathroom Cleaner's "Fresh" and Glass Cleaner's "Crystal" — a recommendation, not an asserted Founder decision. |

Full detail and the "why" of this resolution is in `09_Founder_Rules.md`, which documents how the
naming-conflict-resolution pattern from prior packages applies here.
