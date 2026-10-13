# MUV Care Collection — sales brochure (2026)

- `MUV_Care_Collection_2026_with_MRP.pdf` — 10-page A4 brochure with MRP.
- `MUV_Care_Collection_2026_no_price.pdf` — same design without prices (rate/scheme quoted on the spot).

Pack sizes and MRP mirror the live Seera SKU master
(`prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql`).

## Rebuild after a price/product change
Edit the data lists at the top of `source/build.py`, then from `source/`:

```bash
python3 build.py price brochure_price.html && node render.mjs "$PWD/brochure_price.html" ../MUV_Care_Collection_2026_with_MRP.pdf
python3 build.py noprice brochure_noprice.html && node render.mjs "$PWD/brochure_noprice.html" ../MUV_Care_Collection_2026_no_price.pdf
```

`render.mjs` needs Playwright + Chromium. `cutout.py` regenerates the background-removed product
images from `public/hero/products/` (run from the repo root: `python3 docs/sales-collateral/muv-brochure/source/cutout.py docs/sales-collateral/muv-brochure/source/img`).
