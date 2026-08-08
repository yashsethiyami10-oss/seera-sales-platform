# MUV Dishwash Gel™ — Batch Reconciliation

> New content category relative to the prior two packages. This file performs real arithmetic
> reconciliation between the sourced raw-material inputs (KO-DW-MFG-001) and the sourced
> finished-product fill weights (KO-DW-VAR-001/002/003) — the calculation itself is new, but
> every number it uses is already sourced; nothing is invented.

---

## KO-DW-RECON-001 — Batch Mass Reconciliation

- **KOID:** KO-DW-RECON-001
- **Title:** MUV Dishwash Gel™ — 10 L Batch Mass Reconciliation
- **Category:** Batch Reconciliation
- **Tags:** [dishwash-gel, batch-reconciliation, yield]
- **Version:** 1.0
- **Confidence:** MEDIUM — real arithmetic on sourced figures, but relies on a stated density
  assumption for liquid ingredients (see below), and two ingredient quantities are unspecified
  ("As Required" / "if required") and excluded from the sum.
- **Evidence:** Computed directly from KO-DW-MFG-001's raw-material table.
- **Relationships:** KO-DW-MFG-001, KO-DW-VAR-001, KO-DW-VAR-002, KO-DW-VAR-003
- **Owner:** MUV Knowledge Factory (pending Founder approval)
- **Approval Status:** DRAFT — Pending Founder Review
- **Review Date:** Upon Founder approval
- **Source:** Derived arithmetic from `MUV_Dishwash_Liquid_Gel_Production_SOP.docx`

**Content:**

**Stated assumption (explicit, not hidden):** liquid volumes (DM Water 8.6 L, Lemon Fragrance
15 ml) are converted to mass at an approximate 1 g/ml density for this calculation only — a
simplifying assumption for a rough reconciliation, not a lab-confirmed density figure for these
specific materials.

**Sum of known-quantity raw materials, 10 L batch:**

| Material | Mass (g) |
|---|---|
| DM Water (8.6 L @ ~1 g/ml) | 8,600 |
| EDTA | 10 |
| Caustic Soda | 60 |
| LABSA Slurry | 260 |
| SLES (28%) | 2,200 |
| CAPB | 380 |
| CDEA | 100 |
| Glycerine | 100 |
| Phenoxy Ethanol | 40 |
| Lemon Fragrance (15 ml @ ~1 g/ml) | 15 |
| Salt (solution) | 150 |
| **Subtotal** | **11,915 g (≈ 11.92 kg)** |

**Excluded from the sum (quantities not numerically specified in the source):**
- Yellow Colour — "As Required"
- Citric Acid Solution — "For pH adjustment if required"

**Interpretation:** the ≈11.92 kg subtotal, for a batch described as "10 Litres," is consistent
with a finished gel that is somewhat denser than water (plausible for a surfactant gel system,
given SLES alone is charged at 2.2 kg into what is a comparatively small remaining volume) — this
package does not assert a specific finished-product density figure, since none is stated in any
source, only notes that the mass reconciliation is internally consistent with the product being
described as a "gel" rather than a thin liquid.

**Illustrative yield arithmetic (NOT a production plan):** dividing the ≈11,915 g subtotal by
each SKU's sourced fill weight, purely as an arithmetic illustration of what one batch could
theoretically yield if filled entirely into one pack size (a real batch would mix pack sizes
according to demand, not follow this illustration):

| If filled entirely as... | Approx. units per batch |
|---|---|
| 500 ml (508 g fill) | ≈ 23.5 units |
| 1 L (1012 g fill) | ≈ 11.8 units |
| 5 L (5020 g fill) | ≈ 2.4 units |

**Not yet available (REQUIRES FOUNDER INPUT):**
- Actual measured batch yield (this file's figures are calculated from sourced inputs, not a
  measured/confirmed real production yield)
- Real finished-product density
- Actual quantities used for Yellow Colour and Citric Acid Solution in a real production run
- Process losses (transfer loss, filling-line loss) — this reconciliation assumes zero loss,
  which is never realistic in real production and should not be treated as a real yield forecast
