# MUV Car Wash™ — Knowledge Reuse Summary

> Per `FR-003`. Compared against all eleven prior packages, with Pure Bleach (the original
> single-SKU, no-variant package) given particular weight.

---

## Reuse split (no `FR-004` structural dimension — zero variant KOs this package)

| Category | Count | % of total |
|---|---|---|
| Parent Objects Reused (methodology reused, facts independently sourced) | 17 | 31.5% |
| Shared Objects (grounded in shared platform code) | 1 | 1.9% |
| Variant Objects | 0 | 0% (Not Applicable) |
| New Product-Specific Objects | 36 | 66.7% |
| **Total** | **54** | **100%** |

**Reuse Percentage: 33.3%** = (17 + 1) / 54 — the highest of any package this session.

## What was reused (methodology only, never facts)

| Pattern | Origin | Used by |
|---|---|---|
| Product-family identity table structure | Black Phenyl / White Phenyl / Body Wash / Hand Wash | KO-CW-IDENT-001 |
| Naming-resolution/verification methodology | Every prior package | KO-CW-NAME-001 |
| Emergency-guidance behavioral rule | Pure Bleach → ... → Hand Wash | KO-CW-SAFETY-006 |
| Single-SKU-family need/pack-size tree structure | Pure Bleach (original single-SKU package) | KO-CW-DT-001, KO-CW-DT-002 |
| 12-flow Customer Conversation structure | Bathroom Cleaner (originating), every package since | all 12 KO-CW-CONV-* |
| AI Response Guidance (confidence-engine.ts) | Shared platform code | KO-CW-FAQ-002 |
| 10_LIVE_DATA_MAPPING.md commercial table, extended with a new FR-006 operational table | Black Phenyl / White Phenyl / Body Wash / Hand Wash + this package (new) | `10_LIVE_DATA_MAPPING.md` |
| Two-track Product Quality Score, adapted to a CMS Dependency Flag | Pure Bleach (two-track) / Body Wash-Hand Wash (Risk Flag pattern) | `06_Product_Quality_Score.md` |

## What is genuinely new

The `FR-006` CMS-reference mechanism applied from inception (KO-CW-SAFETY-001–005, KO-CW-INTEL-003),
the Claims Validation methodology (KO-CW-INTEL-008 — a first-of-its-kind concern, now available
for reuse by future packages), and the correctly-determined absence of variant architecture.

## No duplicate knowledge

No product-specific fact was copied from any other package. Every fact was independently sourced
from this product's own Chart rows and SOP, or is a direct Founder Instruction (the `FR-006`
architecture) specific to this and future Product Families.

## Comparison to Hand Wash

| Metric | Hand Wash | Car Wash |
|---|---|---|
| Reuse Percentage | 23.4% | **33.3%** |
| Parent Objects Reused | 17 | 17 |
| Variant Objects | 12 | **0** |
| New Product-Specific Objects | 47 | **36** |

Car Wash's higher reuse percentage reflects the complete absence of variant-level content — every
variant-driven complication that lowered Hand Wash's reuse percentage (asymmetric availability,
two override points) simply doesn't exist here.
