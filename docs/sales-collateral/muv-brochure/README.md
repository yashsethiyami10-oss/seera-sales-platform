# Seera + MUV — Product Catalogue 2026

`Seera_MUV_Catalogue_2026.pdf` — 12-page A4 brochure: Seera first (pages 2–4), then MUV (pages 5–11).
Each product shows only its name, weight/pack and MRP. Layout v6 (professional, build5.py): cover + page 2 show the Aatmanirbhar → Seera + MUV family; every product page = hero banner (category visual, hero pack, cleaning-type icons) + 3D product shelf cards (podium, reflection, MRP tag) —
brand-colour header band (logo + category), product cards (photo, name, weight → MRP rows), brand footer;
page 11 is a combined price list.

- MUV pack sizes and MRP mirror the live Seera SKU master
  (`prisma/migrations/20260816000000_seera_catalog_restoration/migration.sql`).
- Seera MRPs are Founder-supplied; any still unknown render as "MRP —" (`None` in `source/build3.py`).
- Seera pack photos are Founder-supplied (background removed) (Yuva bar cut out of the Founder-supplied ad). `pouch3d.py` turns the flat Shine Plus artwork into a filled, sealed pouch.

## Rebuild
From `source/`:

```bash
python3 build5.py catalogue.html && node render.mjs "$PWD/catalogue.html" ../Seera_MUV_Catalogue_2026.pdf
```

Product cutouts were made with `remove_bg.py` (rembg, `birefnet-general` model) from `public/hero/products/`.
