# MUV Crystal Glass Cleaner™ — Source Register

> This is the fifth Product Family built by the MUV AI Knowledge Factory™, following MUV Liquid
> Detergent™, MUV Toilet Cleaner™, MUV Dishwash Gel™, and MUV Fresh Bathroom Cleaner™ (all
> frozen and approved). This register documents every source searched, per the same exhaustive
> discipline established in all four prior packages, before any Knowledge Object was authored.

---

## Sources Located and Used

### 1. Product Chart (authoritative — pricing/pack size)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Row found:** `13 | MUV Glass Cleaner | 500ml | 90`
- **Only one pack size present** — no 5 Litre (or any other size) row for Glass Cleaner anywhere
  in the chart's 37 rows.
- **No USP/description text is actually present** for any product in the extracted content,
  despite the filename implying a USP column — this is a real gap in the source, not an
  extraction failure; noted in `03_Product_Description.md`.

### 2. Production SOP (authoritative — formulation/manufacturing/process/QC)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Glass_Cleaner_Production_SOP_With_Photo_Rev1.docx`
- Extracted read-only: copied to a `.zip` in the session scratchpad, expanded there only, read
  `word/document.xml` + `word/_rels/document.xml.rels` + `docProps/core.xml` directly. **No
  repository file was modified during extraction**, matching the established method from all
  four prior products.
- Contains: title block ("MUV GLASS CLEANER," Batch Size 10 Litres), Raw Materials table,
  9-step numbered Manufacturing Procedure, Quality Control bullet list, Packing Standard table,
  one embedded product photo (`word/media/image1.jpg`, original filename `1000782690.jpg`).
- **Contains no safety/handling/PPE section of any kind** — confirmed by reading the entire
  document body. This is a genuine difference from Bathroom Cleaner's SOP, which had one real,
  explicit safety instruction ("Never add water into acid"). Glass Cleaner's SOP has zero.
- `docProps/core.xml` metadata (`creator: python-docx`, timestamps `2013-12-23T23:15:00Z`) is a
  library-default placeholder, not a real authorship date — not used as a fact anywhere in this
  package.

### 3. Knowledge Library

- **File (correct path — differs from the generic path referenced in CLAUDE.md's own text, per
  the actual directory structure found on disk):**
  `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- **One matching passage** (§"Mixing Discipline"): Glass Cleaner is named only as one item in a
  list of product categories illustrating a general governance point — "product-specific order
  must come from an approved SOP," with an explicit warning against improvising mixing order for
  process-sensitive materials (acids, fragrance, etc.) outside the approved SOP. **No
  Glass-Cleaner-specific formula/ingredient/numeric fact appears here.** Cited in
  `05_Manufacturing_Theory.md` as governance context only, never as a formulation source.

### 4. AI Sutra files

- `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` — zero matches for "Glass," "Crystal," "mirror."
- `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV AI SUTRAs/Muv_AI_Sutra_Master_Phase1.md` — zero matches.

### 5. Seed data / Schema

- `prisma/seed.ts` — zero matches for "Glass" or "Crystal." No product/category/pricing record
  exists in seed data for this product, consistent with the seeded catalog being a different,
  D2C personal-care range.
- `prisma/schema.prisma` — one match, unrelated to product data: `currentGlassCleaner String?`
  on the `InstSurvey` model (an institutional-sales visit survey field asking what glass cleaner
  brand a prospect currently uses) — not a MUV product record.

### 6. `lib/inst-sales/consumption-rules.ts`

- Glass Cleaner is a fully wired `ConsumptionCategory` (`GLASS_CLEANER`), with a placeholder
  institutional estimate of **₹140/Ltr** (`ESTIMATED_UNIT_PRICE_INR.GLASS_CLEANER`) and a
  consumption formula (`(floors × 1.2 Ltr) + lobby glass frontage allowance`). Per this file's
  own header comment and the discipline established in all four prior packages, **this is an
  explicitly labeled placeholder business-rule estimate, never a real MRP fact** — the only real,
  chart-confirmed retail price recorded during this source audit was ₹90/500ml (Product Chart +
  SOP, both agree). **Historical source citation only (recorded during source audit) — NOT a live
  commercial value.** Per FR-001/FR-002, current pricing must always be resolved from the Product
  Catalog API, never from either figure above — see `LIVE_DATA_MAPPING.md`.

### 7. `lib/knowledge-factory/conflict-service.ts`

- Zero matches for "Glass" or "Crystal." The file's header comment lists a set of products with
  known pre-existing pricing/naming conflicts (Bathroom Cleaner, Floor Cleaner, Black Phenyl,
  White Phenyl, GLOW, plus Liquid Detergent's Cool Water conflict) — **Glass Cleaner is not
  among them.** No pre-existing conflict record to carry forward for this product.

### 8. General repository scan

- "Glass Cleaner" (case-insensitive): 4 real matches — `components/os-sales/visits/SurveyForm.tsx`
  (survey form field, not product content), `lib/inst-sales/consumption-rules.ts` (item 6),
  the Knowledge Library passage (item 3), and a compiled `.next` build artifact of the same
  survey form (not a separate source).
- "Crystal Glass" (case-insensitive): **zero matches anywhere in the repository** — not in
  `docs/`, `.claude/`, `lib/`, `components/`, `prisma/`, `app/`, or any root-level status doc
  (`WIRING.md`, `AUDIT.md`, `PROJECT_STATUS.md`, `SECURITY.md`, `DEPLOYMENT_READINESS.md`,
  `README.md`, `PRODUCTION_READY.md`, `DEPLOYMENT_GUIDE.md`, `PRE_LAUNCH_CHECKLIST.md`).
- `docs/knowledge-factory/products/` contained exactly 4 subfolders prior to this task
  (`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`) — no
  `glass-cleaner` folder existed; this package is being built from a genuine ground-zero audit.

---

## Naming Finding (flagged up front, resolved by direct Founder instruction — see
## `20_Canonical_Naming_Register.md`)

**Neither source uses the word "Crystal" anywhere.** Both the Product Chart and the SOP title
call this product plainly **"MUV Glass Cleaner."** The official name for this package,
"MUV Crystal Glass Cleaner™," comes directly from the Founder's instruction for this
implementation task — exactly the same situation as Bathroom Cleaner's "Fresh," and handled the
same way: the official name is used throughout, the source name is preserved only as a legacy
reference, and this is recorded as a resolved (not open) naming item.

## Pricing Finding (flagged up front — this time, NO conflict)

**Both sources agree exactly: ₹90 for the 500ml pack.** Unlike Bathroom Cleaner (which had a
genuine ₹70/₹65 conflict), Glass Cleaner's pricing is clean across both authoritative sources —
recorded as a clean comparison in `19_Source_Conflict_Register.md`, not a conflict.

**Historical source citation only (recorded during source audit) — NOT a live commercial value.**
Per FR-001/FR-002, current pricing must always be resolved from the Product Catalog API, never
from this figure — see `LIVE_DATA_MAPPING.md`. This finding is preserved here purely as an audit
record of what the source documents stated during research.

## Safety Finding (flagged up front)

The SOP contains **zero safety/handling/PPE instructions**, despite using materials with real
handling considerations (Acetic Acid, BKC, IPA). This is a genuine documentation gap, not
something to fill in from general knowledge — see `09_Safety_and_Risk.md` and
`18_Founder_Input_Register.md`.
