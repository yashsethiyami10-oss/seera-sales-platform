# MUV Toilet Cleaner™ — Source Conflict Register

> A first-class deliverable for this product family. Records every cross-source comparison
> performed and its result — including a clean/matching result, which is recorded explicitly
> rather than omitted, so "no conflict was found" is a verifiable claim, not an absence of
> checking. Mirrors the discipline `lib/knowledge-factory/conflict-service.ts` (this session's
> own Sprint 3 work) applies to real conflicts, extended here to also record confirmed matches.

> **Remediation label (FR-001/FR-002, applied 2026-07-31):** every ₹ figure in this register
> (Comparison 1 and Comparison 2 below) is a **historical source citation only** (recorded during
> source audit) — **NOT a live commercial value.** Per FR-001/FR-002, current pricing must always
> be resolved from the Product Catalog API, never from any figure recorded in this register. See
> `LIVE_DATA_MAPPING.md`.

---

## Comparison 1 — Pricing: Product Chart vs. Production SOP

| Field | Product Chart (`MUV_Product_Chart_with_USP (1)(1).pdf`, rows 7–8) | Production SOP (`MUV_Toilet_Cleaner_Final_Production_SOP.docx`, "Finished Product Details") | Result |
|---|---|---|---|
| 500 ml MRP | ₹80 | ₹80 | ✓ **MATCH — no conflict** |
| 5 L MRP | ₹400 | ₹400 | ✓ **MATCH — no conflict** |

**Status: RESOLVED (clean — no conflict existed).** Unlike MUV Liquid Detergent™'s Cool Water
SKU (where the two equivalent sources disagreed, recorded as `KO-LD-CONFLICT-001` in that
package), this product's two authoritative sources agree exactly on both SKUs' pricing. No
Founder decision is required for pricing.

## Comparison 2 — Institutional pricing: `consumption-rules.ts` vs. retail MRP

| Field | `lib/inst-sales/consumption-rules.ts` | Retail MRP (Product Chart / SOP) | Result |
|---|---|---|---|
| Implied per-litre price | ₹130/Ltr (placeholder institutional-estimation constant) | ₹80/500ml ≈ ₹160/Ltr; ₹400/5L = ₹80/Ltr | **NOT a conflict — different purposes, not comparable as stated** |

**Status: NOT A CONFLICT, recorded for transparency.** This is deliberately not registered as a
pricing conflict, because `consumption-rules.ts`'s own header comment explicitly self-identifies
its ₹130/Ltr figure as "a placeholder institutional price list, not a lookup into the real
storefront `Product` catalog" and warns every consumer of that module to "treat [it] as such." A
genuine conflict requires two sources each claiming to state the *actual* price; here only one
source (Product Chart / SOP) makes that claim, and the other explicitly disclaims making it.
Recorded here so the ₹130/Ltr figure's existence and its relationship to real pricing is
traceable, not because it contradicts the real MRP in the conflict-register sense.

## Comparison 3 — Fragrance/colour naming consistency

| Field | SOP Step 4 (colour) | SOP Step 5 (perfume) | Consistency across both SKUs |
|---|---|---|---|
| Colour | Acid Blue Colour, 1.5 g | — | Single formulation, applies to both 500 ml and 5 L — no per-SKU variation stated, no conflict |
| Fragrance | — | Perfume, 5 ml ("Harpic Floral") | Single formulation, applies to both SKUs — no per-SKU variation stated, no conflict |

**Status: RESOLVED (clean — no conflict, single formulation confirmed for both SKUs).**

## Comparison 4 — Packaging format naming

| Field | 500 ml SKU | 5 L SKU | Result |
|---|---|---|---|
| Container type (per SOP) | "Bottle" | "Can" | **Not a conflict — a real, sourced difference**, not a discrepancy between two sources disagreeing about the same fact. Preserved verbatim in `10_Product_Variants.md` rather than assumed to be an inconsistency. |

---

## Summary

**Total comparisons performed:** 4
**Conflicts found:** 0
**Non-conflicting transparency notes recorded:** 1 (Comparison 2)
**Genuine sourced differences (not conflicts) recorded:** 1 (Comparison 4)

This is a materially cleaner source picture than the Liquid Detergent package, which had one
genuine, unresolved pricing conflict. No entry in this register requires a Founder pricing
decision — the one open Founder-facing question from this package's research (the "Harpic
Floral" naming question) is a governance/naming decision, not a source conflict, and is tracked
in `Founder_Input_Register.md` instead.
