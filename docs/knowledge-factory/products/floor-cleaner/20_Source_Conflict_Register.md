# MUV Floor Cleaner™ — Source Conflict Register

> Format per the established convention: Source A, Source B, Conflict, Active Source, Reason,
> Founder Decision Required. **Unlike Bathroom Cleaner and Glass Cleaner, there is no naming
> conflict this time** — "Velvet Mist" and "Cloud Walk" both appear verbatim and identically in
> both the Product Chart and the SOP, so no Founder-instruction naming resolution was needed for
> those two. The real conflicts here are pricing (two separate variant-level conflicts) and the
> Rose Water sourcing gap.
>
> **Per FR-001/FR-002:** every ₹ figure in this register is a **historical source citation only
> (recorded during source audit) — NOT a live commercial value.** Current pricing for every
> SKU/variant must always be resolved from the Product Catalog API, never from these figures. See
> `LIVE_DATA_MAPPING.md`. This register's role is unchanged — it documents what the Product Chart
> and Production SOP said during research, and the discrepancy between them — it simply must never
> be read by the AI as a live, answerable price.

---

## CONFLICT-001 — Pricing, Velvet Mist 5L

| Field | Value |
|---|---|
| **Source A** | Product Chart (row 16) — ₹550 |
| **Source B** | Production SOP (Packing Standard table) — ₹549 |
| **Conflict** | Same SKU (Velvet Mist, 5L), a ₹1 discrepancy |
| **Active Source (default, pending Founder confirmation)** | Product Chart (₹550) — per the explicit Source Authority order, the Product Chart is authority #1 for "Current MRP" |
| **Reason** | Corroborates the pre-existing `lib/knowledge-factory/conflict-service.ts` header comment, which explicitly names "Floor Cleaner" among products with known pricing conflicts found by hand this session |
| **Founder Decision Required** | **YES.** BLOCKED pending Founder confirmation, not silently defaulted. |

---

## CONFLICT-002 — Pricing, Cloud Walk 5L

| Field | Value |
|---|---|
| **Source A** | Product Chart (row 17) — ₹600 |
| **Source B** | Production SOP (Packing Standard table) — ₹549 |
| **Conflict** | Same SKU (Cloud Walk, 5L), a ₹51 discrepancy — **the largest pricing gap found in any product or variant across all six product families audited this session** |
| **Active Source (default, pending Founder confirmation)** | Product Chart (₹600) — per the explicit Source Authority order |
| **Reason** | Same corroborating pre-existing conflict-service.ts comment as CONFLICT-001. Notably, the SOP states the same ₹549 figure for both variants' 5L pack — suggesting the SOP's Packing Standard table may not have been updated when per-variant chart pricing diverged, though this is a reasonable inference, not a confirmed explanation. |
| **Founder Decision Required** | **YES.** BLOCKED pending Founder confirmation. |

---

## Comparison 3 — Pricing, 1L (both variants) — CLEAN, no conflict

| Field | Value |
|---|---|
| **Source A** | Product Chart (rows 14–15) — ₹150 for both Velvet Mist and Cloud Walk |
| **Source B** | Production SOP (Packing Standard) — ₹150 |
| **Conflict** | None — all sources agree exactly for the 1L pack, for both variants |
| **Founder Decision Required** | No |

## Comparison 4 — Naming (Velvet Mist, Cloud Walk) — CLEAN, no conflict

| Field | Value |
|---|---|
| **Source A** | Product Chart — "MUV Velvet Mist Floor Cleaner" / "MUV Cloud Walk Floor Cleaner" |
| **Source B** | SOP photo captions — "Velvet Mist" / "Cloud Walk" | 
| **Conflict** | None — both names match the Founder-instructed official variant names exactly. Unlike Bathroom Cleaner's "Fresh" or Glass Cleaner's "Crystal," no naming resolution was needed here. |
| **Founder Decision Required** | No |

## Comparison 5 — Rose Water existence and formulation (genuine sourcing gap, not a two-source conflict)

| Field | Value |
|---|---|
| **Source A** | Direct Founder Instruction — names "MUV Rose Water Floor Cleaner™" as an Official Variant |
| **Source B** | n/a — no corroborating source of any kind (Product Chart, SOP, Knowledge Library, seed data all checked, all zero matches) |
| **Conflict** | Not a conflict between two disagreeing sources — a genuine absence of any second source. The Founder Instruction is treated as real for naming/family-membership purposes (per Source Authority #2), but does not supply formulation, colour, fragrance, or pricing facts. |
| **Active Source** | Founder Instruction, for name/membership only — no active source exists for any other attribute |
| **Reason** | See `17_Variant_Inheritance_Map.md` — this package does not assume Rose Water inherits the shared Velvet Mist/Cloud Walk base formula |
| **Founder Decision Required** | **YES — the single highest-priority Founder decision in this package.** Whether Rose Water uses the shared base formula, has its own formula, or remains a named-only placeholder pending real source material. |

## Comparison 6 — Competitor-name check

See `22_Competitor_Reference_Register.md` — zero found, clean result, Lizol/Domex/Dettol
explicitly checked.

---

## Summary

**Total comparisons performed:** 6
**Genuine, unresolved conflicts:** 2 (CONFLICT-001, CONFLICT-002 — both pricing, both
variant-specific)
**Resolved / no naming conflict needed:** 1 (Comparison 4 — unlike prior packages, no
Founder-instruction naming resolution was required this time)
**Data gaps (not conflicts):** 1 (Rose Water — the most significant gap of any comparison across
all six product families, since it concerns an entire variant's existence-in-substance, not just
one missing field)
**Clean results:** 2 (1L pricing; competitor scan)
