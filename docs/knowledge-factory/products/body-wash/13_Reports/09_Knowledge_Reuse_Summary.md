# MUV Body Wash™ — Knowledge Reuse Summary

> Second package built under `FR-003`, and the first also applying `FR-004`. No specific
> prior-package subset was named in this task's instruction (unlike White Phenyl's explicit
> list) — this package therefore compared against the full set of nine prior packages, with
> Floor Cleaner given particular weight as the only other Variant Inheritance precedent. Full
> JSON data in `11_JSON/knowledge_reuse.json`.

---

## Two dimensions, reported separately

This package's task instruction asks for a five-category structure — Parent Objects, Variant
Objects, Shared Objects, New Objects, Reuse Percentage — which combines two genuinely different
dimensions: `FR-004`'s **structural** Parent/Variant split, and `FR-003`'s **methodology-reuse**
dimension. Both are reported below, kept clearly distinct rather than conflated into one
confusing number.

## Structural breakdown (per `FR-004`)

| Level | Count |
|---|---|
| Parent Objects | 63 |
| Variant Objects | 9 |
| **Total** | **72** |

## Reuse breakdown (per `FR-003`)

### Parent Objects Reused — 17 Knowledge Objects

| Reused pattern | Origin | Used by |
|---|---|---|
| **Variant Inheritance Architecture** (Parent/Variant KO split, single-override-point identification methodology) | `KO-FC-INHERIT-001` (Floor Cleaner) — the only other Variant Inheritance precedent this session | `KO-BW-INHERIT-001` |
| 8-field Care Response/Conversation structure | Bathroom Cleaner (originating package) | All 12 `KO-BW-CONV-*` |
| Product-family identity table structure | Black Phenyl / White Phenyl `ARCH-001` pattern | `KO-BW-IDENT-001` |
| Naming-resolution/verification methodology | Bathroom Cleaner / Glass Cleaner / Pure Bleach / Floor Cleaner | `KO-BW-NAME-001` |
| Cross-product "when another MUV product is more suitable" comparison methodology | `KO-BP-DT-003` (Black Phenyl), reused `KO-WP-DT-003` (White Phenyl) | `KO-BW-DT-003` |
| Emergency-guidance behavioral rule | `KO-PB-SAFETY-013` (Pure Bleach), reused by Black Phenyl/White Phenyl | `KO-BW-SAFETY-010` |

### Shared Objects — 2 Knowledge Objects

Grounded in real platform code shared factory-wide: `KO-BW-FAQ-002`
(`lib/intelligence/confidence-engine.ts`), `KO-BW-DT-004` (`lib/eios/cognitive-state.ts`).

### Variant Objects (created fresh per variant) — 9 Knowledge Objects

The 8-field/recommendation-logic *format* is reused (already counted via the Variant Inheritance
pattern above); the actual variant-specific *content* — fragrance identity per variant — is
genuinely new, independently sourced from this product's own Variant Matrix.

### New / Product-specific Objects — 44 Knowledge Objects

Everything else: the full formulation/mechanism/active-ingredient detail, the total
safety-content-absence finding (unique to this product — the most severe such finding this
session), the "MUV Cleanse" seed-data conflict finding (a genuinely new discovery), all 8
Objection Handling entries, most Product Intelligence KOs, and the FR-004 application record
itself.

## Additional reused templates (file-level)

| Template | Origin |
|---|---|
| `10_LIVE_DATA_MAPPING.md` 11-field table | Black Phenyl / White Phenyl |
| `14_FOUNDER_GAPS.md` priority-tiered register structure | Black Phenyl / White Phenyl |
| Two-track Product Quality Score methodology (extended here with a Safety Risk Flag) | Pure Bleach |
| Commercial Data Grep Check validation methodology | Pure Bleach |

## Duplicate Knowledge Prevented

No product-specific fact was copied from any other package. The Variant Inheritance
**architecture** (methodology) was reused from Floor Cleaner, but this product's actual override
point (fragrance, not colour) and every formulation/safety fact were independently sourced from
Body Wash's own Chart rows and SOP — actively verified by discovering that colour is here a
*shared*, not variant, fact, a genuine structural difference from Floor Cleaner that this package
did not assume away.

## Reuse Percentage

**26.4%** — (17 Parent Objects Reused + 2 Shared Objects) ÷ 72 total Knowledge Objects = 19/72.

Lower than White Phenyl's 30.8%, primarily because this package's Variant-level content (9 KOs,
12.5% of the total) and its two uniquely severe, product-specific findings (the safety-content
absence and the seed-data conflict) are large, genuinely new contributions that cannot be
responsibly counted as reuse under strict Never-Invent.
