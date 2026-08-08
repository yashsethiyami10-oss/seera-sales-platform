# MUV Pure Bleach™ — Source Register

> Complete source audit, performed before any Knowledge Object was authored, per
> `01_Requirements.md`'s Source-First rule. Read-only throughout — the Production SOP was
> extracted to a session scratchpad only; no repository file was modified.

---

## Sources located and used

### 1. Product Chart (authoritative — pack size / commercial reference only)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Row found (row 23 of 37):** `MUV Bleach | 500ml | 60`
- **Exactly one pack size** — no other size exists for Bleach anywhere in the chart, consistent
  with this task's own "Available Pack Size: 500ml" instruction.
- **Product name as printed: "MUV Bleach"** — no "Pure," no ™.
- The MRP figure (₹60) is commercial data. Per `FR-001`/`FR-002`, it is recorded here **only** as
  a historical source-audit citation and is never treated as a live, AI-facing fact — see
  `10_LIVE_DATA_MAPPING.md`.

### 2. Production SOP (authoritative — formulation/manufacturing/process/QC/safety)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/FABRIC CARE/MUV_Bleach_SOP_10L_Batch_500ml.docx`
- **Filing location is itself informative:** this SOP is filed under **FABRIC CARE**, not HOME
  CARE (where five of the six prior products' SOPs live) — the only other FABRIC CARE item is the
  Liquid Detergent SOP. This is the first real, source-grounded category signal any package this
  session has had (all six prior products' "Home Care" categorization was an inference from folder
  convention, not a stated fact) — treated as MEDIUM-HIGH confidence for category purposes, see
  `02_Product_Architecture.md`.
- Extracted read-only via the same method used for all six prior packages: copied to a `.zip` in
  the session scratchpad, expanded there, `word/document.xml` + `word/_rels/document.xml.rels` +
  `docProps/core.xml` read directly, scratchpad copies deleted afterward. No repository file
  modified.
- **Title:** "MUV Bleach SOP (10 L Batch)" — confirms the SOP itself also calls this product "MUV
  Bleach," not "Pure Bleach."
- Contains: an Objective statement, a Packaging line, a Standard Formula table (5 raw materials),
  an 8-step numbered Manufacturing Procedure, a Quality Control section (5 criteria), a Filling &
  Packaging section, and — **unlike five of the six prior products' SOPs** — a real Storage &
  Safety section (Section 7) with genuine, quotable safety content. See `08_Safety.md` for the
  full verbatim text and analysis.
- **No embedded photos exist in this SOP** — confirmed by inspecting the docx package directly:
  no `word/media/` folder and no image relationship type in `word/_rels/document.xml.rels`.
- `docProps/core.xml` metadata (`creator: python-docx`, `2013-12-23T23:15:00Z` timestamps) is the
  same library-default boilerplate seen in every prior SOP — not a real authorship date.

### 3. Knowledge Library

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- Case-insensitive grep for "Bleach": **zero matches.** Unlike five of the six prior products,
  Bleach isn't even mentioned in the "Mixing Discipline" passage's product-category list.

### 4. AI Sutra files

- `Muv_AI_Sutra_Master_MASTER1.md` — zero matches for "Bleach."
- `Muv_AI_Sutra_Master_Phase1.md` — zero matches for "Bleach."

### 5. Seed data / Schema

- `prisma/seed.ts`, `prisma/schema.prisma`, and the full `prisma/` folder — zero matches for
  "Bleach." No product/category/pricing record exists.

### 6. `lib/inst-sales/consumption-rules.ts`

- Zero matches for "Bleach." Unlike Floor Cleaner and Glass Cleaner, **no `BLEACH`
  `ConsumptionCategory` exists at all** — not even as a placeholder institutional estimate. This
  is a real gap for institutional-sales tooling, out of scope for this Knowledge Package to fill.

### 7. `lib/knowledge-factory/conflict-service.ts`

- Zero matches for "Bleach." The header comment's list of products with known pricing/naming
  conflicts (Bathroom Cleaner, Floor Cleaner, Black Phenyl, White Phenyl, GLOW, Liquid Detergent)
  does **not** include Bleach — consistent with the Product Chart showing a single, unambiguous
  row with no competing figure anywhere else.

### 8. Competitor brand scan

Word-boundary scan (`\bBrand\b`, avoiding the "Rin" substring-noise problem found in a prior
audit) against the Product Chart row, the full SOP text, and the Knowledge Library, for: Comfort,
Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel, Tide,
Dettol, and — added for this product category specifically — Clorox. **Zero genuine hits.** One
false positive: "comfort" (lowercase, common English word) inside an unrelated Knowledge Library
sentence about evidence-scoring discipline — not a brand reference. **"Robin"/"Robin Blue"** (a
real, well-known Indian bleach/whitening-agent brand) was specifically checked — zero hits. Full
record in `07_Objection_Handling.md`'s comparison-question guidance and the validation checks in
`12_Validation/`.

### 9. General repository scan

Case-insensitive scan for "Pure Bleach" and "Bleach" across `ts/tsx/json/md/txt`: 9 files matched.
Of these, 7 are prior products' own safety/FAQ sections mentioning "bleach" only as a generic
acid-mixing hazard example already correctly marked "not sourced, cannot assert" in those
packages (`toilet-cleaner/05_Safety.md`, `08_FAQs.md`, `09_Golden_Questions.md`/
`golden_questions.json`; `liquid-detergent/05_Safety.md`; `fresh-bathroom-cleaner/
09_Safety_and_Risk.md`; a chemical-mixing torture-test prompt in `__tests__/muv-ai/torture.test.ts`)
— none of these are Bleach-product source content. The remaining 2 are this session's own prior
meta/governance references (`floor-cleaner/knowledge_manifest.json`'s `stopRule` field and
`floor-cleaner/25_Validation_Report.md`'s closing Stop Rule paragraph), both of which name "MUV
Pure Bleach™" — **the only two places in the entire repository "Pure Bleach" (with the ™ and
"Pure") appears**, and both are forward-looking task references, not sourced product facts.

`docs/knowledge-factory/products/` contained exactly 6 subfolders prior to this package
(`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`,
`crystal-glass-cleaner`, `floor-cleaner`) — no `pure-bleach`/`bleach` folder existed until this
task began.

---

## Naming finding (flagged up front — resolved by direct, current Founder Instruction)

**No source anywhere uses "Pure."** Both the Product Chart and the SOP call this product plainly
**"MUV Bleach."** The official name for this package, **"MUV Pure Bleach™,"** comes directly from
this task's own Founder Instruction — the same resolution pattern already established for
Bathroom Cleaner's "Fresh" and Glass Cleaner's "Crystal." "MUV Bleach" is preserved as the
legacy/source name in `02_Product_Architecture.md` and `09_Founder_Rules.md`; it is never used as
the primary customer-facing name.

## Safety finding (flagged up front — the most substantial safety source of any product this session)

Section 7 of the SOP contains real, quotable safety content — storage temperature/light guidance,
an explicit mixing restriction ("Do not mix with acids or ammonia-based cleaners"), and
manufacturing PPE requirements. This is more safety content than five of the six prior products'
SOPs had. However, it is **manufacturing-focused, not consumer-use-focused** — there is no
sourced first-aid guidance, no shelf-life duration, no numeric available-chlorine QC
specification, and no consumer dilution/usage instruction anywhere. See `08_Safety.md` for the
full verbatim text and the explicit "Founder Decision Required" gap list — per this task's strict
instruction, none of these gaps are filled with general chemistry knowledge.

## Manufacturing-only SOP finding

This SOP documents how MUV Bleach is *made*, not how a customer should *use* it. There is no
sourced dilution ratio, contact time, application method, or surface-compatibility guidance
anywhere in this repository. This is the single largest knowledge gap in this package and is
flagged prominently throughout `03_Product_Intelligence.md`, `05_Customer_Conversation.md`, and
`13_Reports/Missing_Knowledge_Report.md`.
