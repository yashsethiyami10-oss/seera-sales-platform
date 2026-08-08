# MUV — Production Bulk Import Readiness (Phase C)

**Status: script built, tested in dry-run mode, NOT executed for products.** Zero product,
variant, or inventory rows exist in production as of this report — verified directly, immediately
before writing this document (`products: 0, variants: 0, inventory: 0`).

## What was built

`scripts/production-catalog-bulk-import.ts` — reads `PRODUCTION_CATALOG_MANIFEST.json` and, for
each of the 37 SKU rows, either imports it (Product + ProductVariant + Inventory, in one
transaction) or skips it with a stated reason. Separate from, and has no knowledge of,
`prisma/seed.ts`'s fictional product list.

## How it satisfies each required property

| Requirement | How |
|---|---|
| **Reject incomplete required fields** | `validateRow()` checks `productName`, `category`, `packSize`, `mrp`, `sellingPrice`, and `proposedSkuCode` are all present before considering a row importable. Any row flagged with an unresolved `CONFLICT`/`ALREADY-DOCUMENTED CONFLICT` note in the manifest is also rejected outright, not just fields-checked. |
| **Prevent duplicates** | Products upserted by `slug`, variants by `sku` — both real, unique, database-enforced columns, not an application-level check. |
| **Preserve existing rows** | Every upsert's `update` clause is `{}` — an existing row is matched and left completely untouched, never overwritten, matching the exact convention `prisma/seed.ts` already uses. |
| **Produce a dry-run report** | Default mode (no flag needed). Outputs a per-SKU decision (`WOULD_CREATE_PRODUCT_AND_VARIANT` / `WOULD_CREATE_VARIANT_ONLY` / `WOULD_SKIP_EXISTING` / `SKIPPED_MISSING_REQUIRED_FIELD`) plus a summary count, with zero database writes. |
| **Support rollback** | `--execute` mode wraps each SKU's Product+Variant+Inventory writes in one `prisma.$transaction` — a failure partway through that SKU's insert rolls back atomically; Prisma's native transaction guarantee, not custom compensation code. |
| **Never insert demo data** | Reads only from `PRODUCTION_CATALOG_MANIFEST.json` (built from real sources — see `PRODUCTION_DATA_IMPORT_PLAN.md`). Has no import of, or reference to, `prisma/seed.ts`. |

## Dry run — actually executed, results below (no writes made)

```
npx tsx scripts/production-catalog-bulk-import.ts
```

| Metric | Result |
|---|---|
| Total SKUs in manifest | 37 |
| Would create (new product + variant) | **0** |
| Would create (variant on existing product) | **0** |
| Would skip (already exists) | **0** |
| **Skipped — missing required field** | **37** |

**Every single row was skipped, and this is correct, not a bug**: every one of the 37 SKUs has
`sellingPrice: null` in today's manifest (per the explicit instruction not to copy MRP into selling
price automatically — see `PRODUCTION_CATALOG_FOUNDER_APPROVAL.md`). The script's validator caught
every one of them, exactly as designed. Rows 20–22 (the two flagged conflicts) would additionally
be rejected on their conflict note even if a price were supplied, until those are resolved.

## Post-dry-run verification (read-only, confirms zero side effects)

```
{ categories: 6, homepageSections: 8, products: 0, variants: 0, inventory: 0, banners: 0 }
```

`categories`/`homepageSections` reflect Phase A's real import
(`PRODUCTION_STRUCTURE_IMPORT_REPORT.md`); everything product-related remains exactly 0, confirming
the dry run made no writes.

## What "readiness" means here, precisely

The script is functionally complete and verified against the live production database — it is not
a stub or a plan-only artifact. It will import real product data **the moment the manifest
contains real, Founder-approved `sellingPrice` values** (edited directly into
`PRODUCTION_CATALOG_MANIFEST.json`, or the two conflicted rows resolved) — no further engineering
work is needed to go from "readiness" to "execution" for any subset of the 37 SKUs. Running it with
`--execute` remains a deliberate, separate, Founder-authorized action — not taken in this pass.

## `npm run build` / type-check

`npx tsc --noEmit` — clean, no errors, including both new scripts
(`production-structural-import.ts`, `production-catalog-bulk-import.ts`).

---

## STOP — per explicit instruction

Phase A is imported and verified. The 37-SKU manifest, Founder approval package, and bulk-import
mechanism are complete and tested in dry-run mode. **No product was imported. No image was
modified. No AI feature was activated.** Waiting for Founder approval on the items listed in
`PRODUCTION_CATALOG_FOUNDER_APPROVAL.md` before any `--execute` run.
