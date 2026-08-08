# MUV Hand Wash™ — Source Register

> Full audit record. Nine candidate sources checked directly (Product Chart, Production SOP,
> Knowledge Library, both AI Sutra copies, `prisma/seed.ts`, `lib/inst-sales/consumption-rules.ts`,
> `lib/knowledge-factory/conflict-service.ts`, competitor-brand scan, repo-wide grep for
> variant/product names). Source Authority Order applied: 1. Current Product Chart, 2. Founder
> Instructions, 3. Production SOP, 4. Knowledge Library, 5. Seed Data, 6. Historical Documents —
> with the note (per established precedent, e.g. Black Phenyl's pack-size decision) that a
> **direct, current Founder Instruction for this specific package controls over the general
> ranking** when the two conflict, while the underlying source conflict is still documented, never
> silently resolved.

---

## §1 — Product Chart — FOUND

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`

Rows 24–31 (8 rows):

| # | Product (exact chart text) | Quantity | MRP (Rs) |
|---|---|---|---|
| 24 | MUV Lifeshield Hand Wash | 250ml | 70 |
| 25 | MUV Lifeshield Hand Wash | 500ml | 85 |
| 26 | MUV Silk Blossom Hand Wash | 500ml | 90 |
| 27 | MUV Ocean Fresh Hand Wash | 500ml | 95 |
| 28 | MUV Ocean Fresh Hand Wash | 5L | 700 |
| 29 | MUV Citrus Blast Hand Wash | 250ml | 70 |
| 30 | MUV Citrus Blast Hand Wash | 500ml | 85 |
| 31 | MUV Citrus Blast Hand Wash | 5L | 650 |

**These figures are historical citations only — never restated as live commercial data anywhere
else in this package (`FR-001`).**

**Conflict vs. the Founder-verified Variant Availability Matrix (documented, not resolved):**
- **Naming:** Chart spells the fourth variant "Lifeshield" (one word). Founder's official spelling
  is "Life Shield" (two words). Legacy spelling preserved as historical reference only.
- **Silk Blossom 5L is absent from the Chart entirely** — the Chart shows only a Silk Blossom
  500ml row (₹90), no 5L row — even though the Founder confirms Silk Blossom 5L is real.
- **Citrus Blast 5L appears in the Chart (₹650) but the Founder's matrix states Citrus Blast is
  NOT available in 5L.** This is a direct, row-for-row conflict: the Chart's 8 Hand Wash rows are
  not the same set of 8 SKUs as the Founder's matrix.
- Per the established precedent (Black Phenyl's Chart-vs-SOP pack-size conflict, resolved in
  favor of the direct Founder Instruction while the Chart figure stayed on record as an open
  item), **this package builds Knowledge Objects for the Founder's 8 verified combinations only**
  — Silk Blossom 5L is built despite the Chart's silence; Citrus Blast 5L is NOT built despite the
  Chart's row. The discrepancy itself remains open in `14_FOUNDER_GAPS.md`.

No other Product Chart rows (1–23, 32–37) mention Hand Wash or any of the four variant names.

---

## §2 — Production SOP — FOUND

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/PERSONAL CARE/MUV_GLOW_Hand_Wash_Professional_SOP_With_Product_Photos.docx`

Only SOP under `SOPs/PERSONAL CARE/`; only Hand Wash SOP anywhere in the repo. Extracted directly
from `word/document.xml` (docx-as-zip method, matching this session's established practice).

**Naming conflict (documented, not resolved):** the SOP's own title is **"MUV GLOW HAND WASH —
STANDARD OPERATING PROCEDURE (SOP) — Production Team Copy,"** not "MUV Hand Wash™." Verified as
the correct source for this Product Family regardless — its §4 Fragrance/Colour Guide lists
exactly the Founder's four variant names (`Ocean Fresh`, `Silk Blossom`, `Lifeshield`,
`Citrus Blast`), confirming content match despite the title mismatch. `conflict-service.ts`'s own
header comment already names "GLOW pricing and naming conflicts" as a known category, independently
corroborating this before this audit began. Official name used throughout this package: **MUV
Hand Wash™**, per direct Founder Instruction; "GLOW" preserved as legacy/internal SOP title only.

**§1 — Product Variants (pack size / net weight / MRP table, exact extracted text):**

| Pack Size | Net Weight | MRP |
|---|---|---|
| 250 ml | 260 g | ₹79 |
| 500 ml | 510 g | ₹99 |
| 5 L | 5030 g | ₹725 |

Followed by "Reference Product Photos" — 8 embedded JPGs (`word/media/image1.jpg`–`image8.jpg`),
no captions or alt-text in the XML, nothing textual extractable from them.

**Conflict (documented, not resolved):** this table is generic/undifferentiated by variant — one
flat price per pack size, implying (incorrectly, per the Founder's matrix) that all three pack
sizes exist for every variant. It also numerically conflicts with the Chart's per-variant pricing
(e.g. SOP's flat 5L=₹725 vs. Chart's Ocean Fresh 5L=₹700 and Citrus Blast 5L=₹650; SOP's flat
250ml=₹79 vs. Chart's Lifeshield/Citrus Blast 250ml=₹70). Since neither figure is ever stored as
commercial data in this package, this conflict is recorded here only, as a historical note.

**§2 — 10 L Batch Formula (exact table, Parent-level, shared across all variants):**

| Raw Material | Quantity |
|---|---|
| DM Water | 7.2 L |
| SLES | 2.5 kg |
| CAPB | 300 g |
| CDEA | 200 g |
| Glycerin | 150 g |
| Pearl Paste | 100 g |
| Preservative | 10 g |
| Colour | 1.5 g |
| Fragrance | 45 ml |
| Salt | Up to 150 g (for final viscosity) |

**§3 — Production Process (13 steps, exact text, Parent-level, shared):**

1. Tank Preparation — "Ensure tank, stirrer and utensils are clean and dry."
2. Water Charging — "Add 7.2 L DM water. Start slow agitation."
3. SLES Addition — "Add SLES slowly from the side of the tank. Avoid fast mixing to minimize
   foam. Mix until completely clear."
4. CAPB Addition — "Add CAPB slowly. Mix 8–10 minutes."
5. CDEA Addition — "Add CDEA slowly. Continue mixing until completely uniform."
6. Glycerin Addition — "Add glycerin and mix 5 minutes."
7. Preservative — "Add preservative and mix thoroughly."
8. Pearl Paste — "Add pearl paste slowly. Mix until pearl effect becomes uniform throughout the
   batch."
9. Colour — "Add colour separately. Mix until shade is uniform. **Do NOT premix with fragrance.**"
   **— variant-specific override point (colour).**
10. Fragrance — "Add fragrance separately. Mix gently for 10–15 minutes. **Do NOT premix with
    colour.**" **— variant-specific override point (fragrance).**
11. Viscosity Adjustment — "Prepare salt solution separately. Add gradually in small portions
    until required thickness is achieved."
12. Quality Check — "Appearance: smooth & pearl finish. pH: 5.5–6.5. Viscosity: stable. No lumps
    or separation."
13. Filling — "Fill only after foam settles. Tighten pumps/caps, clean bottles and apply labels."

**Two variant-specific process steps exist here (colour AND fragrance)** — a real, sourced
structural difference from Body Wash, where colour was explicitly shared/generic and fragrance
was the sole override point. See `02_Product_Architecture.md` KO-HW-INHERIT-001.

**§4 — Fragrance / Colour Guide (exact text):**

| Variant (SOP spelling) | Colour |
|---|---|
| Ocean Fresh | Blue |
| Silk Blossom | Purple |
| Lifeshield | Pink |
| Citrus Blast | Yellow |

**Safety / Contraindications / First-Aid content: NOT FOUND — confirmed absent.** Targeted search
of the extracted `word/document.xml` (and confirmation that the docx package contains no
`header*.xml`/`footer*.xml`/footnote/endnote parts — only `document.xml`, `styles`, `theme`,
`settings`, and 8 media images) for `Safety|Contraindicat|First Aid|Hazard|Precaution|Shelf
Life|Storage|Allergen|Warning|Caution|Toxic|Irritant|MSDS|Antibacterial` returned **zero matches**.
The SOP has exactly four sections (Product Variants, Batch Formula, Production Process,
Fragrance/Colour Guide) and nothing else — no packaging spec beyond the pack-size table, no
storage conditions, no shelf life, no safety/contraindications/first-aid section whatsoever. This
reconfirms the same "zero safety section" pattern found for Body Wash, and is precisely the
category of gap `FR-005` was created to force field-by-field documentation of, rather than leave
as one general note.

**Metadata** (`docProps/core.xml`): `creator: python-docx`, `created/modified:
2013-12-23T23:15:00Z` (a placeholder generation timestamp, not a real authoring date).

---

## §3 — Knowledge Library — FOUND (governance rule confirmed; no Hand Wash-specific content)

**File:** `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge
Library™.txt` (the exact path named in CLAUDE.md, `.claude/docs/MUV_Knowledge/MUV KNOWLEDGE
LIBRARY MASTER.txt`, does not exist under that exact name/casing in this checkout — this is the
real, equivalent file, matching the same discrepancy already noted for prior packages).

- No mention of "Hand Wash"/"handwash" anywhere in this file.
- **The unsupported-claims governance rule applies directly**, line 12614: *"No unsupported
  'safe,' 'non-toxic,' 'chemical-free,' 'dermatologically tested,' or equivalent claim should be
  used."* Under a "Product Safety" subsection (line 12601) listing what safety governance may
  require: qualified formulation review, hazard/exposure assessment, compatibility, stability,
  microbiological or category-specific controls, directions/warnings, packaging suitability,
  complaint/adverse-event process.
- Related "no unsupported claims" language recurs at lines 1906, 3647, 4994, 16045, 16927 as a
  general brand/governance discipline.
- Generic (non-Hand-Wash-specific) category mentions: line 1782 ("...hand wash, body wash, and
  related categories"), line 4300 ("...body wash, hand wash, shampoo, face wash, lotion, serums,
  sunscreen..." with a Founder Note at line 4302 that claims must be answered "with evidence, not
  confidence alone"), line 5553 ("...exact addition order and process steps for dishwash liquid,
  hand wash, floor cleaner..." — "product-specific order must come from an approved SOP").
- No mention of "antibacterial," "skin-safe," or "dermatologically tested" tied specifically to
  Hand Wash — the rule above is generic to all products and applies by direct extension, per
  `FR-005`.

---

## §4 — AI Sutra — NOT FOUND (no Hand Wash / Personal Care content)

**Files:** `.claude/docs/MUV_Knowledge/Muv_AI_Sutra_Master_MASTER1.md` and
`.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV AI SUTRAs/Muv_AI_Sutra_Master_Phase1.md` (same
content, duplicated location). Grepped both for `Hand Wash|hand wash|Personal Care|antibacterial|
dermatolog|skin-safe|chemical-free` — zero matches in either file.

---

## §5 — Seed Data — FOUND (no direct entry; two naming-adjacency conflicts)

**File:** `prisma/seed.ts`

- **No "hand wash"/"handwash" product entry exists.** Grep for `hand.?wash` (case-insensitive) —
  no matches.
- **"MUV Silk Hair Wash"** (`slug: "muv-silk-hair-wash"`, category `personal-care`) — a shampoo,
  not a hand wash: `shortDescription: "A gentle daily shampoo with argan oil and keratin."`,
  `directions: "Apply to wet hair, lather, rinse. Follow with conditioner."`,
  `safety: "Avoid contact with eyes."`, one variant `{ size: "250ml", price: 379, mrp: 449, sku:
  "MUV-PC-SLK-250" }`. **Flagged as a naming-adjacency conflict** (its name is superficially close
  to "Silk Blossom Hand Wash" and it occupies the sole "personal-care" catalogue slot in seed
  data), analogous to the "MUV Cleanse" conflict found for Body Wash. It is a different product
  entirely (hair shampoo) and is never used as a source here — in particular its `safety` field
  ("Avoid contact with eyes") is not assumed to transfer to Hand Wash.
- **"MUV Shield"** (`slug: "muv-shield"`, car-care category, "gloss-lock formula" car shampoo) —
  **flagged as a second naming-adjacency conflict** with "Life **Shield**." Different category
  (automotive, not personal care) and never used as a source or borrowed for positioning language.
- `prisma/seed.ts`'s own header (lines 11–18) explicitly warns that its institutional-pricing
  placeholder logic elsewhere is deliberately not wired to real MUV bulk-chemical SKUs, "matching
  by name would silently produce nonsense" — the same caution applies to these two naming-adjacent
  records.

---

## §6 — `lib/inst-sales/consumption-rules.ts` — FOUND

File header (lines 1–19) frames every constant as "a tunable estimate, not a measured fact," and
warns MUV's seeded catalog is not SKU'd to institutional bulk chemicals. `HAND_WASH` exists as a
generic, category-level (not variant-aware) consumption category:

```ts
HAND_WASH: "Hand Wash",              // CATEGORY_LABEL
HAND_WASH: "Ltr",                    // CATEGORY_UNIT
HAND_WASH: 160,                      // ESTIMATED_UNIT_PRICE_INR — placeholder, ₹160/Ltr
HAND_WASH: (s) => {
  const touchpoints = (s.washrooms ?? 0) + (s.kitchens ?? 0);
  if (touchpoints === 0 && !s.beds) return null;
  const qty = touchpoints * 1 + (s.beds ?? 0) * 0.06;
  return { qty, confidence: touchpoints ? "MEDIUM" : "LOW",
    basis: `${s.washrooms ?? 0} washrooms + ${s.kitchens ?? 0} kitchens as dispenser touchpoints,
    plus occupancy allowance` };
},
```

No reference to any of the four variants anywhere in this file — purely a category-wide
institutional estimate. `RULES_VERSION = "1.0.0"`.

---

## §7 — `lib/knowledge-factory/conflict-service.ts` — FOUND, header only

Header comment (lines 8–19) already names "Bathroom Cleaner/Floor Cleaner/Black Phenyl/White
Phenyl/**GLOW** pricing and naming conflicts" as known, previously-flagged categories — directly
corroborating §2's finding (the SOP's "MUV GLOW HAND WASH" title/generic pricing table) before
this audit began. No Hand Wash-, Life Shield-, or antibacterial-specific string appears in this
file; it is a generic Prisma-backed conflict CRUD service (`createConflict`, `resolveConflict`,
`acceptAsKnownLimitation`, `listConflicts`, `hasOpenConflicts`) with no hardcoded product-specific
records — conflicts live in the `KnowledgeConflict` DB table.

---

## §8 — Competitor Brand Scan — NOT FOUND (zero hits)

Word-boundary scan for `Lifebuoy|Dettol|Savlon|Godrej Protekt|Santoor|Dove|Pears|Palmolive|Fiama`
against the Product Chart (full text), the Hand Wash SOP, the Knowledge Library, and the AI
Sutra — **zero hits in every source, for every brand.** Matches the same zero-hit result
independently found for Body Wash's own personal-care-adjacent competitor scan.

---

## §9 — Other Repo-Wide Mentions

- `docs/knowledge-factory/PRODUCT_REGISTRY.md` row 11 (this Product Family's own tracking row —
  confirms the exact matrix and `KO-HW-` prefix).
- `docs/knowledge-factory/FOUNDER_RULES.md` FR-005 (lines ~174–219) — explicitly names "Life
  Shield" as an example of a variant name that must not be assumed antibacterial without a real
  source. **This audit found no such source anywhere** — Life Shield's only documented
  differentiator from the other three variants is fragrance and Pink colour.
- `components/os-sales/visits/SurveyForm.tsx` line 95 — a generic CRM survey field
  (`currentHandWash`) asking a prospect what hand wash they currently use. Not product content.
- `PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md` line 185 — an illustrative brand-voice copy example
  mentioning "a ₹86 hand wash." Does not match any Chart or SOP price and is not treated as a
  source (illustrative copy, not product data).

---

## Summary

**9 candidate sources checked. 4 found real content** (Product Chart, SOP, Knowledge Library
governance rule, seed-data naming-adjacency conflicts). **5 confirmed absent or irrelevant** (AI
Sutra, competitor brands, `conflict-service.ts` product-specific entries, consumption-rules
variant awareness beyond the generic category, and any deeper positioning statement for Life
Shield). Two real, unresolved conflicts carried forward into `14_FOUNDER_GAPS.md`: the Chart-vs-
Founder availability matrix mismatch, and the SOP's generic vs. Chart's per-variant pricing. Zero
safety content of any kind confirmed absent, consistent with (and the direct trigger for) `FR-005`.
