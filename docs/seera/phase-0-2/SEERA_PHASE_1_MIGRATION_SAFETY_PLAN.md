# Phase 1 Migration Safety Plan

Proposal only; do not execute in Phase 0.2.

## Sequence

1. Snapshot schema/migration table, MUV row counts, sequence values, finance balances and critical document samples; confirm tested backup/restore point.
2. Generate migration containing new foundation tables/indexes/FKs only. Review SQL: no ALTER/DROP/rename/enum replacement on MUV business tables.
3. Apply to an isolated database clone; run validation queries and complete MUV baseline.
4. Deploy code with Seera feature flag off and no changed MUV routing.
5. Idempotently create `MUV` organisation metadata without linking/reassigning MUV business rows.
6. Re-run MUV regression and compare snapshots.
7. Idempotently create Seera organisation and administrative membership, still flag-off.
8. Enable only for test principals; run bilateral isolation/cache/export/file/job tests.
9. Founder approves production activation separately.

## Rollback

Before Seera data: roll back code, verify flag off, and reverse migration may drop only newly added empty tables in dependency order. After any Seera data: do not drop; roll back code/disable flag and retain isolated dormant data, then export/archive under approved procedure. Never reverse by deleting or updating MUV records. No document number changes require restoration.

## Validation queries/checklist

- Migration SQL contains no destructive MUV statement.
- MUV table counts, key null/orphan checks, sequence next values and finance trial balance match pre-snapshot.
- Foundation seed yields exactly one MUV and one Seera org on repeat.
- Membership/user FKs valid; no membership grants access without ACTIVE status.
- Every Seera unique/index key includes organisation where required.
- `prisma migrate status`, validate/generate, TypeScript, build and all grouped/full MUV tests pass.
- Restore rehearsal proves backup usable before production.

Transactions: use normal DDL transaction where PostgreSQL supports it; keep index creation/large operations separate only if required and explicitly reversible. Phase 1 has no legacy backfill, required-field transition or production-data assumption.

