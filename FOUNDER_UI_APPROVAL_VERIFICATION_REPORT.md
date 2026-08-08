# Founder Final UI Approval — Verification Report

## 1. Skin Care — "MUVING SOON™"

**Already implemented, verified working — no code change needed.** Read `app/(storefront)/page.tsx`
directly: the category grid already special-cases Skin Care (`c.slug === "skin-care"`) to render
`<p className="muv-category-card-status">Muving Soon™</p>` in place of the normal tagline, using
the exact same CSS class every other category's tagline uses
(`.muv-category-card-status` — `styles/globals.css:214`, `text-transform: uppercase; letter-spacing:
0.24em`), so it displays as **"MUVING SOON™"** — real existing brand styling, not new/one-off CSS.
The card's link also already resolves to `href="#"` instead of `/collections/skin-care` whenever
`comingSoon` is true, so it can't be clicked into. Skin Care remains visible (not hidden) with **0
products**, confirmed directly against the database.

## 2. Black Phenyl

Created `MUV Black Phenyl` (slug `muv-black-phenyl`) as a **Product row only** — `status: DRAFT`,
Home Care category, **zero `ProductVariant` rows**. Not a placeholder in name only: this is a
technical necessity, not a shortcut — `ProductVariant.price`/`mrp` are required, non-nullable
fields, and no real MRP for the 1L pack exists anywhere in this repository (confirmed again this
pass). Creating a variant now would mean fabricating a price, which this project has consistently
refused to do at every prior step. Confirmed safe: `app/(storefront)/products/[slug]/page.tsx:52`
already calls `notFound()` for any `DRAFT` product before touching variant data — this record is
invisible to customers and cannot crash a page, by the app's own existing logic, not a new check
added for this.

**Not deleted, not deactivated-then-forgotten** — it persists as a real row, upserted (idempotent,
safe to re-run). When a real MRP arrives: create the `MUV-BP-STD-1000` variant + inventory row and
flip this same Product's `status` to `ACTIVE` — do not recreate or delete it.

## 3. Homepage category count — verified directly against the database

| Category | Total products | Active products |
|---|---|---|
| Home Care | 9 | **8** |
| Fabric Care | 3 | 3 |
| Body Care | 3 | 3 |
| Personal Care | 4 | 4 |
| Car Care | 1 | 1 |
| Skin Care | 0 | 0 |
| **Total** | **20** | **19** |

All 6 categories present and queryable (`prisma.category.findMany()` — what the homepage actually
calls — returns all 6, unchanged count from before this session). Home Care's total (9) includes
the new DRAFT Black Phenyl record, but its **active** count stays at 8 — confirming, as required,
that adding the placeholder did not affect active product counts anywhere. Global totals:
19 ACTIVE, 1 DRAFT, 20 overall.

## Build check

`npm run build` — clean, no errors, run after all changes above.

## Files changed this pass

- `scripts/create-black-phenyl-placeholder.ts` — new, idempotent, run once (real write).
- `PRODUCTION_CATALOG_MANIFEST.json` — Black Phenyl entry updated to reflect the DRAFT placeholder
  now existing.
- This report.

No application code was modified — item 1 required verification, not a change; item 2 required
one new data-only script.
