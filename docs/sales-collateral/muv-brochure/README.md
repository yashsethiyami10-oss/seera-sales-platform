# Seera + MUV — Product Catalogue 2026

`Seera_MUV_Catalogue_2026.pdf` — 12-page A4 brochure: Seera first (pages 2–4), then MUV (pages 5–11).
Each product shows only its name, weight/pack and MRP. Layout v3: every product page uses the same pattern —
brand-colour header band (logo + category), product cards (photo, name, weight → MRP rows), brand footer;
page 11 is a combined price list.

- MUV pack sizes and MRP mirror the live Seera SKU master
  (`prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql`).
- Seera MRPs are Founder-supplied; any still unknown render as "MRP —" (`None` in `source/build3.py`).
- Seera pack photos are Founder-supplied (background removed) (Yuva bar cut out of the Founder-supplied ad). `fill_pouch.py` gives the flat Shine Plus pouch a filled look.

## Rebuild
From `source/`:

```bash
python3 build3.py catalogue.html && node render.mjs "$PWD/catalogue.html" ../Seera_MUV_Catalogue_2026.pdf
```

Product cutouts were made with `remove_bg.py` (rembg, `birefnet-general` model) from `public/hero/products/`.
