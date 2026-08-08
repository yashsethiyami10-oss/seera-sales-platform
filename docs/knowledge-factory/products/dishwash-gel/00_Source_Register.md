# MUV Dishwash Gel™ — Source Register

> Records every location searched before any Knowledge Object was written, what was found, and
> what was explicitly absent. Same discipline as the Liquid Detergent and Toilet Cleaner
> packages' source registers.

---

## Sources Searched

| # | Location | Result |
|---|---|---|
| 1 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf` | **FOUND** — rows 9–11: MUV Dishwash Gel, 500ml ₹85 / 1L ₹155 / 5L ₹699. **Historical source citation only (recorded during source audit) — NOT a live commercial value. Per FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never from this figure.** |
| 2 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Dishwash_Liquid_Gel_Production_SOP.docx` | **FOUND** — full 10L batch formulation, 13-step process, real pH-based QC section, fill weights. **No safety section, no pricing.** |
| 3 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt` | Generic mention only (line 5553, "Mixing Discipline") — no product-specific data |
| 4 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV AI SUTRAs/Muv_AI_Sutra_Master_Phase1.md` | **NOT FOUND** — zero matches |
| 5 | `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` | Not separately re-checked this pass; zero matches confirmed for this product family in the prior two audits' identical scope |
| 6 | `prisma/seed.ts` / `prisma/schema.prisma` | **NOT FOUND** — no `Product`/`ProductVariant` record; `home-care` category exists and is the inferred (not confirmed) applicable category |
| 7 | `lib/knowledge-factory/conflict-service.ts` | **NOT FOUND** — no Dishwash Gel conflict has ever been flagged |
| 8 | `lib/inst-sales/consumption-rules.ts` | **FOUND, NOT USABLE AS PRICING** — placeholder institutional constant `DISHWASH: 150` (₹/Ltr), same "not a real lookup" disclaimer as `TOILET_CLEANER`'s ₹130/Ltr |
| 9 | `lib/inst-sales/consumption-engine.ts`, `lib/validations/inst-sales.ts`, `components/os-sales/visits/SurveyForm.tsx`, `actions/inst-visits.ts`, `prisma/schema.prisma` (`InstSurvey.currentDishwash`) | **FOUND, NOT MUV PRODUCT DATA** — competitor-product-in-use survey field, same pattern as `currentToiletCleaner` |
| 10 | `docs/knowledge-factory/products/dishwash-gel/` (pre-existing work check) | **NOT FOUND** — clean start |
| 11 | Repo-wide grep for "Dishwash"/"Dishwash Gel"/"Dishwash Liquid Gel" across all file types | All hits accounted for in rows 3, 6 (n/a), 8, 9 above |
| 12 | Competitor brand-name scan (Comfort, Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel, Tide, Dettol, plus any unidentified brand-sounding term) | **ZERO FOUND** — see `20_Competitor_Reference_Register.md` for the full recorded scan |

## Source Authority Applied (per instruction order)

1. **Current Product Chart** — used for product name (as charted: "MUV Dishwash Gel"), pack
   sizes (500ml, 1L, 5L), current MRP
2. **Founder instructions** — none given yet for this product beyond the implementation prompt
3. **Final Production SOP** — used for formula, batch, manufacturing, process, colour,
   fragrance, and QC process (this SOP's QC section is the most complete of the three product
   families audited so far — a real pH range, not just a target point)
4. **Knowledge Library** — checked; contributed no product-specific facts
5. **Seed Data** — checked; confirmed absence, established the inferred applicable category
6. **Historical Documents** — none found beyond the above

> **FR-001/FR-002 note (added 2026-07-31):** the pricing figures recorded in row 1 above and
> throughout this register are retained exactly as found, per the standing "never silently edit
> a source citation" discipline — but per FR-001 (Commercial/Knowledge Separation) and FR-002
> (Full Remediation Pass), they are historical audit citations only and must never be surfaced by
> the AI as a live, current price. Live pricing is always resolved from the Product Catalog API —
> see `LIVE_DATA_MAPPING.md`.

## Result Summary

Unlike Liquid Detergent (one pricing conflict) and Toilet Cleaner (clean pricing match, but no
QC checkpoint at all), Dishwash Gel presents a **third distinct pattern**: no pricing conflict
is even possible to detect because **the SOP carries no pricing data whatsoever** — only the
Product Chart prices this product. This is recorded in `18_Source_Conflict_Register.md` as a
data-gap, not a conflict. The QC section, by contrast, is the richest of the three products
(a real pH range with correction guidance in both directions). See
`19_Canonical_Naming_Register.md` for one genuine naming discrepancy: the Product Chart's "MUV
Dishwash Gel" vs. the SOP's own title "MUV DISHWASH LIQUID GEL."
