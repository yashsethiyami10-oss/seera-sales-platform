# MUV Body Wash™ — Variant Statistics

> New required report for multi-variant Product Families, per `FR-004`.

## Structural split

| Level | Count | % of total |
|---|---|---|
| Parent Knowledge Objects | 63 | 87.5% |
| Variant Knowledge Objects | 9 | 12.5% |
| **Total** | **72** | **100%** |

## Variant Knowledge Object breakdown

| Variant | SKU KOs | Decision-Tree KOs | Total per variant |
|---|---|---|---|
| Crimson Veil | 2 (250ml, 950ml) | 1 (recommendation logic) | 3 |
| Velvet Oak | 2 | 1 | 3 |
| Midnight Frost | 2 | 1 | 3 |
| **Total** | **6** | **3** | **9** |

**Perfect symmetry** — every variant has exactly the same number and type of Knowledge Objects,
reflecting the real, sourced symmetry in the source material itself (all three variants
confirmed at both pack sizes, no unsourced variant like Floor Cleaner's Rose Water).

## Variant sourcing comparison

| Variant | Fragrance Family (sourced) | Pack Sizes | Pricing (Chart, historical citation only) | Sourcing Status |
|---|---|---|---|---|
| Crimson Veil | Premium Floral | 250ml, 950ml | ₹149/₹480 (highest-priced) | FULLY SOURCED |
| Velvet Oak | Woody Premium | 250ml, 950ml | ₹135/₹420 | FULLY SOURCED |
| Midnight Frost | Fresh Cooling | 250ml, 950ml | ₹135/₹420 | FULLY SOURCED |

**Real, sourced price asymmetry**: Crimson Veil is priced higher than Velvet Oak and Midnight
Frost, which are identically priced to each other. Recorded as-is (in `00_Source_Register.md`
only), not smoothed into a false "all variants priced equally" assumption. This asymmetry is
never presented to customers as a live fact — commercial data always resolves via
`10_LIVE_DATA_MAPPING.md`.

## Comparison to Floor Cleaner (the only other Variant Inheritance precedent)

| Metric | Floor Cleaner | Body Wash |
|---|---|---|
| Total variants named | 3 | 3 |
| Variants fully sourced | 2 (Velvet Mist, Cloud Walk) | **3 (all)** |
| Variants named-but-unsourced | 1 (Rose Water) | **0** |
| Single override point | Colour | **Fragrance** |
| Pack sizes per variant | Asymmetric (Rose Water had none) | **Symmetric (all identical: 250ml, 950ml)** |
| Total Knowledge Objects | 54 | 72 |
| Parent/Variant split | 46/8 | 63/9 |

Body Wash's variant architecture is structurally cleaner than Floor Cleaner's — full symmetry,
no unsourced variant — but carries a more severe safety-documentation gap overall (see
`06_Missing_Knowledge_Report.md`).
