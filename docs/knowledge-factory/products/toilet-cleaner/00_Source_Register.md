# MUV Toilet Cleaner™ — Source Register

> A first-class deliverable for this product family (new relative to the Liquid Detergent
> package's file list, added per explicit instruction). Records every location searched, what
> was found, and what was explicitly absent — before any knowledge content was authored.

> **Remediation label (FR-001/FR-002, applied 2026-07-31):** every ₹ figure recorded in this
> register (rows 1, 8; Source Authority item 1) is a **historical source citation only**
> (recorded during source audit) — **NOT a live commercial value.** Per FR-001/FR-002, current
> pricing must always be resolved from the Product Catalog API, never from any figure recorded in
> this register. See `LIVE_DATA_MAPPING.md`.

---

## Sources Searched

| # | Location | Result |
|---|---|---|
| 1 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf` | **FOUND** — rows 7–8: MUV Toilet Cleaner, 500ml MRP ₹80; 5L MRP ₹400 |
| 2 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Toilet_Cleaner_Final_Production_SOP.docx` | **FOUND** — full 10L batch formulation, process, safety section, finished-product weights |
| 3 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt` | Generic mention only (line 5553, "Mixing Discipline" section) — no product-specific data |
| 4 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV AI SUTRAs/Muv_AI_Sutra_Master_Phase1.md` | **NOT FOUND** — zero matches for "toilet" |
| 5 | `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` | **NOT FOUND** — zero matches for "toilet" |
| 6 | `prisma/seed.ts` / `prisma/schema.prisma` | **NOT FOUND** — no `Product`/`ProductVariant` record for Toilet Cleaner exists; confirmed the seeded catalogue is MUV Noir/Bloom/Renew/Cleanse/Silk Hair Wash/Shield only |
| 7 | `lib/knowledge-factory/conflict-service.ts` | **NOT FOUND** — no Toilet Cleaner conflict has ever been flagged (unlike Liquid Detergent's Cool Water conflict) |
| 8 | `lib/inst-sales/consumption-rules.ts` | **FOUND, BUT NOT USABLE AS PRICING** — a self-described placeholder institutional-consumption constant, `TOILET_CLEANER: 130` (₹/Ltr). The file's own header explicitly warns this must be treated as approximate/placeholder, not a real price lookup. Not used anywhere in this package as a real MRP. |
| 9 | `components/os-sales/visits/SurveyForm.tsx`, `prisma/schema.prisma` (`InstSurvey.currentToiletCleaner`) | **FOUND, BUT NOT MUV PRODUCT DATA** — a form field capturing which *competitor's* toilet cleaner an institutional prospect currently uses. Not a source of MUV product facts. |
| 10 | `docs/knowledge-factory/products/toilet-cleaner/` (pre-existing partial work check) | **NOT FOUND** — directory did not exist before this package was created |
| 11 | Repo-wide case-insensitive grep for "Toilet Cleaner" across all file types | Six file hits total — all accounted for in rows 3, 6 (n/a), 8, 9 above; no other source exists |

## Source Authority Applied (per instruction order)

1. **Current Product Chart** — used for product name, pack sizes (500ml, 5L), current MRP (₹80 / ₹400)
2. **Founder instructions** — none given yet for this product beyond the implementation prompt itself
3. **Final Production SOP** — used for formulation, batch quantities, process steps, colour, fragrance, and the one safety section this SOP actually contains
4. **Knowledge Library** — checked; contributed no product-specific facts, only the general "order must come from an approved SOP" governance principle, already honoured by using the SOP as authority #3
5. **Seed Data** — checked; confirmed absence, established the applicable storefront category (`home-care`)
6. **Historical Documents** — none found beyond the above

## Result Summary

Unlike Liquid Detergent, this product's two authoritative sources (Product Chart and Production
SOP) **agree exactly** on pricing for both SKUs — no conflict exists (see
`Source_Conflict_Register.md`, which records this as a clean pass, not an omission). The SOP for
this product also contains a real Safety section (HCL handling, PPE, ventilation) that the
Liquid Detergent SOP did not have — more safety knowledge is genuinely available here than for
the first product family, and is used accordingly in `05_Safety.md`.
