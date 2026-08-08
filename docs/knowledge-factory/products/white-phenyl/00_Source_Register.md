# MUV White Phenyl™ — Source Register

> Complete source audit, performed before any Knowledge Object was authored. Read-only
> throughout — the Production SOP was extracted to a session scratchpad; no repository file was
> modified.

---

## Sources located and used

### 1. Product Chart (authoritative — pack size / commercial reference only)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Rows found:** `20 | MUV Phenyl | 1L | 65` and `21 | MUV Phenyl | 5L | 275`
- The literal string "White Phenyl" **does not appear** anywhere in the chart's 37 rows — only
  the bare "MUV Phenyl" (this product) and the separate "MUV Black Phenyl" (row 22, a different
  product, already the subject of the frozen Black Phenyl package).
- The MRP figures (₹65/1L, ₹275/5L) are commercial data. Per `FR-001`/`FR-002`, they are recorded
  here **only** as historical source-audit citations, never as live, AI-facing facts. See
  `10_LIVE_DATA_MAPPING.md`.

### 2. Production SOP (authoritative — formulation/manufacturing/process/QC/safety)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/HOME CARE/MUV_White_Phenyl_SOP_10L_Batch.docx`
- Extracted read-only via the same method used for all eight prior packages: copied to a `.zip`
  in the session scratchpad, expanded there, `word/document.xml` + `word/_rels/document.xml.rels`
  + `docProps/core.xml`/`app.xml` read directly, scratchpad copies deleted afterward.
- **Title:** "MUV White Phenyl SOP (10 L Batch)" — matches the Founder-given official name
  exactly; the Chart's "MUV Phenyl" does not.
- **Pack sizes stated: 1 L Bottle and 5 L Can** (§2 "Product Variants"), repeated as "1 L HDPE
  Bottle" and "5 L HDPE Can" in §6 "Filling & Packaging" — **matches the Product Chart's two
  rows exactly, no conflict.**
- **No embedded photos exist** — confirmed by inspecting the docx package directly: no
  `word/media/` folder and no image relationship in `word/_rels/document.xml.rels`.
- `docProps/core.xml`/`app.xml` metadata is the same library-default `python-docx` boilerplate
  seen in every prior SOP.

### 3. Knowledge Library

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- Case-insensitive grep for "Phenyl" (independently cross-checked via two separate search
  methods): **zero matches.**

### 4. AI Sutra files

- `Muv_AI_Sutra_Master_MASTER1.md` — zero matches for "Phenyl."
- `Muv_AI_Sutra_Master_Phase1.md` — zero matches for "Phenyl."

### 5. Seed data / Schema

- `prisma/seed.ts`, `prisma/schema.prisma` — zero matches for "Phenyl." No product/category/
  pricing record exists.

### 6. `lib/inst-sales/consumption-rules.ts`

- Zero matches for "Phenyl" (checked for both `PHENYL` and `WHITE_PHENYL`, and for a possible
  generic "PHENYL" category that might cover both Black and White Phenyl). **No Phenyl-related
  consumption category exists at all** — confirmed to still hold, same finding as Black Phenyl.

### 7. `lib/knowledge-factory/conflict-service.ts`

- The header comment explicitly names **White Phenyl** (alongside Bathroom Cleaner, Floor
  Cleaner, Black Phenyl, GLOW) as a product with a known pricing/naming conflict — quoted in
  full:

  > "Bathroom Cleaner/Floor Cleaner/Black Phenyl/White Phenyl/GLOW pricing and naming conflicts,
  > plus the Liquid Detergent Cool Water pricing conflict found when the new SOP was verified"

  **This package's own audit resolves what that "conflict" actually is for White Phenyl:** it is
  the **naming** discrepancy (Chart's generic "MUV Phenyl" vs. the SOP's specific "MUV White
  Phenyl"), not a pricing or pack-size conflict — the pack sizes and (as far as can be checked)
  the pricing structure show no cross-source disagreement. This is a different conflict *type*
  than Black Phenyl's (which was a genuine pack-size conflict), even though both are named in the
  same code comment.

### 8. Competitor brand scan

Word-boundary scan against the Product Chart rows, the full SOP text, and the Knowledge Library,
for: Comfort, Pril, Vim, Exo, Genteel, Surf Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin,
Rin, Ariel, Tide, Dettol. **Zero genuine hits.** One false positive ("comfort" as a common noun
inside an unrelated Knowledge Library sentence), same as found for Black Phenyl.

### 9. General repository scan

Case-insensitive scan for "White Phenyl" across `ts/tsx/json/md/txt`: matches found only in
this session's own tracking documents (`REPOSITORY_INDEX.md`, `PRODUCT_REGISTRY.md`,
`FOUNDER_RULES.md`, `CHANGE_LOG.md` — all anticipating this exact package),
`conflict-service.ts`, and the Black Phenyl package's own files (which consistently hedge the
Black↔White Phenyl relationship as "believed"/"presumed," never asserted as confirmed — this
package's own fresh audit is what independently confirms it, not the Black Phenyl package
itself).

`docs/knowledge-factory/products/` contained exactly 8 subfolders prior to this package
(`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`,
`crystal-glass-cleaner`, `floor-cleaner`, `pure-bleach`, `black-phenyl`) — no `white-phenyl`
folder existed until this task began.

---

## Naming finding (flagged up front — resolved by direct, current Founder Instruction)

The Chart never uses "White" — only "MUV Phenyl." The SOP consistently uses "MUV White Phenyl."
This task's Founder Instruction, "MUV White Phenyl™," matches the SOP exactly and is treated as
the official name; "MUV Phenyl" is preserved as the Chart's legacy/shorthand name. See
`02_Product_Architecture.md` and `09_Founder_Rules.md`.

## Product-identity confirmation finding (independently verified, not merely inferred)

The Black Phenyl package's own files repeatedly *presumed* — but explicitly never confirmed — that
the Chart's "MUV Phenyl" rows corresponded to a separate "White Phenyl" SOP (see e.g. Black
Phenyl's `03_Product_Intelligence.md` KO-BP-INTEL-015, `14_FOUNDER_GAPS.md` gap #20). **This
package's own fresh audit independently confirms that identity**: the Chart's exact two pack
sizes (1L, 5L, no others) match the SOP's exact two pack sizes (1L, 5L, no others); no third
"Phenyl" chart row or SOP file exists; and the formulations are visibly distinct from Black
Phenyl (pine-oil-emulsion, milky white vs. black-phenyl-concentrate, black). This resolves Black
Phenyl's open gap #20 for THIS package's own purposes — it does not retroactively modify the
frozen Black Phenyl package, which correctly hedged the relationship as unconfirmed at the time
it was written.

## Pack-size finding — clean, unlike Black Phenyl

Both 1L and 5L are stated identically in the Chart and the SOP. No conflict exists for pack size
in this product, in contrast to Black Phenyl's genuine 500ml-vs-1L conflict.

## Manufacturing-only SOP finding

Like Pure Bleach and Black Phenyl, this SOP documents only how the product is *made* — there is
no consumer dilution ratio, usage instruction, or application method anywhere in this repository.
