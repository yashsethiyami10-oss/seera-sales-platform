# MUV Floor Cleaner™ — Source Register

> This is the sixth Product Family built by the MUV AI Knowledge Factory™, following MUV Liquid
> Detergent™, MUV Floral Toilet Cleaner™, MUV Spark Dishwash Gel™, MUV Fresh Bathroom Cleaner™,
> and MUV Crystal Glass Cleaner™ (all frozen and approved). **This is the first Product Family
> with multiple fragrance variants under one parent, and the first requiring a Variant
> Inheritance architecture** (see `17_Variant_Inheritance_Map.md`).

---

## Sources Located and Used

### 1. Product Chart (authoritative — pricing/pack size)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Four matching rows found** (rows 14–17 of 37):

| No. | Product | Quantity | MRP (Rs) |
|---|---|---|---|
| 14 | MUV Velvet Mist Floor Cleaner | 1L | 150 |
| 15 | MUV Cloud Walk Floor Cleaner | 1L | 150 |
| 16 | MUV Velvet Mist Floor Cleaner | 5L | 550 |
| 17 | MUV Cloud Walk Floor Cleaner | 5L | 600 |

**Historical source citation only (recorded during source audit) — NOT a live commercial value.**
Per FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never
from this table. See `LIVE_DATA_MAPPING.md`.

- **"Velvet Mist" and "Cloud Walk" both appear literally, each with two priced rows (1L, 5L).**
- **"Rose Water" does NOT appear anywhere in the chart.** Only two of the three variants named
  in this task's instruction are priced/listed in this authoritative source.
- 1L pricing agrees across both variants (₹150); 5L pricing diverges by variant (₹550 vs ₹600) —
  a real, exact figure difference, not a transcription artifact. (Historical source citation only
  — see above; not a live value.)

### 2. Production SOP (authoritative — formulation/manufacturing/process)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Floor_Cleaner_Production_SOP_With_Product_Photos.docx`
- **Exactly one SOP file exists** — a single shared document covering Cloud Walk and Velvet
  Mist together, not separate per-variant SOPs. Extracted read-only (zip copy in session
  scratchpad, expanded there, `word/document.xml` + `word/_rels/document.xml.rels` +
  `docProps/core.xml`/`app.xml` read directly) — no repository file modified.
- Contains: title block ("MUV FLOOR CLEANER," Batch Size 10 Litres), a Product Reference section
  with 4 embedded photos ("Cloud Walk - 1L," "Velvet Mist - 1L," "Cloud Walk - 5L," "Velvet Mist
  - 5L" — no Rose Water photo), a single shared Raw Materials table, an 8-step Manufacturing SOP
  (with exactly ONE variant-specific line — Step 5, the colour addition), and a Packing Standard
  table.
- **Contains no dedicated Safety section, no dedicated Quality Control section, and no equipment
  list beyond "tank"/"stirrer" mentioned inline** — the only QC reference anywhere is the terse
  Step 8 ("QC check and fill into bottles"). This is a sparser SOP than several prior products'
  (e.g. it lacks even the single safety sentence Bathroom Cleaner's SOP had).
- **The SOP's own stated 5L MRP (₹549) matches neither variant's Product Chart 5L MRP** (Velvet
  Mist ₹550, Cloud Walk ₹600) — a genuine three-way pricing discrepancy, not a two-source
  conflict like prior packages. See `20_Source_Conflict_Register.md`. *(Historical source
  citation only, recorded during source audit — NOT a live commercial value. Per FR-001/FR-002,
  current pricing must always be resolved from the Product Catalog API, never from this figure.
  See `LIVE_DATA_MAPPING.md`.)*
- `docProps/core.xml`/`app.xml` metadata (`creator: python-docx`, placeholder 2013 timestamp,
  zero word/character counts) is library-default boilerplate, not real authorship data.

### 3. Knowledge Library

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- **One matching passage** (§"Mixing Discipline," same passage cited in the Glass Cleaner
  package): Floor Cleaner is named only as one item in a list of product categories illustrating
  a general governance point about needing approved SOPs. **No Floor-Cleaner-specific
  formula/ingredient/numeric fact.** Zero mentions of "Velvet Mist," "Cloud Walk," or "Rose
  Water" anywhere in the Knowledge Library.

### 4. AI Sutra files

- `Muv_AI_Sutra_Master_MASTER1.md` — zero matches for any of the four terms.
- `Muv_AI_Sutra_Master_Phase1.md` — zero matches for any of the four terms.

### 5. Seed data / Schema

- `prisma/seed.ts` and `prisma/schema.prisma` — zero matches for "Floor Cleaner," "Velvet Mist,"
  "Cloud Walk," or "Rose Water." No product/category/pricing record exists in seed data.

### 6. `lib/inst-sales/consumption-rules.ts`

- `FLOOR_CLEANER` is a fully wired `ConsumptionCategory` with a placeholder institutional
  estimate of **₹110/Ltr** (`ESTIMATED_UNIT_PRICE_INR.FLOOR_CLEANER`, explicitly labeled a
  placeholder in the file's own header, never a real MRP) and a consumption formula
  (`cleaningAreaSqft × 0.004 Ltr/sqft × frequency factor`). This bucket is **not variant-aware**
  — it makes no distinction between Velvet Mist, Cloud Walk, or Rose Water.

### 7. `lib/knowledge-factory/conflict-service.ts`

- The file's own header comment **explicitly names Floor Cleaner** as one of a known set of
  products with pre-existing pricing/naming conflicts already found by hand this session
  (alongside Bathroom Cleaner, Black Phenyl, White Phenyl, GLOW) — quoted in full:

  > "Bathroom Cleaner/Floor Cleaner/Black Phenyl/White Phenyl/GLOW pricing and naming conflicts,
  > plus the Liquid Detergent Cool Water pricing conflict found when the new SOP was verified"

- This directly corroborates the real chart-vs-SOP MRP mismatch found in Source 2 above — this
  package's own audit independently reproduces the specific numbers that comment only referenced
  by name, the same pattern established for Bathroom Cleaner's conflict.

### 8. General repository scan

- Case-insensitive scan for "Floor Cleaner," "Velvet Mist," "Cloud Walk," "Rose Water" across
  ts/tsx/json/md/txt returned 12 files. All are either already covered above (§§1–7), generic
  UX/design-copy usages of the phrase "floor cleaner" as a category example with zero product
  fact content (`PHASE_2_CUSTOMER_EXPERIENCE.md`, `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`,
  `PHASE_4B_INFORMATION_ARCHITECTURE.md`, `PHASE_5_DESIGN_SYSTEM.md`,
  `PHASE_6B_HOMEPAGE_VISUAL_SPECIFICATION.md`, `archive/PHASE_4_SUPERSEDED.md`), or one stray
  false positive (`_docx_extract.txt` at repo root — a leftover extraction of the **Black
  Phenyl** SOP from a prior session, matching only on the generic phrase "floor cleaner" inside
  Black Phenyl's own description; not touched, per read-only constraints, but flagged here as an
  existing stray file worth the Founder's awareness).
- **"Rose Water" specifically: zero matches anywhere in the entire repository** — no chart row,
  no SOP mention, no knowledge library mention, no seed/schema mention.
- `docs/knowledge-factory/products/` contained exactly 5 subfolders prior to this task
  (`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`,
  `crystal-glass-cleaner`) — no `floor-cleaner` folder existed.

---

## Critical Structural Finding — Rose Water is Founder-named but wholly unsourced

**This is the single most important finding in this audit and must never be silently smoothed
over.** This task's instruction names three "Official Variants": Velvet Mist, Cloud Walk, and
Rose Water. Two of these (Velvet Mist, Cloud Walk) are fully corroborated by both the Product
Chart and the Production SOP. **Rose Water has zero corroborating source material anywhere in
this repository** — no pricing, no formulation, no colour, no fragrance detail, nothing.

Per the Source Authority order, a direct Founder Instruction (authority #2) outranks the
Production SOP (authority #3) — so this package treats Rose Water's **existence and name** as
real and confirmed (the Founder has directly instructed it into the family). But authority order
governs *which source wins when they conflict* — it does not manufacture facts a Founder
Instruction didn't actually state. The Founder Instruction confirms the variant's name and its
membership in the family; it does not supply a formula, colour, fragrance, or price. **Every
attribute of Rose Water beyond its name is marked REQUIRES FOUNDER INPUT throughout this
package** — see `02_Product_Family_and_Variants.md`, `17_Variant_Inheritance_Map.md`, and
`19_Founder_Input_Register.md`'s top priority item.

## Pricing Conflict Finding (flagged up front — a genuine three-way mismatch)

Unlike prior packages' two-source conflicts, this one has three numbers in play per variant:
- **Velvet Mist 5L:** Chart ₹550 vs. SOP ₹549 (small ₹1 gap)
- **Cloud Walk 5L:** Chart ₹600 vs. SOP ₹549 (large ₹51 gap)
- **1L (both variants):** Chart ₹150 = SOP ₹150 — clean, no conflict

See `20_Source_Conflict_Register.md` for the full record.

**Historical source citation only (recorded during source audit) — NOT a live commercial value.**
Per FR-001/FR-002 (see `FOUNDER_RULES.md`), current pricing for every SKU/variant must always be
resolved live from the Product Catalog API, never from these audit figures. See
`LIVE_DATA_MAPPING.md` for the authoritative live-resolution path. These figures remain recorded
here only as evidence of what the Product Chart and Production SOP stated during source research,
and of the discrepancy between them.

## Manufacturing Documentation Gap Finding

This SOP has **no dedicated Safety section, no dedicated Quality Control section, and only two
generically-named equipment items** — the sparsest manufacturing documentation of any of the six
product families audited this session, worse even than Glass Cleaner's SOP (which at least had a
five-bullet QC list). See `08_Quality_Control.md` and `09_Safety_and_Risk.md`.
