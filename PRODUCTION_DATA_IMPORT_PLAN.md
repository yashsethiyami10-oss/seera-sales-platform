# MUV Production Data — Phase 1: Real Data Inventory & Import Plan

**Investigation only. Nothing was inserted, modified, or generated.** No sample/demo data was
created. Every source cited below was read directly; nothing in this report is inferred without
evidence being shown.

## Executive summary

Real MUV product/brand content exists in this repository in substantial depth — but almost
entirely as **narrative and manufacturing content, not as ready-to-insert catalog rows**. There is
exactly **one** structured, price-bearing source (a PDF chart, 37 SKUs) and it is missing several
fields the database requires. **Zero usable product photography exists anywhere in the repository
or in code.** The only "product catalog" data currently wired into `prisma/seed.ts` is explicitly
self-documented fictional/demo content — a different, fabricated product line-up (fragrance-branded
names) that does not match the real MUV catalog at all. These two facts must not be conflated.

---

## 1. Real data found, by category

### Products — REAL names/formulas exist; REAL prices exist for most; nothing is import-ready as-is

| Source | What it contains | Real or fabricated |
|---|---|---|
| `prisma/seed.ts` (lines 57–120) | 6 products: MUV Noir, MUV Bloom, MUV Renew, MUV Cleanse, MUV Silk Hair Wash, MUV Shield — fragrance/personal-care branded, with prices, SKUs, ingredients | **Fabricated.** The file's own header comment states: "This seed mirrors the mock data that lived in the original `.jsx` files" — i.e. UI-development placeholder content, not MUV's real catalog. |
| `docs/knowledge-factory/products/` — 12 folders: `black-phenyl`, `body-wash`, `car-wash`, `crystal-glass-cleaner`, `dishwash-gel`, `floor-cleaner`, `fresh-bathroom-cleaner`, `hand-wash`, `liquid-detergent`, `pure-bleach`, `toilet-cleaner`, `white-phenyl` | Real product names, real ingredients (cross-referenced against real manufacturing SOPs), real safety text, real FAQs/objection-handling, real customer-conversation content — one `MASTER_*.md` per product plus 13+ structured sub-files each | **Real.** This is the actual MUV catalog — home/fabric/car/body/personal care cleaning products, not the fictional line-up in seed.ts. |
| `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/SOPs/` | Real manufacturing SOPs (Black Phenyl, White Phenyl, Bleach, Liquid Detergent, Floor Cleaner, Dishwash Gel, Bathroom Cleaner, Glass Cleaner, Toilet Cleaner, Car Wash, Body Wash, Hand Wash) — exact formulas, batch quantities | **Real, proprietary.** Source of the ingredients text above. |

**Zero overlap** between seed.ts's 6 fictional products and the 12 real product families —
confirmed directly by `docs/knowledge-factory/products/black-phenyl/10_LIVE_DATA_MAPPING.md`:
*"MUV Black Phenyl™ does not yet exist in the live storefront catalog — confirmed via
`prisma/seed.ts` and `prisma/schema.prisma` (zero matches for 'Phenyl')."* This same explicit
"does not yet exist in the live catalog" confirmation is repeated, verbatim-pattern, in the
`10_LIVE_DATA_MAPPING.md` files for `car-wash`, `pure-bleach`, `white-phenyl`, `body-wash`, and
`hand-wash` (6 of the 12 products have this file; the other 6 —
`crystal-glass-cleaner`/`dishwash-gel`/`floor-cleaner`/`fresh-bathroom-cleaner`/
`liquid-detergent`/`toilet-cleaner` — don't have one yet, meaning even less commercial-readiness
review has been done for those).

### Categories — REAL taxonomy, currently paired with fake products

`prisma/seed.ts` (lines 41–48) defines 6 categories: Home Care, Fabric Care, Body Care, Personal
Care, Car Care, Skin Care (marked `comingSoon`). These category **names** are not fabricated —
they correctly correspond to the real product families found above (Home Care ↔
phenyl/bleach/toilet/dishwash/bathroom/glass/floor cleaners; Fabric Care ↔ liquid detergent; Body
Care ↔ body wash; Personal Care ↔ hand wash; Car Care ↔ car wash). The taxonomy structure is
reusable; it is currently just populated with the wrong (fictional) products.

### Variants / Prices — ONE real structured source found, incomplete for direct import

**`.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/PRODUCT CHART/MUV_Product_Chart_with_USP (1)(1).pdf`**
— read directly. A 37-row table: `No. | Product | Quantity | MRP (Rs)`. Full contents:

| # | Product | Size | MRP (₹) |
|---|---|---|---|
| 1–2 | MUV Indian Rose Liquid Detergent | 1L / 5L | 155 / 699 |
| 3–4 | MUV Cool Water Liquid Detergent | 1L / 5L | 165 / 725 |
| 5–6 | MUV Lavender Garden Liquid Detergent | 1L / 5L | 155 / 699 |
| 7–8 | MUV Toilet Cleaner | 500ml / 5L | 80 / 400 |
| 9–11 | MUV Dishwash Gel | 500ml / 1L / 5L | 85 / 155 / 699 |
| 12 | MUV Bathroom Cleaner | 500ml | 70 |
| 13 | MUV Glass Cleaner | 500ml | 90 |
| 14, 16 | MUV Velvet Mist Floor Cleaner | 1L / 5L | 150 / 550 |
| 15, 17 | MUV Cloud Walk Floor Cleaner | 1L / 5L | 150 / 600 |
| 18–19 | MUV Car Wash | 500ml / 5L | 70 / 550 |
| 20–21 | MUV Phenyl | 1L / 5L | 65 / 275 |
| 22 | MUV Black Phenyl | 500ml | 80 |
| 23 | MUV Bleach | 500ml | 60 |
| 24–25 | MUV Lifeshield Hand Wash | 250ml / 500ml | 70 / 85 |
| 26 | MUV Silk Blossom Hand Wash | 500ml | 90 |
| 27–28 | MUV Ocean Fresh Hand Wash | 500ml / 5L | 95 / 700 |
| 29–31 | MUV Citrus Blast Hand Wash | 250ml / 500ml / 5L | 70 / 85 / 650 |
| 32–33 | MUV Crimson Veil Body Wash | 250ml / 950ml | 149 / 480 |
| 34–35 | MUV Velvet Oak Body Wash | 250ml / 950ml | 135 / 420 |
| 36–37 | MUV Midnight Frost Body Wash | 250ml / 950ml | 135 / 420 |

**This is real, but it is only MRP — not a complete `ProductVariant` row.** What it does not
contain, confirmed by direct inspection:
- **Selling price** (`ProductVariant.price` is a separate required field from `mrp` in the schema — the chart gives only one number per row, labeled MRP; whether MUV sells at MRP or at a discount is not stated anywhere in this source).
- **SKU codes** (none exist in the chart or anywhere else found).
- **Stock quantities** (`Inventory.quantity` — not a data-mining problem, this requires real current stock figures from the business).
- **Category assignment** (inferable from product type, per the Categories section above, but not explicit in the chart itself).

**One already-documented discrepancy, not newly discovered here**: `black-phenyl/10_LIVE_DATA_MAPPING.md`
explicitly flags that the chart's Black Phenyl row (500ml, ₹80) conflicts with a separate Founder
Instruction that the *1L* pack size is what should actually be catalogued — and states no source
anywhere prices the 1L pack. This is exactly the kind of per-row conflict a full import must
resolve product-by-product, not something safe to bulk-import mechanically.

### Images — no usable source found anywhere

Searched the entire repository (code, docs, `public/`) for any real product photography: **none
exists.** The Knowledge Factory says so explicitly for at least one product family
(`black-phenyl/10_LIVE_DATA_MAPPING.md`: *"no embedded photo exists in the source SOP at all — no
image asset exists in any source yet"*) and nothing found elsewhere contradicts this for the other
11. Searching all code/docs for real Cloudinary URLs found **exactly one**:
`res.cloudinary.com/ixut3fgq/image/upload/v1784636887/Products/jalcrzgmsuxw2uwdk8aq.jpg` — a
single real uploaded photo, referenced in `app/(storefront)/page.tsx`'s `HERO_CUTOUTS` map as a
background-removed hero cutout. That same file's own comment states: *"Most of what's uploaded
through the admin media library today is full marketing collages... rather than an isolated
product shot."* This means the live Cloudinary media library (cloud name `ixut3fgq`) may hold more
assets than what's referenced in code — but this cannot be enumerated from a static code/repo
inspection; it would require live Cloudinary access, which is outside this read-only codebase
investigation.

### Homepage banners — seed.ts content is generic placeholder, not sourced from real brand copy

`prisma/seed.ts` (lines 148–155) defines one HERO banner: title "Keep Muving", subtitle "An
affordable luxury from India". This reads as plausible marketing copy, but it does not match, word
for word, any brand-voice/tagline text found in the real brand sources below — it appears to be
UI-development placeholder copy, same category as the fictional products.

### Homepage sections — structural registry, not content; safe regardless of demo/real status

`prisma/seed.ts` (lines 157–174) defines the 8-key section-visibility registry (`hero`, `marquee`,
`categories`, `bestsellers`, `brandstory`, `reviews`, `business`, `newsletter`). This is
configuration (which sections render), not factual/commercial content — there is nothing to
fabricate here, and it doesn't depend on which products/categories end up populated.

### Brand content — real, extensive, not yet mapped to any CMS field

Found in two real sources:
- `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE LIBRARY/# final MUV Knowledge Library™.txt` — the project's constitutional brand/philosophy document (per `CLAUDE.md`).
- `docs/marketing-knowledge-factory/domains/01-brand-intelligence/` — real chapters on brand origin & naming, logo & mark system, and specifically `chapter-03-language-pronunciation-and-tagline` (real tagline/brand-voice content).

This is genuine, deep, real brand material — but it is long-form narrative content built for the
AI Knowledge Factory's own retrieval purposes, not pre-formatted into the specific short-copy
fields a homepage banner or brand-story component expects. Using it requires an editorial
extraction pass, not a mechanical field-mapping.

---

## 4. Can this data be safely imported as-is?

| Data category | Safe to import mechanically? | Why |
|---|---|---|
| Categories (taxonomy/slugs) | **Yes** | Names are real, structural only, no fabricated facts |
| Homepage sections (registry) | **Yes** | Pure visibility config, no factual content |
| Products — names/descriptions/ingredients/safety/benefits | **Yes, with review** | Real content, but was authored for AI-retrieval use — a human pass to trim into storefront-appropriate product-page copy is warranted, not a blind copy-paste |
| Variants/Prices (MRP, sizes) | **No — not as-is** | Real MRPs exist for 37 SKUs, but selling price, SKU codes, and stock are absent; at least one documented Founder-flagged discrepancy (Black Phenyl pack size) must be resolved first |
| Images | **No — nothing to import** | No usable product photography exists in any source found |
| Homepage banners | **No — not as-is** | Current seed copy is placeholder-grade; real banner copy needs authoring from real brand sources, not extraction |
| Brand content (About/Story sections) | **No — not as-is** | Real source material is abundant but requires editorial condensation into specific short-form fields |

**No part of this is safe to bulk-insert without a Founder decision point.** The products with the
most real, usable structured data are the 6 that already have a `10_LIVE_DATA_MAPPING.md`
(`black-phenyl`, `car-wash`, `pure-bleach`, `white-phenyl`, `body-wash`, `hand-wash`) — those files
already did most of the "what's real vs. what's missing" analysis this report would otherwise have
to redo per product.

---

## 5. Import plan (plan only — not executed, awaiting Founder approval)

**Phase A — Structural, no commercial judgment required.** Import the category taxonomy (6 real
category names/slugs from `seed.ts`) and the homepage-section visibility registry as-is. Zero risk
— no fabricated facts, nothing product-specific.

**Phase B — Products, one family at a time, Founder sign-off per family before insert.** For each
of the 12 real product families:
1. Pull name/description/ingredients/benefits/safety text from its `MASTER_*.md` (and the matching
   real SOP for exact ingredient wording).
2. Cross-reference size(s)/MRP from the Product Chart PDF.
3. **Explicitly flag to the Founder, per family, before any insert**: the selling price (chart
   gives MRP only — is MUV selling at MRP or a discount?), SKU code (needs to be assigned,
   following the existing `MUV-{CAT}-{PROD}-{SIZE}` convention already visible in seed.ts), real
   current stock quantity, and category assignment (propose the obvious mapping, get confirmation
   rather than assuming). Black Phenyl specifically needs its 500ml-vs-1L conflict resolved before
   any variant is created for it.
4. Only the 6 families with an existing `10_LIVE_DATA_MAPPING.md` are ready for this pass without
   additional research; the other 6 need that same analysis done first.

**Phase C — Images: not an import task.** No product photography exists to import. This needs to
be sourced (real product photoshoots or, at minimum, the existing Cloudinary media library
audited live for anything usable beyond the one hero cutout found) before any product can display
a real image — flagged as a blocker, not something this plan can schedule around.

**Phase D — Homepage banners and brand content: authoring, not import.** Real source material
exists (Knowledge Library, Marketing KF brand-intelligence domain) but needs a human/editorial
pass to become actual banner headline/subtitle copy and About/Brand-Story section text — not a
mechanical extraction this plan can safely automate.

**What this plan deliberately does not include**: replacing the current fictional `seed.ts`
products with real ones is a **decision**, not a technical step — until Phase B's per-family
sign-offs happen, the recommendation is to leave the current empty-catalog state as-is rather than
insert partially-real, partially-fabricated (guessed SKU/price/stock) rows into production.

---

## STOP — awaiting Founder approval

No data has been inserted. This report is the complete Phase 1 deliverable. Do not proceed to
Phase B/C/D for any specific product without explicit, per-family Founder confirmation of the
flagged missing fields.
