# Production Bug Investigation — "Full product description coming soon."

**Investigation complete. The technical root cause is simple and confirmed. The content
question underneath it is not — read §3 and the Implementation Plan before assuming this is a
one-command fix, because shipping the wrong thing here carries real risk (proprietary formula
disclosure, unapproved claims), not just an empty-copy inconvenience.**

## 1. Where the Knowledge Library actually lives

`docs/knowledge-factory/products/{family}/` — 12 real product families: `black-phenyl`,
`body-wash`, `car-wash`, `crystal-glass-cleaner`, `dishwash-gel`, `floor-cleaner`,
`fresh-bathroom-cleaner`, `hand-wash`, `liquid-detergent`, `pure-bleach`, `toilet-cleaner`,
`white-phenyl`. Confirmed real (not placeholder), confirmed already the source for the product
names/variants/categories imported in the prior session.

**The internal file structure is not uniform across families** — a real finding, not noise:
- `liquid-detergent/` (and several others): `01_Product_Identity.md`, `02_Product_Description.md`,
  `03_Manufacturing.md`, `04_Quality_Control.md`, `05_Safety.md`, `06_Sales_Intelligence.md`,
  `07_AI_Responses.md`, `08_FAQs.md`, `09_Golden_Questions.md`, `10_Product_Variants.md`,
  `LIVE_DATA_MAPPING.md`.
- `black-phenyl/`, `body-wash/` (and 4 others): `MASTER_*.md` index + `01_Requirements.md`,
  `02_Product_Architecture.md`, `03_Product_Intelligence.md`, `04_Decision_Trees.md`,
  `05_Customer_Conversation.md`, `06_FAQs.md`, `07_Objection_Handling.md`, `08_Safety.md`,
  `09_Founder_Rules.md`, `10_LIVE_DATA_MAPPING.md`, `14_FOUNDER_GAPS.md`, plus `11_JSON`/
  `12_Validation`/`13_Reports` subfolders.

Both structures were read directly for this investigation (`liquid-detergent` and `body-wash` as
representative samples of each convention) — not assumed identical.

## 2. How the website product page actually obtains each field — traced directly in code

`app/(storefront)/products/[slug]/page.tsx` reads every one of these fields **directly from the
`Product` row in Postgres, with zero code path to any Knowledge Factory file**:

| Field | Line | Prisma source |
|---|---|---|
| Short Description | 161 | `product.shortDescription` |
| Long Description | 184 | `product.fullDescription` (via `<ProductWhyChoose>`) |
| Benefits | 198 | `product.benefits` (via `<ProductBenefits>`) |
| Ingredients | 201 | `product.ingredients` (via `<ProductIngredients>`) |
| Directions | 204 | `product.directions` (via `<ProductHowToUse>`) |
| Safety | 206–210 | `product.safety` |
| SEO | 33 | `product.metaTitle` / `product.metaDescription`, falling back to name/shortDescription |

There is no per-product FAQ field or model at all — `SupportFaq` (schema.prisma) is a distinct,
unrelated Customer Support module, not a product-FAQ system. **No code anywhere in this
repository reads `docs/knowledge-factory/` at request time or at build time for the storefront.**
The only code that reads those files is `lib/runtime/knowledge-factory-loader.ts`, which powers
the AI runtime pipeline (a completely separate system, currently inactive behind feature flags) —
not the storefront pages.

## 3. Exact reason production isn't using them — two layers, not one

**Layer 1 (mechanical, fully confirmed)**: the bulk-import script built and run in the prior
session (`scripts/production-catalog-bulk-import.ts`) only populated commercial/structural fields
(name, slug, category, price, mrp, SKU, stock). It set `shortDescription` to a placeholder string
and left `fullDescription`/`benefits`/`ingredients`/`directions`/`safety`/`metaTitle`/
`metaDescription` at their Prisma defaults (null/unset) — no importer step ever read the Knowledge
Factory files at all. This part matches the bug report exactly: a real gap, not intentional
sabotage.

**Layer 2 (content-readiness, found only by actually opening the files — this is the part worth
stopping on)**: every Knowledge Factory file checked — `liquid-detergent/02_Product_Description.md`
and `body-wash/03_Product_Intelligence.md`, two different families, two different file-naming
conventions, same result — is **explicitly self-labeled `DRAFT — Pending Founder Review`**, and
each states in its own text, verbatim, what it does *not* yet contain:

> "**Not yet available (REQUIRES FOUNDER INPUT):** Approved, customer-facing marketing
> description / brand voice copy; Any performance, eco, or 'natural' claims..."
> — `liquid-detergent/02_Product_Description.md`

> "**REQUIRES FOUNDER INPUT.** No safety data sheet, hazard classification... or regulatory
> safety-claim language was found in any source document for MUV Liquid Detergent™
> specifically... this package does not assert specific safety claims... since doing so would be
> inventing a 'safety claim' in direct violation of the No Hallucination Rule."
> — `liquid-detergent/05_Safety.md`

`body-wash`'s own family-level status page states: `Knowledge Package Status: CONDITIONAL FREEZE`,
`Content Completeness 57/100 — see the Safety Risk Flag... before reading this number as
reassuring`. This is not this investigation's own caution talking — it's the Knowledge Factory's
own self-assessment, and it's consistent across every family sampled.

**One field is a distinct, separate risk, not just "incomplete"**: `liquid-detergent/03_Manufacturing.md`
does contain real, high-confidence, verbatim-from-SOP content — but it is the **proprietary
production batch formulation** (raw material list with exact quantities per 10L batch, using
internal abbreviations like SLES/CAPB/CDEA), not a consumer-facing ingredient list. The file
itself flags that even spelling out what "SLES" stands for "REQUIRES FOUNDER INPUT to confirm
officially before this is stated as fact in any customer- or regulator-facing material." Piping
this directly into the public `ingredients` field would risk disclosing the actual manufacturing
formula on a public product page — a materially different, higher-stakes problem than an empty
description.

**So: the honest answer to "why isn't this reaching production" is not only "no importer was
built" — it's that the specific content type the empty fields need (Founder-approved,
customer-facing description/benefits/safety copy) does not yet exist anywhere in this repository,
including in the Knowledge Library itself.** The Knowledge Library contains the real research
*behind* that copy (real variant/fragrance/size facts, real production data, real gap-analysis) —
it is not, by its own repeated self-description, the finished copy yet.

## 4. Implementation plan

**What can be built and run safely right now** — real, structural facts already verified accurate
and already partially duplicated in the DB, safe to make canonical:
- Nothing net-new here beyond what's already imported (product name, category, variant sizes) —
  cross-checked and none of the sampled families have additional *approved* customer-facing prose
  ready to move.

**What requires one explicit Founder decision before any importer touches production** — not a
technical blocker, a content-authorization one: for each field (short description, long
description, benefits, ingredients, directions, safety, SEO), per product family, one of:
- (a) *"Use this exact KO/paragraph verbatim"* — cites a specific real block of text found during
  this investigation that's accurate and safe to publish as-is (e.g., the FAQ-format
  fragrance/size facts, which are real and duplicate-safe).
- (b) *"Write real customer-facing copy from the sourced facts"* — an explicit authorization to
  compose new marketing-voice text grounded in the real research (ingredients, benefits, safety
  posture) — this is content authoring, not data import, and needs to be scoped as its own task,
  not silently done as a side effect of "running an importer."
- (c) *"Leave as pending"* for fields with a genuine, disclosed gap (e.g., Liquid Detergent's
  safety content, which the Knowledge Library itself says doesn't exist yet for any product).

**The importer infrastructure itself is the easy, ready part**: once (a) is confirmed for any
field/family, a script exactly like `scripts/production-catalog-bulk-import.ts` — same
upsert-by-slug pattern, same "update: {} never overwrites an existing Founder-approved value"
guarantee, same dry-run-first discipline — can read a named file/section and write it into the
named Product column in one run. This was not built this pass because there is nothing yet marked
"approved for publication" to point it at — building the pipe before there's water to run through
it would just move the same content-authorization question one step later, dressed as if it had
already been answered.

## What this plan deliberately does not do

Does not fabricate short descriptions (already true before this investigation). Does not import
`liquid-detergent/03_Manufacturing.md`'s raw batch formula as a public ingredient list. Does not
present any `DRAFT — Pending Founder Review` file content as if the review had happened. Does not
overwrite the Founder-approved pricing, SKUs, inventory, or variants imported in the prior
session — none of those fields are touched by anything described here.
