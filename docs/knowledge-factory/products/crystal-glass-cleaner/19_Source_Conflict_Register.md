# MUV Crystal Glass Cleaner™ — Source Conflict Register

> Format per the established convention: Source A, Source B, Conflict, Active Source, Reason,
> Founder Decision Required. **Unlike Bathroom Cleaner, this product has zero genuine open
> conflicts** — pricing agrees exactly across both sources. The naming situation is the same
> "resolved by direct Founder instruction" pattern as Bathroom Cleaner's "Fresh."
>
> **FR-001/FR-002 note (2026-07-31 remediation pass):** every ₹ figure in this file is a
> historical source citation only (recorded during source audit) — NOT a live commercial value.
> Per FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never
> from any figure recorded below — see `LIVE_DATA_MAPPING.md`. This applies equally to figures
> cited here for other product families (e.g. Bathroom Cleaner's ₹70/₹65), included only for
> audit-comparison context.

---

## Comparison 1 — Pricing (500 ml) — CLEAN, no conflict

| Field | Value |
|---|---|
| **Source A** | Product Chart (`MUV_Product_Chart_with_USP (1)(1).pdf`, row 13) — ₹90 |
| **Source B** | Production SOP (`MUV_Glass_Cleaner_Production_SOP_With_Photo_Rev1.docx`, Packing Standard table) — ₹90 |
| **Conflict** | None — both sources agree exactly |
| **Active Source** | Either — no discrepancy to resolve |
| **Reason** | N/A |
| **Founder Decision Required** | No |

**Historical source citation only (recorded during source audit) — NOT a live commercial value.**
Per FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never
from the ₹90 figures above — see `LIVE_DATA_MAPPING.md`.

---

## CONFLICT-001 — Naming (RESOLVED — not an open conflict)

| Field | Value |
|---|---|
| **Source A** | Product Chart — "MUV Glass Cleaner" (no "Crystal") |
| **Source B** | Production SOP title — "MUV GLASS CLEANER" (no "Crystal") |
| **Conflict** | Neither source uses "Crystal"; the official name given directly by the Founder in this implementation task is "MUV Crystal Glass Cleaner™" |
| **Active Source** | **Founder Instruction** (authority #2, superseding the Product Chart's own historical naming for this specific field since the Founder has spoken directly) |
| **Reason** | Per the instruction's own explicit rule: preserve historical names only inside the Legacy section. Both sources' "MUV Glass Cleaner" is recorded as a legacy/historical name in `20_Canonical_Naming_Register.md`. |
| **Founder Decision Required** | **NO — already resolved by direct Founder instruction in this task.** Recorded here only for completeness of the conflict-scanning record, matching the exact naming-conflict pattern established in Bathroom Cleaner's CONFLICT-002. |

---

## Comparison 3 — Fragrance identity (partial data gap, not a conflict)

| Field | Value |
|---|---|
| **Source A** | SOP Raw Materials table — "Blue Colour ... (Ocean Blue)" — colour IS named |
| **Source B** | SOP Raw Materials table — "Fragrance ... 10 ml" — no name given |
| **Conflict** | None — this is a partial absence, not a conflict. Colour is confirmed and named; fragrance is present in the formulation but has no identity/name anywhere. |
| **Active Source** | n/a |
| **Reason** | Recorded as a data gap in `18_Founder_Input_Register.md`, not a conflict. Notably a *mixed* state, unlike Bathroom Cleaner where neither colour nor fragrance was named at all. |
| **Founder Decision Required** | Not for conflict-resolution purposes, but yes for filling the fragrance-name gap. |

## Comparison 4 — Manufacturing safety documentation (absence, not conflict)

| Field | Value |
|---|---|
| **Source A** | SOP — full body read, zero safety-relevant passages |
| **Source B** | n/a — no second source addresses safety at all |
| **Conflict** | None — a complete absence, the most severe of any product family audited this session |
| **Active Source** | n/a |
| **Reason** | Recorded as the top Priority Item in `18_Founder_Input_Register.md` |
| **Founder Decision Required** | Yes, for filling the gap (not a conflict-resolution decision) |

## Comparison 5 — Competitor-name check

See `21_Competitor_Reference_Register.md` — zero found, clean result, "Colin" explicitly checked.

---

## Summary

**Total comparisons performed:** 5
**Genuine, unresolved conflicts:** 0 — this is the first product family this session with a
completely clean pricing comparison across both authoritative sources.
**Resolved by direct Founder instruction:** 1 (naming)
**Data gaps (not conflicts):** 2 (fragrance identity — partial; safety documentation — total)
**Clean results:** 2 (pricing; competitor scan)

**This is the first product family where the Source Conflict Register records zero genuine open
pricing/naming conflicts**, a meaningful contrast with Liquid Detergent (Cool Water pricing
conflict) and Bathroom Cleaner (₹70/₹65 pricing conflict) — but it carries the most severe safety
documentation gap of the five packages built this session.
