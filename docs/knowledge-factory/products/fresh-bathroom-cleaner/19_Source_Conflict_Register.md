# MUV Fresh Bathroom Cleaner™ — Source Conflict Register

> Format per explicit instruction: Source A, Source B, Conflict, Active Source, Reason, Founder
> Decision Required.

> **FR-001/FR-002 notice (2026-07-31):** the ₹ figures recorded in CONFLICT-001 below are
> **historical source citations only** — evidence of what the two source documents said during
> research, retained per FR-002's explicit exception for this register. They are **never a live
> commercial value** and must never be recited to a customer or the AI as a current price. Current
> pricing must always be resolved from the Product Catalog API — see `LIVE_DATA_MAPPING.md`. Per
> FR-001, this package no longer carries a "default active source" for pricing anywhere else in
> the package (`02_Product_Family_and_SKUs.md`, `11_Sales_Intelligence.md`, etc. now defer to the
> live catalog instead) — this register remains the one place the two historical figures are kept,
> for audit traceability of the conflict that prompted FR-001 in the first place.

---

## CONFLICT-001 — Pricing (500 ml) — historical audit record only, not a live commercial fact

| Field | Value |
|---|---|
| **Source A** | Product Chart (`MUV_Product_Chart_with_USP (1)(1).pdf`, row 12) — ₹70 (historical citation only) |
| **Source B** | Production SOP (`MUV_Bathroom_Cleaner_Production_SOP_With_Photo.docx`, Packing Standard table) — ₹65 (historical citation only) |
| **Conflict** | Same SKU (500 ml), two different MRPs recorded in two pre-launch source documents, a real ₹5 discrepancy between them — a fact about the source documents, not about current live pricing |
| **Active Source (historical — pre-FR-001 default, superseded)** | Product Chart (₹70) was this package's original default per the Source Authority order (Product Chart = authority #1 for "Current MRP"). **This default is superseded by FR-001/FR-002**: neither figure is used live anywhere in this package any longer; current pricing is always resolved from the Product Catalog API (see `LIVE_DATA_MAPPING.md`) regardless of which historical source was "authoritative." |
| **Reason** | This is very likely the exact conflict already referenced generically in `lib/knowledge-factory/conflict-service.ts`'s header comment (written earlier this session, before any product-family package existed): *"Bathroom Cleaner...pricing and naming conflict[s]...found by hand."* This package's research independently reproduces the specific numbers that comment only referenced by name. |
| **Founder Decision Required** | **Superseded by FR-001/FR-002 (2026-07-31).** This conflict no longer blocks anything customer/AI-facing — pricing is never sourced from this package. The historical question of which pre-launch document (₹70 vs. ₹65) was "correct" remains an open internal curiosity for whoever eventually creates the real `Product`/`ProductVariant` row, but it is no longer a Founder-decision gate for this Knowledge Package. |

---

## CONFLICT-002 — Naming (RESOLVED — not an open conflict)

| Field | Value |
|---|---|
| **Source A** | Product Chart — "MUV Bathroom Cleaner" (no "Fresh") |
| **Source B** | Production SOP title — "MUV BATHROOM CLEANER" (no "Fresh") |
| **Conflict** | Neither source uses "Fresh"; the official name given directly by the Founder in this implementation task is "MUV Fresh Bathroom Cleaner™" |
| **Active Source** | **Founder Instruction** (authority #2, explicitly above the SOP #3 and, for this specific field, superseding the Product Chart's own historical naming since the Founder has spoken directly and explicitly on this exact question) |
| **Reason** | Per the instruction's own explicit rule: *"Do not use legacy names unless recording them in historical references."* Both sources' "MUV Bathroom Cleaner" is recorded as a legacy/historical name in `20_Canonical_Naming_Register.md`, not treated as competing with the Founder-given official name. |
| **Founder Decision Required** | **NO — already resolved by direct Founder instruction in this task.** Recorded here only for completeness of the conflict-scanning record, not as an open item. |

---

## Comparison 3 — Fragrance/colour identity

| Field | Value |
|---|---|
| **Source A** | SOP Step 5/6 — "Colour" and "Fragrance" present in formulation |
| **Source B** | n/a — no second source describes colour/fragrance identity at all |
| **Conflict** | None — this is an absence, not a conflict. Neither source names what the colour or fragrance actually is (unlike all three prior products). |
| **Active Source** | n/a |
| **Reason** | Recorded as a data gap in `18_Founder_Input_Register.md`, not a conflict. |
| **Founder Decision Required** | Not for conflict-resolution purposes, but yes for filling the gap. |

## Comparison 4 — Competitor-name check

See `21_Competitor_Reference_Register.md` — zero found, clean result.

---

## Summary

**Total comparisons performed:** 4
**Genuine, unresolved conflicts:** 1 (CONFLICT-001, pricing)
**Resolved by direct Founder instruction:** 1 (CONFLICT-002, naming)
**Data gaps (not conflicts):** 1 (colour/fragrance identity)
**Clean results:** 1 (competitor scan)

**This is the first product family where a real conflict traces directly to a specific,
pre-existing codebase comment** (`conflict-service.ts`), rather than being newly discovered by
this session's own source audit alone.
