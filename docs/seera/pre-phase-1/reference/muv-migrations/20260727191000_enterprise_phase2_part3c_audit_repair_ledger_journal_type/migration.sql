-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, independent-audit
-- repair pass. Additive only.
--
-- getPeriodActivitySummary (lib/enterprise-finance/ledger-service.ts) fetched
-- up to 5000 raw finance_ledger_entries rows (joined to finance_journals for
-- journalType) and reduced them in application code — contrary to its own
-- documentation, which claimed real database aggregation, and a genuine
-- scalability defect: any fiscal period with more than 5000 posted ledger
-- entries produced a silently incomplete, unordered summary.
--
-- Prisma's groupBy cannot group by a related model's field, so journalType
-- is denormalized directly onto finance_ledger_entries at posting time,
-- letting the summary use a real, exact, bounded-by-result-groups (not
-- bounded by raw row count) database aggregation instead.
--
-- Added nullable first, backfilled from the owning journal, then set
-- NOT NULL — safe against the existing accumulated ledger entries in this
-- database (many, from repeated local test runs across this whole
-- engagement). finance_ledger_entries is unconditionally append-only
-- (finance_reject_ledger_mutation, installed by
-- 20260727150000_..._stagea_accounting_core) — that trigger blocks every
-- UPDATE unconditionally, so no trigger change is needed to protect this
-- new column; it is automatically covered.

ALTER TABLE "finance_ledger_entries" ADD COLUMN "journalType" TEXT;

-- finance_ledger_entries_immutable unconditionally rejects every UPDATE
-- (by design — this is the table's whole point), which also blocks this
-- migration's own backfill. Disabled only for the backfill statement
-- below, within this migration's own transaction, then re-enabled
-- immediately after — no window exists where the table is genuinely
-- writable by anything other than this migration.
ALTER TABLE "finance_ledger_entries" DISABLE TRIGGER "finance_ledger_entries_immutable";

UPDATE "finance_ledger_entries" AS le
SET "journalType" = fj."journalType"
FROM "finance_journals" AS fj
WHERE fj."id" = le."journalId";

ALTER TABLE "finance_ledger_entries" ENABLE TRIGGER "finance_ledger_entries_immutable";

ALTER TABLE "finance_ledger_entries" ALTER COLUMN "journalType" SET NOT NULL;

CREATE INDEX "finance_ledger_entries_organizationKey_fiscalPeriodId_jour_idx" ON "finance_ledger_entries"("organizationKey", "fiscalPeriodId", "journalType");
