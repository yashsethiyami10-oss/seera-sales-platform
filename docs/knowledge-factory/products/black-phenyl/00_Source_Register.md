# MUV Black Phenyl™ — Source Register

> Complete source audit, performed before any Knowledge Object was authored. Read-only
> throughout — the Production SOP was independently re-extracted to a session scratchpad; no
> repository file was modified.

---

## Sources located and used

### 1. Product Chart (authoritative — pack size / commercial reference only)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Row found (row 22 of 37):** `MUV Black Phenyl | 500ml | 80`
- **Two adjacent rows (20–21) exist for a different, related product:** `MUV Phenyl | 1L | 65`
  and `MUV Phenyl | 5L | 275`. A sibling SOP file (`MUV_White_Phenyl_SOP_10L_Batch.docx`) strongly
  suggests the chart's generic "MUV Phenyl" entry corresponds to what the SOP calls "White
  Phenyl" — a **separate product from Black Phenyl**, out of scope for this package, noted here
  only to avoid confusing the two.
- The MRP figure (₹80, tied to the 500ml pack) is commercial data. Per `FR-001`/`FR-002`, it is
  recorded here **only** as a historical source-audit citation and is never treated as a live,
  AI-facing fact — see `10_LIVE_DATA_MAPPING.md`.

### 2. Production SOP (authoritative — formulation/manufacturing/process/QC/safety)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_Black_Phenyl_SOP_10L_Batch.docx`
- Extracted read-only via the same method used for all seven prior packages: copied to a `.zip`
  in the session scratchpad, expanded there, `word/document.xml` + `word/_rels/document.xml.rels`
  + `docProps/core.xml` read directly, scratchpad copies deleted afterward. No repository file
  modified.
- **Cross-check performed:** a stray file at the repository root, `_docx_extract.txt` (a leftover
  extraction from an earlier session, first flagged as unrelated during the Floor Cleaner audit),
  turned out to be a pre-existing extraction of this exact SOP. It was **not** trusted
  automatically — a fresh, independent extraction was performed and compared against it. **The
  two match exactly, word-for-word, with no discrepancies.** The content reported below comes
  from the fresh extraction.
- **Title:** "MUV Black Phenyl SOP (10 L Batch)" — matches the Founder-given official name
  exactly, no naming discrepancy.
- **Pack size stated: 1 L HDPE Bottle** — this directly conflicts with the Product Chart's 500ml
  figure. See the Conflict finding below.
- **No embedded photos exist** — confirmed by inspecting the docx package directly: no
  `word/media/` folder and no image relationship in `word/_rels/document.xml.rels`.
- `docProps/core.xml` metadata (`creator: python-docx`, `2013-12-23T23:15:00Z` timestamps) is the
  same library-default boilerplate seen in every prior SOP.

### 3. Knowledge Library

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- Case-insensitive grep for "Phenyl": **zero matches.**

### 4. AI Sutra files

- `Muv_AI_Sutra_Master_MASTER1.md` — zero matches for "Phenyl."
- `Muv_AI_Sutra_Master_Phase1.md` — zero matches for "Phenyl."

### 5. Seed data / Schema

- `prisma/seed.ts`, `prisma/schema.prisma` — zero matches for "Phenyl." No product/category/
  pricing record exists.

### 6. `lib/inst-sales/consumption-rules.ts`

- Zero matches for "Phenyl." No `PHENYL`/`BLACK_PHENYL` `ConsumptionCategory` exists — not even
  as a placeholder institutional estimate, the same gap found for Pure Bleach.

### 7. `lib/knowledge-factory/conflict-service.ts`

- The header comment explicitly names **Black Phenyl** (alongside Bathroom Cleaner, Floor
  Cleaner, White Phenyl, GLOW) as a product with a known pricing/naming conflict already found by
  hand earlier this session — quoted in full:

  > "Bathroom Cleaner/Floor Cleaner/Black Phenyl/White Phenyl/GLOW pricing and naming conflicts,
  > plus the Liquid Detergent Cool Water pricing conflict found when the new SOP was verified"

  This package's own audit independently reproduces the specific conflict (pack size 500ml vs
  1L) that comment only referenced by name — the same pattern established for Bathroom Cleaner's
  and Floor Cleaner's real, sourced conflicts.

### 8. Competitor brand scan

Word-boundary scan against the Product Chart row, the full SOP text, and the Knowledge Library,
for: Comfort, Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin,
Rin, Ariel, Tide, Dettol. **Zero hits, no false positives** — full record in `12_Validation/`.

### 9. General repository scan

Case-insensitive scan for "Black Phenyl" and "Phenyl" across `ts/tsx/json/md/txt`: matches found
only in this session's own prior-package Source Registers (each independently confirming Black
Phenyl's presence on the `conflict-service.ts` named-conflict list), this session's own newly
created tracking documents (`CHANGE_LOG.md`, `PRODUCT_REGISTRY.md`, `REPOSITORY_INDEX.md`, all
anticipating this exact package), the `conflict-service.ts` file itself, and the stray
`_docx_extract.txt` cross-checked in §2. No other scattered reference exists.

**Note on `PRODUCT_REGISTRY.md`'s pre-existing Black Phenyl row:** that row (created before this
audit, anticipating this package) already listed "1L" as the pack size — this reflects the
Founder's own task instruction, not an independent source, and does not resolve the Chart-vs-SOP
conflict on its own. It is not treated as a source here.

`docs/knowledge-factory/products/` contained exactly 7 subfolders prior to this package
(`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`,
`crystal-glass-cleaner`, `floor-cleaner`, `pure-bleach`) — no `black-phenyl` folder existed until
this task began.

---

## Naming finding — no discrepancy, unlike three of the seven prior products

Both the Product Chart ("MUV Black Phenyl") and the SOP title ("MUV Black Phenyl SOP") match the
Founder-given official name "MUV Black Phenyl™" exactly (aside from the ™ symbol, which no
source ever carries for any product). No naming resolution was required.

## Pack size / conflict finding (flagged up front — the confirmed, real conflict)

| Source | Pack Size | MRP |
|---|---|---|
| Product Chart (row 22) | 500ml | ₹80 |
| Production SOP | 1L | Not stated anywhere in the SOP |

Per this task's explicit "Available Pack Sizes: 1L" instruction (Source Authority #2, matching
the SOP), this package treats **1L as the confirmed pack size**. The Chart's 500ml/₹80 entry is
**not deleted or silently resolved** — it is fully documented as an open, unexplained
discrepancy (is it a different/older SKU, a chart error, or a genuinely separate 500ml variant
that simply has no SOP of its own?) in `14_FOUNDER_GAPS.md` and `02_Product_Architecture.md`.

## Safety finding

The SOP's Safety section (§7) is genuine, sourced content — three sentences covering PPE,
referencing "safety data sheets" for raw materials (without providing their content), and
ventilation. This is comparable in scope to Pure Bleach's safety section — real, but
manufacturing-focused, with no consumer-facing usage or first-aid content. See `08_Safety.md`.

## Manufacturing-only SOP finding

Like Pure Bleach, this SOP documents only how the product is *made* — there is no consumer
dilution ratio, usage instruction, application method, or surface guidance anywhere in this
repository, despite Black Phenyl being a product category (phenyl-based floor disinfectant)
where consumer dilution instructions are commercially typical. This is the single largest
knowledge gap in this package.
