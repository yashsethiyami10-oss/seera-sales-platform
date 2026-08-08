# MUV Product Knowledge Factory™

This directory contains the Product Knowledge Factory's governance documents and its per-product
Knowledge Packages.

## Governance (read these first)

- **`CONSTITUTION.md`** — binding rules for the Product Knowledge Factory, including the
  permanent Commercial/Knowledge Separation (`FR-001`): the Knowledge Factory owns product
  intelligence; the live website product catalog owns commercial data (MRP, price, discount,
  images, stock, URL, slug, availability). Never the reverse, never merged.
- **`FOUNDER_RULES.md`** — the dated, append-only ledger of binding Founder Decisions governing
  this system.
- **`ARCHITECTURE.md`** — how the Knowledge Factory content layer and the live Product Catalog
  layer are structured in the real codebase, and how they must be joined at AI-answer time.
- **`VALIDATION_RULES.md`** — the enforceable checklist every future Knowledge Package's
  Validation Report must satisfy, plus the Legacy Compliance Register tracking (without acting
  on) the six pre-Constitution packages' commercial-data gap.

## Product Knowledge Packages

`products/` — one subfolder per product family: `liquid-detergent/`, `toilet-cleaner/`,
`dishwash-gel/`, `fresh-bathroom-cleaner/`, `crystal-glass-cleaner/`, `floor-cleaner/`. Each
follows the Knowledge Object format and per-family Stop Rule defined in `CONSTITUTION.md` Article
7. New packages are built one product family at a time, with explicit Founder approval required
between each.
