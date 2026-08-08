# MUV Body Wash™ — Product Quality Score

> Scored using the same two-track methodology reused from Pure Bleach (see
> `09_Knowledge_Reuse_Summary.md`): process quality vs. content completeness, reported
> separately. **This package adds an explicit Safety Risk Flag, since the raw numeric scores
> below would otherwise understate the single most severe finding of this package.**

---

## ⚠️ Safety Risk Flag (read before the numeric scores)

This package's raw Confidence Level and Knowledge Completeness scores are numerically *higher*
than Pure Bleach's, Black Phenyl's, and White Phenyl's — but this reflects the six SKUs and
three fragrance families being cleanly sourced, **not** that this product is better documented
for safe customer use. **Zero safety content exists for a product in direct, sustained skin
contact** — the single most consequential gap of any product family this session. The scores
below must be read alongside `14_FOUNDER_GAPS.md` priority items 1–2, not instead of them.

## Scores by dimension

| Dimension | Score | Basis |
|---|---|---|
| **Source Coverage** | 100/100 | All 9 candidate sources directly searched; the seed-data conflict was actively discovered, not merely missed. |
| **Knowledge Completeness** | 61/100 | 44 of 72 Knowledge Objects (61.1%) carry a real, sourced answer — the highest of the four manufacturing/formulation-only-SOP products this session, driven by full variant/SKU symmetry, not by better safety documentation. |
| **Validation Status** | 100/100 | 13/13 checks passed, including a clean-on-first-pass commercial-data result and an inconsistency (the Variant Inheritance Map's KO tree) found and corrected during authoring. |
| **JSON Integrity** | 100/100 | All 11 files in `11_JSON/` parse valid; every declared count, including the four-way Knowledge Reuse breakdown, reconciles. |
| **Care Intelligence Compliance** | 100/100 | Every conversation flow, especially Sensitive Skin (KO-BW-CONV-006), documents genuine uncertainty rather than manufacturing reassurance. |
| **Governance Compliance** | 100/100 | FR-001 through FR-004 all applied; Never-Invent extended explicitly to cosmetic/dermatological claims and enforced throughout. |
| **Confidence Level** | 52/100 | Weighted average (HIGH=1.0, MEDIUM=0.6, LOW=0.3, MIXED=0.5, N/A=0.0): (29×1.0 + 12×0.6 + 1×0.3 + 2×0.5 + 28×0) ÷ 72 = 52.1%, rounded to 52. |

## Composite score

**Process Quality: 100/100.**

**Content Completeness: 57/100** (average of Knowledge Completeness 61 and Confidence Level 52)
— numerically the highest Content Completeness of any manufacturing/formulation-only-SOP product
this session, but this number **must not** be read as "safer" or "more launch-ready" than the
others — see the Safety Risk Flag above.

## Comparison across manufacturing-only-SOP products this session

| Metric | Pure Bleach | Black Phenyl | White Phenyl | Body Wash |
|---|---|---|---|---|
| Knowledge Completeness | 52 | 52 | 54 | **61** |
| Confidence Level | 44 | 41 | 45 | **52** |
| Content Completeness composite | 48 | 47 | 50 | **57** |
| Sourced safety content exists? | Yes (mixing restriction, storage) | Yes (PPE/SDS/ventilation) | Yes (PPE/ventilation/SDS) | **No — zero** |

**The inverse relationship between the numeric scores and actual safety documentation is the
single most important finding of this report.**

## What would move the score in a way that actually matters

Real Founder-supplied safety/dermatological documentation (even a real SDS or lab test result)
would move both the numeric score AND the Safety Risk Flag — closing the gap that matters most
here is not the same as closing the gap that would raise this number the most (e.g. adding a
container-material fact would raise Knowledge Completeness without addressing the real risk).
