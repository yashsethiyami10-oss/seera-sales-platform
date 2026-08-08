# MUV Hand Wash™ — Knowledge Reuse Summary

> Per `FR-003`. No specific prior-package subset was named in this task's instruction — compared
> against the full set of ten prior packages, with Body Wash (the only other `FR-004` package)
> and Floor Cleaner (the original Variant Inheritance precedent) given particular weight. Reports
> both the `FR-004` structural dimension and the `FR-003` reuse dimension separately, matching the
> pattern established for Body Wash — never conflated.

---

## Structural split (`FR-004` dimension)

| Level | Count | % of total |
|---|---|---|
| Parent Objects | 65 | 84.4% |
| Variant Objects | 12 | 15.6% |
| **Total** | **77** | **100%** |

## Reuse split (`FR-003` dimension)

| Category | Count | % of total |
|---|---|---|
| Parent Objects Reused (methodology reused, facts independently sourced) | 17 | 22.1% |
| Shared Objects (grounded in shared platform code) | 1 | 1.3% |
| Variant Objects Created Fresh Per Variant (format reused, content new) | 12 | 15.6% |
| New Product-Specific Objects | 47 | 61.0% |
| **Total** | **77** | **100%** |

**Reuse Percentage: 23.4%** = (17 + 1) / 77.

## What was reused (methodology only, never facts)

| Pattern | Origin | Used by |
|---|---|---|
| Variant Inheritance Architecture (Parent/Variant split, override-point identification) | Floor Cleaner, reused via Body Wash | KO-HW-INHERIT-001 |
| Product-family identity table structure | Black Phenyl / White Phenyl / Body Wash | KO-HW-IDENT-001 |
| Naming-resolution/verification methodology | Bathroom Cleaner / Glass Cleaner / Pure Bleach / Floor Cleaner / Body Wash | KO-HW-NAME-001 |
| Cross-variant comparison table methodology | Floor Cleaner, reused via Body Wash | KO-HW-DT-COMPARE-001 |
| Emergency-guidance behavioral rule | Pure Bleach → Black Phenyl → White Phenyl → Body Wash | KO-HW-SAFETY-011 |
| 12-flow Customer Conversation structure | Bathroom Cleaner (originating), reused every package since | all 12 KO-HW-CONV-* |
| AI Response Guidance (confidence-engine.ts) | Shared platform code | KO-HW-FAQ-002 |
| 10_LIVE_DATA_MAPPING.md commercial-field table | Black Phenyl / White Phenyl / Body Wash | `10_LIVE_DATA_MAPPING.md` |
| 14_FOUNDER_GAPS.md priority-tiered register | Black Phenyl / White Phenyl / Body Wash | `14_FOUNDER_GAPS.md` |
| Two-track Product Quality Score + Safety Risk Flag | Pure Bleach (two-track) / Body Wash (Safety Risk Flag) | `08_Product_Quality_Score.md` |
| Commercial Data Grep Check methodology | Pure Bleach | `12_Validation/Commercial_Data_Grep_Check.md` |

## What is genuinely new (not reused from anywhere)

**The Variant Availability Architecture itself** (`02_Product_Architecture.md` KO-HW-AVAIL-001,
`11_JSON/variant_availability.json`, `13_Reports/05_Variant_Availability_Report.md`) — a
first-of-its-kind pattern this package originates, not reused from any prior package. Also new:
the two-override-point (colour + fragrance) Variant Inheritance finding, the Chart-vs-Founder
matrix conflict, the Life Shield antibacterial-claim investigation, and the first application of
`FR-005` throughout.

## No duplicate knowledge

No product-specific fact (formula quantity, process step detail, colour, pricing figure, gap
finding) was copied from any other package. Every fact in this package was independently sourced
from this product's own Chart rows and SOP, or is a direct Founder Instruction specific to this
Product Family.

## Comparison to Body Wash

| Metric | Body Wash | Hand Wash |
|---|---|---|
| Reuse Percentage | 26.4% | **23.4%** |
| Parent Objects Reused | 17 | 17 |
| Shared Objects | 2 | 1 |
| Variant Objects | 9 | **12** |
| New Product-Specific Objects | 44 | **47** |

Hand Wash's lower reuse percentage reflects its larger variant-KO count (4 asymmetric variants
vs. 3 symmetric) and its genuinely new architectural contribution (Variant Availability), which
by definition could not be reused from any prior package.
