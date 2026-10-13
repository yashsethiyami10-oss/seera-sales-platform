# Seera + MUV — Product Catalogue 2026

`Seera_MUV_Catalogue_2026.pdf` — 12-page A4 brochure: Seera first (pages 2–4), then MUV (pages 5–11).
Each product shows only its name, weight/pack and MRP.

- MUV pack sizes and MRP mirror the live Seera SKU master
  (`prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql`).
- Seera: only the two Aatmanirbhar sachets have an MRP; the other Seera SKUs show weight only until
  their MRP is filled in (`mrp` field in `source/build2.py`, currently `None`).
- Seera packs use illustrated icons — no Seera product photos exist in either repo yet.

## Rebuild
From `source/`:

```bash
python3 build2.py catalogue.html && node render.mjs "$PWD/catalogue.html" ../Seera_MUV_Catalogue_2026.pdf
```

Product cutouts were made with `remove_bg.py` (rembg, `birefnet-general` model) from `public/hero/products/`.
