# MUV — Production Structure Import Report (Phase A)

**Status: COMPLETE. Executed against the live production database.** This is a record of a real
write action, not a plan — categories and homepage sections now exist in production.

## What was inserted

Script: `scripts/production-structural-import.ts` (new, permanent — kept separate from
`prisma/seed.ts`, which is untouched and continues to serve its own local-dev demo-data purpose).

**6 categories** (`prisma.category.upsert`, keyed on `slug`):

| sortOrder | name | slug | comingSoon |
|---|---|---|---|
| 0 | Home Care | home-care | — |
| 1 | Fabric Care | fabric-care | — |
| 2 | Body Care | body-care | — |
| 3 | Personal Care | personal-care | — |
| 4 | Car Care | car-care | — |
| 5 | Skin Care | skin-care | true |

**8 homepage sections** (`prisma.homepageSection.upsert`, keyed on `key`), all `visible: true`:
`hero`, `marquee`, `categories`, `bestsellers`, `brandstory`, `reviews`, `business`, `newsletter`.

**Nothing else.** No `Banner`, `AnnouncementBar`, `NewsletterContent`, `Coupon`, or `Product` row
was created — verified directly (0 rows in each, post-run), per the explicit instruction not to
invent banners or marketing copy.

## Idempotency — proven, not assumed

The script was run **twice** against production:

| | categories before | categories after | sections before | sections after | created this run |
|---|---|---|---|---|---|
| Run 1 | 0 | 6 | 0 | 8 | 6 categories, 8 sections |
| Run 2 | 6 | 6 | 8 | 8 | **0 categories, 0 sections** — all 6/8 correctly identified as already-existing |

Every write is a Prisma `upsert` keyed on a real database-level unique column (`slug` for
categories, `key` for homepage sections) — not an application-level check-then-insert, so this
holds even under concurrent execution, not just sequential re-runs. A direct `GROUP BY ... HAVING
COUNT(*) > 1` query against both tables post-run confirms **zero duplicate slugs, zero duplicate
keys**.

## Why this is safe (recap, not new)

No product, price, image, or marketing copy was fabricated. Category names are the real taxonomy
matching the real 12-product-family catalog identified in `PRODUCTION_DATA_IMPORT_PLAN.md`. The
homepage-section registry is pure visibility configuration with no factual content to be wrong
about. "Skin Care" is carried forward as `comingSoon` — a placeholder for a future category, not a
claim that a product exists.

## Effect on the live storefront

The homepage's category grid (`app/(storefront)/page.tsx`) will now render 6 real category tiles
instead of the "New categories are on their way" placeholder documented in
`HOMEPAGE_MISSING_DATA_FORENSIC_REPORT.md`. Featured Products, product sliders, and the hero
banner remain empty — this phase deliberately did not touch products, prices, or banners; that
is Phase B/C, not yet approved for execution.
