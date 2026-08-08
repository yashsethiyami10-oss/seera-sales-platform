# MUV Body Wash™ — Source Register

> Complete source audit, performed before any Knowledge Object was authored. Read-only
> throughout — the Production SOP was extracted to a session scratchpad; no repository file was
> modified.

---

## Sources located and used

### 1. Product Chart (authoritative — pack size / commercial reference only)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`
- **Six rows found (rows 32–37):**

| No. | Product | Quantity | MRP (Rs) |
|---|---|---|---|
| 32 | MUV Crimson Veil Body Wash | 250ml | 149 |
| 33 | MUV Crimson Veil Body Wash | 950ml | 480 |
| 34 | MUV Velvet Oak Body Wash | 250ml | 135 |
| 35 | MUV Velvet Oak Body Wash | 950ml | 420 |
| 36 | MUV Midnight Frost Body Wash | 250ml | 135 |
| 37 | MUV Midnight Frost Body Wash | 950ml | 420 |

- **All three named variants have their own dedicated rows; both 250ml and 950ml exist for every
  one — full symmetry, unlike Floor Cleaner's Rose Water (no rows at all).**
- Note the real price asymmetry: Crimson Veil is priced higher than Velvet Oak and Midnight
  Frost, which are identically priced to each other. Recorded as-is, not smoothed into a false
  "all variants same price" assumption. All MRP figures are commercial data — per `FR-001`/
  `FR-002`, recorded here only as historical source-audit citations, never live facts. See
  `10_LIVE_DATA_MAPPING.md`.

### 2. Production SOP (authoritative — formulation/manufacturing/process/QC)

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/BODY CARE/MUV_Body_Wash_SOP_10kg_1percent_Salicylic_Acid.docx`
- **Exactly one SOP file exists**, filed under **BODY CARE** — a single shared document covering
  all three variants together, the same architecture family as Floor Cleaner's shared SOP.
- Extracted read-only via the same zip-to-scratchpad method used for all nine prior packages; no
  repository file modified.
- **Title:** "MUV Body Wash SOP (10 kg Batch | 1% Salicylic Acid)," explicitly listing all three
  variants (Crimson Veil, Velvet Oak, Midnight Frost) and both pack sizes (250ml, 950ml) in its
  own title block.
- **No embedded photos exist** — confirmed via the docx package's relationship file (no
  `word/media/` folder, no image relationship entries).
- `docProps/core.xml` metadata is the same library-default `python-docx` boilerplate seen in
  every prior SOP.

**Full verbatim structure** (six numbered sections):

1. **Objective:** "To manufacture a consistent, safe and premium-quality MUV Body Wash
   containing 1% Salicylic Acid using SLES (28% active), HEC thickener and CAPB system."
2. **Formula (10 kg batch)** — see `06_Manufacturing_SOP_equivalent` in `03_Product_Intelligence.md`/
   `04...`; full raw materials table in this package's Architecture/Intelligence sections.
3. **Manufacturing Procedure** — 12 numbered steps; **Step 9 ("Add the required fragrance
   [Crimson Veil / Velvet Oak / Midnight Frost]") is the ONE variant-specific line in the entire
   process** — the same "single override point" structural pattern established for Floor
   Cleaner, but here the override is fragrance, not colour.
4. **Filling & Packaging** — 250ml and 950ml, batch number/mfg date/expiry date/MRP printed on
   label, leak test before packing.
5. **Quality Control** — Appearance (smooth and uniform), pH 4.5–5.0, Viscosity ("as approved
   specification" — no number given), Odour (matches selected fragrance), no phase separation or
   salicylic acid crystallization.
6. **Variant Matrix** (verbatim table):

| Variant | Fragrance | Pack Sizes |
|---|---|---|
| Crimson Veil | Premium Floral | 250 ml / 950 ml |
| Velvet Oak | Woody Premium | 250 ml / 950 ml |
| Midnight Frost | Fresh Cooling | 250 ml / 950 ml |

**Critical structural finding — Colour is SHARED, not variant-specific.** Unlike Floor Cleaner
(where colour was the one variant override), this SOP's Colour line item (2g, "Appearance") is a
single shared generic entry with **no per-variant colour breakdown anywhere** — the Variant
Matrix has no colour column. This package does not invent per-variant colours.

**No safety section exists anywhere in this SOP.** This is confirmed by reading the complete
document body — there is no seventh section, no safety-adjacent content folded into any of the
six sections above. See the Safety Finding below and `08_Safety.md`.

**No equipment is named anywhere** in this SOP (a real difference from several prior products,
which at least named "mixing vessel").

### 3. Knowledge Library

- **File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt`
- Case-insensitive grep for "Body Wash," "Crimson Veil," "Velvet Oak," "Midnight Frost": **zero
  matches for any of the three variant names.** Five generic, category-level passages use "body
  wash" only as an example within broader brand/governance discussion — none states a fact
  specific to Crimson Veil, Velvet Oak, or Midnight Frost.
- **One real, directly relevant governance passage found and used throughout this package**
  (quoted verbatim): *"No unsupported 'safe,' 'non-toxic,' 'chemical-free,' 'dermatologically
  tested,' or equivalent claim should be used."* This is a real, sourced rule forbidding exactly
  the class of claim this product category is most tempting to invent — cited directly in
  `07_Objection_Handling.md` and `03_Product_Intelligence.md`.
- **One generic complaint-scenario example found**: *"A customer reports that a body wash caused
  irritation."* — a training/illustration example in the Knowledge Library's own complaint-
  handling discussion, not a real incident report about this product. Used only to ground
  `05_Customer_Conversation.md`'s complaint-handling awareness, never presented as a real MUV
  Body Wash incident.

### 4. AI Sutra files

- `Muv_AI_Sutra_Master_MASTER1.md` — zero matches for the three variant names.
- `Muv_AI_Sutra_Master_Phase1.md` — zero matches for the three variant names.

### 5. Seed data / Schema — a real, newly-discovered conflict

- `prisma/schema.prisma` — zero matches for any of the four terms.
- `prisma/seed.ts` — **zero matches for "Crimson Veil," "Velvet Oak," or "Midnight Frost."**
  **One match for "body wash," but it is a different, non-matching placeholder product**, seeded
  under the name **"MUV Cleanse"** (`slug: "muv-cleanse"`), with:
  - Fragrance: "Citrus, Bergamot" — none of the three real, sourced fragrance families
  - Pack sizes: 250ml and **500ml** — not the real 250ml/**950ml**
  - Pricing: ₹299/₹499 — does not match any of the six real Chart figures
  - An `ingredients:` field ("Aqua, Sodium Laureth Sulfate, Salicylic Acid (1%), Glycerin,
    Perfume.") and marketing claims ("never strips the skin," "deep-cleanses pores without
    over-drying") — **none of which are sourced for Crimson Veil, Velvet Oak, or Midnight
    Frost.**
  - The only genuine overlap with the real SOP is the "1% Salicylic Acid" active ingredient —
    likely an earlier, unrelated D2C storefront placeholder seeded before the three real,
    chart/SOP-sourced variants existed.
  - **This package never uses "MUV Cleanse" as a source for any of the three real variants.**
    This is a genuinely new conflict this session has found by hand — not yet reflected in
    `lib/knowledge-factory/conflict-service.ts`'s own tracked-conflicts comment. Flagged as a
    priority item in `14_FOUNDER_GAPS.md`.

### 6. `lib/inst-sales/consumption-rules.ts`

- No `BODY_WASH`/`BODY_CARE` `ConsumptionCategory` exists — the full type union is
  `FLOOR_CLEANER | LAUNDRY_DETERGENT | GLASS_CLEANER | TOILET_CLEANER | HAND_WASH | DISHWASH`,
  confirmed via direct read. No institutional placeholder price exists for this product.

### 7. `lib/knowledge-factory/conflict-service.ts`

- Zero matches for "Body Wash" or any variant name. The header comment's known-conflicts list
  (Bathroom Cleaner, Floor Cleaner, Black Phenyl, White Phenyl, GLOW, plus Liquid Detergent's
  Cool Water conflict) does **not** include Body Wash. This package's own audit is what
  discovered the real "MUV Cleanse" seed-data conflict (§5) — not yet reflected in this file.

### 8. Competitor brand scan

Word-boundary scan against the six Chart rows, the full SOP text, and the Knowledge Library, for
both the standard 16-brand household-chemical list (Comfort, Pril, Vim, Exo, Genteel, Surf
Excel, Fairy, Harpic, Domex, Lizol, Colin, Robin, Rin, Ariel, Tide, Dettol) **and** a personal-
care-specific 13-brand list (Dove, Nivea, Fiama, Lux, Pears, Palmolive, Cinthol, Santoor, Park
Avenue, Wild Stone, Axe, Denver, Engage) — the first product this session needing the second
list. **Zero hits, in every source, for every brand in both lists.** No false positives
encountered.

### 9. General repository scan

Case-insensitive scan for "Body Wash," "Crimson Veil," "Velvet Oak," "Midnight Frost" across
`ts/tsx/json/md/txt`: 12 files matched. All are either this session's own tracking documents
(anticipating this exact package), generic category-classification code
(`lib/muv-ai/gateway.ts`'s routing regex), a generic test fixture prompt, or the same generic
Knowledge Library/design-philosophy passages already covered in §3. None contain independent
product-specific facts beyond what's already documented above.

`docs/knowledge-factory/products/` contained exactly 9 subfolders prior to this package
(`liquid-detergent`, `toilet-cleaner`, `dishwash-gel`, `fresh-bathroom-cleaner`,
`crystal-glass-cleaner`, `floor-cleaner`, `pure-bleach`, `black-phenyl`, `white-phenyl`) — no
`body-wash` folder existed until this task began.

---

## Product-identity finding — all three variants fully, symmetrically sourced

Unlike Floor Cleaner's Rose Water, every one of Crimson Veil, Velvet Oak, and Midnight Frost has
its own two Product Chart rows and an explicit fragrance-family label in the shared SOP's Variant
Matrix. This package treats all three as fully confirmed Product Family members, with the one
real caveat that fragrance-note/sensory/emotional detail beyond the two-word family label is not
sourced for any of them.

## Cosmetic/dermatological claim finding

No cosmetic or dermatological claim ("sensitive skin," "dermatologically tested," "pH balanced,"
"hypoallergenic," "moisturizing") exists in any source. A real, sourced Knowledge Library
governance rule explicitly forbids unsupported claims of exactly this kind. The SOP's pH 4.5–5.0
figure is a manufacturing/QC specification, never presented as a "pH balanced" marketing claim.

## Safety finding — most severe of any product this session

**Zero safety content of any kind exists in this SOP** — confirmed by reading the complete
document body. No PPE, no mixing restriction, no ventilation instruction, nothing. This exceeds
even Floor Cleaner's sparse safety documentation. See `08_Safety.md`.

## Seed-data conflict finding — "MUV Cleanse"

A genuinely new, real conflict discovered by this audit: `prisma/seed.ts`'s "MUV Cleanse" record
is a different, non-matching product that must never be used as a source for Crimson Veil,
Velvet Oak, or Midnight Frost. See `14_FOUNDER_GAPS.md` priority item.

## Manufacturing-only SOP finding

Like six of the nine prior products, this SOP documents only how the product is *made* — there
is no consumer-facing usage instruction (application method, lather/rinse steps, frequency)
beyond what's implicit in the product being a "body wash."
