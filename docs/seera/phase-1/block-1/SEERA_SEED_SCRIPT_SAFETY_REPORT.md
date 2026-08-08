# Seera Seed and Database Script Safety Report

Static inspection found 24 copied files that both import/use Prisma and contain write/transaction operations. They include the MUV seed, catalog/content imports, role setters, fixture-writing verifiers and other MUV-shaped data writers.

All 24 were moved byte-for-byte to `reference/muv-db-scripts/`; manifest `reference/MUV_DB_SCRIPT_ARCHIVE_MANIFEST.sha256` verifies 24/24 hashes with zero difference. `prisma/seed.ts` no longer exists in the active Prisma tree.

Classification:

- **unsafe to run:** all archived write-capable files;
- **reusable only after rewrite:** fixture/test patterns that can be rebuilt against Seera models and explicit test identity guard;
- **reference only:** read-only snapshots/verification concepts and historical SQL/install scripts.

`package.json` blocks `db:seed`, and its Prisma seed hook points to the same fail-closed blocker. Direct migration/push/deploy/studio commands are also blocked. The MUV historical copies are retained, not deleted.

