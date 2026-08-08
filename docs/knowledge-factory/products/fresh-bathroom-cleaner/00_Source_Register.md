# MUV Fresh Bathroom Cleaner™ — Source Register

> Records every location searched before any Knowledge Object was written.

> **FR-001/FR-002 notice (2026-07-31):** every ₹ figure in this file is a **historical source
> citation only** — a record of what a source document said during research — **never a live
> commercial value**. Per FR-001/FR-002, current pricing must always be resolved from the Product
> Catalog API, never from any figure recorded in this register. See `LIVE_DATA_MAPPING.md`.

---

## Sources Searched

| # | Location | Result |
|---|---|---|
| 1 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf` | **FOUND** — row 12: "MUV Bathroom Cleaner", 500ml, ₹70 (historical source citation only — NOT a live commercial value; see notice above). **No second row for any other pack size.** |
| 2 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Bathroom_Cleaner_Production_SOP_With_Photo.docx` | **FOUND** — the shortest, sparsest SOP of the four products audited so far: 6 raw materials, 8 process steps, qualitative-only QC, one pack size (500ml), one embedded photo. **No safety section, no numeric QC limit, no shelf life, no 5L data, no pricing beyond ₹65 (historical source citation only — NOT a live commercial value; see notice above).** |
| 3 | `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt` | Generic mentions only (lines 1782, 5553) — no product-specific data |
| 4 | AI Sutra files | **NOT FOUND** — zero matches |
| 5 | `prisma/seed.ts` / `prisma/schema.prisma` | **NOT FOUND** — no Product/ProductVariant record; no `ProductCategory` enum even exists in the schema (category is a relation, not an enum) |
| 6 | `lib/knowledge-factory/conflict-service.ts` | **FOUND — highly significant.** Its own header comment (written earlier this session, before any product-family package existed) explicitly names *"Bathroom Cleaner...pricing and naming conflict[s]...found by hand"* as a known, pre-existing issue. This audit independently reproduced the exact pricing side of that conflict (see row below) — see `19_Source_Conflict_Register.md`. |
| 7 | `lib/inst-sales/consumption-rules.ts` | **NOT FOUND** — no `BATHROOM_CLEANER` category exists in this file's `ConsumptionCategory` union at all (unlike Toilet Cleaner's ₹130/Ltr and Dishwash's ₹150/Ltr placeholders — historical source citations only, NOT live commercial values; see notice above) |
| 8 | `docs/knowledge-factory/products/fresh-bathroom-cleaner/` (pre-existing work check) | **NOT FOUND** — clean start |
| 9 | Competitor brand-name scan (full watch-list) | **ZERO GENUINE MATCHES** — three raw regex hits were confirmed false positives (substring matches inside "Comfortable" and "Rinse") — see `21_Competitor_Reference_Register.md` |
| 10 | Naming cross-check: does either source use "Fresh"? | **NO** — Product Chart says "MUV Bathroom Cleaner"; SOP title says "MUV BATHROOM CLEANER" — neither includes "Fresh." See `20_Canonical_Naming_Register.md`. |

## Source Authority Applied (per instruction order)

1. **Current Product Chart** — used for product name (as charted, prior to the Founder's
   "Fresh" naming directive), pack size (500ml only), current MRP (₹70 — historical source
   citation only, NOT a live commercial value; see notice above)
2. **Founder Instructions** — the current implementation prompt itself directly supplies the
   official canonical name, "MUV Fresh Bathroom Cleaner™" — a real, direct Founder Instruction,
   used per authority order #2, above the SOP and Knowledge Library
3. **Final Production SOP** — used for formula, batch, manufacturing, process, colour,
   fragrance, and QC. Also the source of a real, embedded safety instruction ("Never add water
   into acid") — see `09_Safety_and_Risk.md`
4. **Knowledge Library** — checked; no product-specific facts
5. **Seed Data** — checked; confirmed absence
6. **Historical Documents** — none found beyond the above

## Result Summary — the sparsest, and the most consequential, source picture of the four products

This product has by far the least source material of the four audited this session (a 6-material,
8-step SOP with no safety section, no numeric QC, and only one pack size) — but also surfaces the
**first pricing conflict this session can trace directly to a pre-existing, independently-authored
codebase comment** (`conflict-service.ts`'s own header, written before any product-family package
existed). This is treated as a priority item, not a routine one — see `19_Source_Conflict_Register.md`.
