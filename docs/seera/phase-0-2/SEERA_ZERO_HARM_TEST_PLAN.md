# Zero-Harm Acceptance Test Plan

## MUV golden regression

- Login/session/OAuth/credentials and disabled user behavior unchanged.
- ADMIN/STAFF/CUSTOMER and Sales roles retain exact allow/deny outcomes.
- Admin, account, storefront, Sales, enterprise, finance and Founder dashboards load.
- Representative quote creation/version/approval/PDF and numbers unchanged.
- Storefront and business order creation/payment/shipment/status unchanged.
- Finance posting, balance, reversal, allocations and reconciliation unchanged.
- Reports/exports return same authorized row sets and totals.
- Existing media URLs, notifications/providers and MUV AI workflows unchanged.
- Seed repeat is safe; all existing sequence values and formats unchanged.

Use snapshot/golden comparisons before and after dark deployment. Existing baseline must first be made reliable; do not bless changed output merely because both runs fail.

## Entity isolation

- Bilateral MUV/Seera read/write denial for direct IDs, search, aggregates, reports, exports, files, notifications, caches and background tasks.
- Switch requires active membership, is CSRF-safe/audited, and cannot be tampered by URL/body/cookie.
- Suspended/revoked membership and stale session fail immediately.
- One user’s roles differ safely by organisation; no global Founder bypass.
- Missing org context fails closed on Seera paths; never defaults to MUV.

## Migration safety

- Existing MUV rows remain accessible, unchanged, non-orphaned and unreassigned.
- Migration/seed re-run is idempotent.
- Rollback flag/code path restores pre-migration MUV behavior.
- Reverse migration works while new tables are empty; post-data rollback retains dormant Seera rows.
- Concurrent membership/sequence creation respects unique constraints and never consumes MUV sequence numbers.

## Required execution gate

Prisma format/validate/generate/migrate status, TypeScript, production build, every bounded group and full serial suite must complete. Record durations, counts, skipped tests, database identity, build trace and teardown. No timeout counts as a pass.

