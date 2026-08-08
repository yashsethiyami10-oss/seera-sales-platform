-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Stage A (Accounting Core)
-- Additive only. No existing table, column, index, or constraint is dropped,
-- renamed, or altered. Built on Wave 1's finance_configurations/
-- finance_fiscal_years/finance_fiscal_periods/finance_cost_centers/
-- finance_profit_centers/finance_accounts.
--
-- Note: `prisma migrate diff` against the live database also proposed
-- dropping the eight hand-written `users(id)` foreign keys added by Wave 1's
-- own migration (20260727140000_...), because those FKs were added by hand
-- and have no corresponding Prisma relation in schema.prisma. Those DROP
-- statements are deliberately excluded from this migration — only the
-- genuinely new CreateTable/CreateIndex/AddForeignKey statements below are
-- applied.

-- CreateTable
CREATE TABLE "finance_journals" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "journalNumber" TEXT NOT NULL,
    "journalType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postingDate" TIMESTAMP(3) NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceVersion" INTEGER,
    "fiscalYearId" TEXT,
    "fiscalPeriodId" TEXT,
    "totalDebit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reversalOfJournalId" TEXT,
    "reversedByJournalId" TEXT,
    "correctionOfJournalId" TEXT,
    "successorJournalId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "postedById" TEXT,
    "cancelledById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_journal_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "costCenterId" TEXT,
    "profitCenterId" TEXT,
    "sourceLineType" TEXT,
    "sourceLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_ledger_entries" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "debitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "costCenterId" TEXT,
    "profitCenterId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceVersion" INTEGER,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_journals_reversalOfJournalId_key" ON "finance_journals"("reversalOfJournalId");
CREATE UNIQUE INDEX "finance_journals_reversedByJournalId_key" ON "finance_journals"("reversedByJournalId");
CREATE UNIQUE INDEX "finance_journals_correctionOfJournalId_key" ON "finance_journals"("correctionOfJournalId");
CREATE UNIQUE INDEX "finance_journals_successorJournalId_key" ON "finance_journals"("successorJournalId");
CREATE INDEX "finance_journals_organizationKey_status_postingDate_idx" ON "finance_journals"("organizationKey", "status", "postingDate");
CREATE INDEX "finance_journals_organizationKey_journalType_status_idx" ON "finance_journals"("organizationKey", "journalType", "status");
CREATE INDEX "finance_journals_organizationKey_sourceType_sourceId_idx" ON "finance_journals"("organizationKey", "sourceType", "sourceId");
CREATE INDEX "finance_journals_organizationKey_fiscalPeriodId_idx" ON "finance_journals"("organizationKey", "fiscalPeriodId");
CREATE UNIQUE INDEX "finance_journals_organizationKey_journalNumber_key" ON "finance_journals"("organizationKey", "journalNumber");

CREATE INDEX "finance_journal_lines_organizationKey_accountId_idx" ON "finance_journal_lines"("organizationKey", "accountId");
CREATE UNIQUE INDEX "finance_journal_lines_organizationKey_journalId_lineNumber_key" ON "finance_journal_lines"("organizationKey", "journalId", "lineNumber");

CREATE INDEX "finance_ledger_entries_organizationKey_accountId_postingDat_idx" ON "finance_ledger_entries"("organizationKey", "accountId", "postingDate");
CREATE INDEX "finance_ledger_entries_organizationKey_fiscalPeriodId_idx" ON "finance_ledger_entries"("organizationKey", "fiscalPeriodId");
CREATE INDEX "finance_ledger_entries_organizationKey_journalId_idx" ON "finance_ledger_entries"("organizationKey", "journalId");
CREATE INDEX "finance_ledger_entries_organizationKey_sourceType_sourceId_idx" ON "finance_ledger_entries"("organizationKey", "sourceType", "sourceId");
CREATE INDEX "finance_ledger_entries_organizationKey_costCenterId_idx" ON "finance_ledger_entries"("organizationKey", "costCenterId");
CREATE INDEX "finance_ledger_entries_organizationKey_profitCenterId_idx" ON "finance_ledger_entries"("organizationKey", "profitCenterId");

-- AddForeignKey
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "finance_fiscal_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "finance_fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_reversalOfJournalId_fkey" FOREIGN KEY ("reversalOfJournalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_correctionOfJournalId_fkey" FOREIGN KEY ("correctionOfJournalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_profitCenterId_fkey" FOREIGN KEY ("profitCenterId") REFERENCES "finance_profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "finance_journal_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "finance_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "finance_fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_profitCenterId_fkey" FOREIGN KEY ("profitCenterId") REFERENCES "finance_profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (trusted User references — matches Phase 1/Wave 1 convention)
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Section 5 rules 4-8: at least implicitly enforced per-line (every line has
-- exactly one positive side; both zero and negative values are rejected by
-- construction, since neither side could then be ">0").
ALTER TABLE "finance_journal_lines" ADD CONSTRAINT "finance_journal_lines_valid_side" CHECK (
  ("debitAmount" > 0 AND "creditAmount" = 0) OR ("creditAmount" > 0 AND "debitAmount" = 0)
);
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_valid_side" CHECK (
  ("debitAmount" > 0 AND "creditAmount" = 0) OR ("creditAmount" > 0 AND "debitAmount" = 0)
);

-- No self-reversal, no self-correction.
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_no_self_reversal" CHECK ("reversalOfJournalId" IS NULL OR "reversalOfJournalId" <> "id");
ALTER TABLE "finance_journals" ADD CONSTRAINT "finance_journals_no_self_correction" CHECK ("correctionOfJournalId" IS NULL OR "correctionOfJournalId" <> "id");

-- Organization-consistent journal lines and ledger entries: an account,
-- cost center, or profit center referenced by a line/entry must belong to
-- the same organization as the line/entry itself.
CREATE OR REPLACE FUNCTION finance_assert_journal_line_organization() RETURNS trigger AS $$
DECLARE
  account_org TEXT;
  cc_org TEXT;
  pc_org TEXT;
BEGIN
  SELECT "organizationKey" INTO account_org FROM "finance_accounts" WHERE "id" = NEW."accountId";
  IF account_org IS NULL OR account_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Journal line account must belong to the same organization';
  END IF;
  IF NEW."costCenterId" IS NOT NULL THEN
    SELECT "organizationKey" INTO cc_org FROM "finance_cost_centers" WHERE "id" = NEW."costCenterId";
    IF cc_org IS NULL OR cc_org <> NEW."organizationKey" THEN
      RAISE EXCEPTION 'Journal line cost center must belong to the same organization';
    END IF;
  END IF;
  IF NEW."profitCenterId" IS NOT NULL THEN
    SELECT "organizationKey" INTO pc_org FROM "finance_profit_centers" WHERE "id" = NEW."profitCenterId";
    IF pc_org IS NULL OR pc_org <> NEW."organizationKey" THEN
      RAISE EXCEPTION 'Journal line profit center must belong to the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journal_lines_org_guard
  BEFORE INSERT OR UPDATE ON "finance_journal_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_journal_line_organization();

CREATE OR REPLACE FUNCTION finance_assert_journal_reversal_organization() RETURNS trigger AS $$
DECLARE
  ref_org TEXT;
BEGIN
  IF NEW."reversalOfJournalId" IS NOT NULL THEN
    SELECT "organizationKey" INTO ref_org FROM "finance_journals" WHERE "id" = NEW."reversalOfJournalId";
    IF ref_org IS NULL OR ref_org <> NEW."organizationKey" THEN
      RAISE EXCEPTION 'A reversal must reference a journal in the same organization';
    END IF;
  END IF;
  IF NEW."correctionOfJournalId" IS NOT NULL THEN
    SELECT "organizationKey" INTO ref_org FROM "finance_journals" WHERE "id" = NEW."correctionOfJournalId";
    IF ref_org IS NULL OR ref_org <> NEW."organizationKey" THEN
      RAISE EXCEPTION 'A correction must reference a journal in the same organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journals_reversal_org_guard
  BEFORE INSERT OR UPDATE ON "finance_journals"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_journal_reversal_organization();

-- Posted journals are immutable, with exactly one narrow exception: the
-- Posting Engine writes back a single reversal/successor cross-reference
-- (reversedByJournalId / successorJournalId, NULL -> a value, once) onto
-- the original posted journal when a reversal or correction is created.
-- Every other column, and any re-write of an already-populated
-- back-reference, is rejected.
CREATE OR REPLACE FUNCTION finance_reject_posted_journal_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION 'Posted financial journals cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'POSTED' AND (
    NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."journalNumber" IS DISTINCT FROM OLD."journalNumber" OR
    NEW."journalType" IS DISTINCT FROM OLD."journalType" OR
    NEW."postingDate" IS DISTINCT FROM OLD."postingDate" OR
    NEW."documentDate" IS DISTINCT FROM OLD."documentDate" OR
    NEW."totalDebit" IS DISTINCT FROM OLD."totalDebit" OR
    NEW."totalCredit" IS DISTINCT FROM OLD."totalCredit" OR
    NEW."fiscalYearId" IS DISTINCT FROM OLD."fiscalYearId" OR
    NEW."fiscalPeriodId" IS DISTINCT FROM OLD."fiscalPeriodId" OR
    NEW."reversalOfJournalId" IS DISTINCT FROM OLD."reversalOfJournalId" OR
    NEW."correctionOfJournalId" IS DISTINCT FROM OLD."correctionOfJournalId" OR
    NEW."postedById" IS DISTINCT FROM OLD."postedById" OR
    NEW."postedAt" IS DISTINCT FROM OLD."postedAt" OR
    (OLD."reversedByJournalId" IS NOT NULL AND NEW."reversedByJournalId" IS DISTINCT FROM OLD."reversedByJournalId") OR
    (OLD."successorJournalId" IS NOT NULL AND NEW."successorJournalId" IS DISTINCT FROM OLD."successorJournalId")
  ) THEN
    RAISE EXCEPTION 'Posted financial journals are immutable, except recording a single reversal/successor back-reference';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journals_posted_immutable
  BEFORE UPDATE OR DELETE ON "finance_journals"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_posted_journal_mutation();

-- Journal lines of a posted journal are fully immutable (no exceptions).
CREATE OR REPLACE FUNCTION finance_reject_posted_journal_line_mutation() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status FROM "finance_journals" WHERE "id" = COALESCE(NEW."journalId", OLD."journalId");
  IF parent_status = 'POSTED' THEN
    RAISE EXCEPTION 'Lines of a posted financial journal are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_journal_lines_posted_immutable
  BEFORE UPDATE OR DELETE ON "finance_journal_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_posted_journal_line_mutation();

-- General Ledger entries are unconditionally append-only.
CREATE OR REPLACE FUNCTION finance_reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'General ledger entries are append-only and immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON "finance_ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_ledger_mutation();
