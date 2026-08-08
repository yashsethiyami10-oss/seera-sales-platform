# MUV Dishwash Gel™ — Source Conflict Register

> Same discipline as both prior packages: records every cross-source comparison performed and
> its result, including clean/non-conflicting results and genuine data-gaps (as distinct from
> conflicts).

---

## Comparison 1 — Pricing: Product Chart vs. Production SOP

| Pack | Product Chart MRP | SOP MRP | Result |
|---|---|---|---|
| 500 ml | ₹85 | **Not stated — SOP has no pricing section** | **DATA GAP, not a conflict** |
| 1 L | ₹155 | Not stated | Data gap |
| 5 L | ₹699 | Not stated | Data gap |

**Historical source citation only (recorded during source audit) — NOT a live commercial value.**
Per FR-001/FR-002 (added 2026-07-31), current pricing must always be resolved from the Product
Catalog API (see `LIVE_DATA_MAPPING.md`), never from the ₹ figures in this table — they document
what the Product Chart said when researched, not a current price.

**Status: NOT A CONFLICT — genuinely uncorroborated, not contradicted.** This is a materially
different situation from both prior packages: Liquid Detergent had two sources that
*disagreed* (a real conflict); Toilet Cleaner had two sources that *agreed* (a clean match);
Dishwash Gel has only **one** source that states pricing at all — the SOP simply doesn't carry
MRP data, only fill weights. There is nothing for the Product Chart's figures to conflict with.
No Founder decision is required to resolve a conflict, because none exists — but the Founder
should be aware pricing here is **single-sourced**, unlike Toilet Cleaner's cross-validated
figures.

## Comparison 2 — Product naming: Product Chart vs. SOP title

| Source | Name |
|---|---|
| Product Chart (row 9–11) | "MUV Dishwash Gel" |
| SOP document title | "MUV DISHWASH LIQUID GEL Production SOP" |

**Status: GENUINE DISCREPANCY — recorded, not silently resolved.** Unlike the pricing situation
above (which is a gap, not a conflict, because only one source speaks to it), this IS a case of
two authoritative sources stating two different names for what is otherwise clearly the same
product (identical batch size, identical pack sizes, identical implied identity). Per source
authority order, the **Product Chart's name ("MUV Dishwash Gel") is used as this package's
primary reference name**, since the Product Chart is authority #1 for "Product Name" per the
implementation instructions' own authority ordering — but the SOP's title is preserved verbatim
in `19_Canonical_Naming_Register.md` rather than discarded. **Founder Decision Required:**
confirm which name is the true canonical name, or confirm both are acceptable (e.g. "Gel" as
short form, "Liquid Gel" as full form).

## Comparison 3 — Fragrance/colour consistency across SKUs

| Field | 500 ml | 1 L | 5 L | Result |
|---|---|---|---|---|
| Colour | Yellow | Yellow | Yellow | ✓ Consistent — single formulation confirmed |
| Fragrance | Lemon | Lemon | Lemon | ✓ Consistent — single formulation confirmed |

**Status: RESOLVED (clean).**

## Comparison 4 — Competitor-name check

See `20_Competitor_Reference_Register.md` for the full record — **zero competitor references
found**, recorded as a clean, explicitly-checked result, matching the discipline established in
this register.

---

## Summary

**Total comparisons performed:** 4
**Genuine conflicts found:** 0
**Genuine discrepancies found (non-pricing):** 1 (Comparison 2 — product naming)
**Data gaps recorded (not conflicts):** 1 (Comparison 1 — single-sourced pricing)
**Clean/matching results:** 2 (Comparisons 3 and 4)

**Open Founder Decision:** the canonical product name (Comparison 2) — tracked jointly here and
in `19_Canonical_Naming_Register.md` and `17_Founder_Input_Register.md`.
