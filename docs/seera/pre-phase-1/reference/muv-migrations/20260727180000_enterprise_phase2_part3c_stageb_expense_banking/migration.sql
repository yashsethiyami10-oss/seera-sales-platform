-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Stage B — Expense
-- Management and Banking Foundation/Reconciliation. Additive only. As with
-- every prior Finance migration, `prisma migrate diff`'s proposed DROPs of
-- hand-written users(id) foreign keys on finance_* tables are deliberately
-- excluded.

CREATE TABLE "finance_expense_categories" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_expense_claims" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalClaimedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalApprovedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "reimbursedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_expense_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_expense_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "claimedAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2),
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "profitCenterId" TEXT,
    "evidenceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_expense_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_bank_accounts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionName" TEXT,
    "maskedAccountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "linkedGlAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_bank_statements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementRef" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_bank_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_bank_statement_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "debitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "externalReference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_reconciliation_sessions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "preparedById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_reconciliation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_reconciliation_matches" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "ledgerEntryId" TEXT,
    "adjustmentJournalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversalOfMatchId" TEXT,
    "matchedById" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_reconciliation_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_expense_categories_organizationKey_status_idx" ON "finance_expense_categories"("organizationKey", "status");
CREATE UNIQUE INDEX "finance_expense_categories_organizationKey_code_key" ON "finance_expense_categories"("organizationKey", "code");
CREATE UNIQUE INDEX "finance_expense_claims_journalId_key" ON "finance_expense_claims"("journalId");
CREATE INDEX "finance_expense_claims_organizationKey_claimantId_status_idx" ON "finance_expense_claims"("organizationKey", "claimantId", "status");
CREATE INDEX "finance_expense_claims_organizationKey_status_idx" ON "finance_expense_claims"("organizationKey", "status");
CREATE UNIQUE INDEX "finance_expense_claims_organizationKey_claimNumber_key" ON "finance_expense_claims"("organizationKey", "claimNumber");
CREATE UNIQUE INDEX "finance_expense_lines_organizationKey_claimId_lineNumber_key" ON "finance_expense_lines"("organizationKey", "claimId", "lineNumber");

CREATE INDEX "finance_bank_accounts_organizationKey_status_idx" ON "finance_bank_accounts"("organizationKey", "status");
CREATE UNIQUE INDEX "finance_bank_accounts_organizationKey_code_key" ON "finance_bank_accounts"("organizationKey", "code");
CREATE INDEX "finance_bank_statements_organizationKey_bankAccountId_statu_idx" ON "finance_bank_statements"("organizationKey", "bankAccountId", "status");
CREATE UNIQUE INDEX "finance_bank_statements_organizationKey_bankAccountId_state_key" ON "finance_bank_statements"("organizationKey", "bankAccountId", "statementRef");
CREATE INDEX "finance_bank_statement_lines_organizationKey_statementId_st_idx" ON "finance_bank_statement_lines"("organizationKey", "statementId", "status");
-- Duplicate statement-line import detection (Section 22): the same
-- external reference cannot be imported twice into the same statement.
CREATE UNIQUE INDEX "finance_bank_statement_lines_organizationKey_statementId_ex_key" ON "finance_bank_statement_lines"("organizationKey", "statementId", "externalReference");
CREATE INDEX "finance_reconciliation_sessions_organizationKey_bankAccount_idx" ON "finance_reconciliation_sessions"("organizationKey", "bankAccountId", "status");
CREATE UNIQUE INDEX "finance_reconciliation_matches_reversalOfMatchId_key" ON "finance_reconciliation_matches"("reversalOfMatchId");
CREATE INDEX "finance_reconciliation_matches_organizationKey_sessionId_idx" ON "finance_reconciliation_matches"("organizationKey", "sessionId");
CREATE INDEX "finance_reconciliation_matches_organizationKey_statementLin_idx" ON "finance_reconciliation_matches"("organizationKey", "statementLineId");

ALTER TABLE "finance_expense_categories" ADD CONSTRAINT "finance_expense_categories_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "finance_expense_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_profitCenterId_fkey" FOREIGN KEY ("profitCenterId") REFERENCES "finance_profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_bank_accounts" ADD CONSTRAINT "finance_bank_accounts_linkedGlAccountId_fkey" FOREIGN KEY ("linkedGlAccountId") REFERENCES "finance_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_bank_statements" ADD CONSTRAINT "finance_bank_statements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "finance_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_bank_statement_lines" ADD CONSTRAINT "finance_bank_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "finance_bank_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_sessions" ADD CONSTRAINT "finance_reconciliation_sessions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "finance_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_sessions" ADD CONSTRAINT "finance_reconciliation_sessions_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "finance_bank_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "finance_reconciliation_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "finance_bank_statement_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "finance_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_adjustmentJournalId_fkey" FOREIGN KEY ("adjustmentJournalId") REFERENCES "finance_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_reversalOfMatchId_fkey" FOREIGN KEY ("reversalOfMatchId") REFERENCES "finance_reconciliation_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Trusted User references.
ALTER TABLE "finance_expense_categories" ADD CONSTRAINT "finance_expense_categories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_expense_claims" ADD CONSTRAINT "finance_expense_claims_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_bank_accounts" ADD CONSTRAINT "finance_bank_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_bank_statements" ADD CONSTRAINT "finance_bank_statements_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_sessions" ADD CONSTRAINT "finance_reconciliation_sessions_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_sessions" ADD CONSTRAINT "finance_reconciliation_sessions_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_matchedById_fkey" FOREIGN KEY ("matchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Amount guards.
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_claimed_positive" CHECK ("claimedAmount" > 0);
-- Approved amount may never exceed claimed amount (Section 21).
ALTER TABLE "finance_expense_lines" ADD CONSTRAINT "finance_expense_lines_approved_not_exceeding_claimed" CHECK ("approvedAmount" IS NULL OR ("approvedAmount" >= 0 AND "approvedAmount" <= "claimedAmount"));
ALTER TABLE "finance_bank_statement_lines" ADD CONSTRAINT "finance_bank_statement_lines_valid_side" CHECK (
  ("debitAmount" > 0 AND "creditAmount" = 0) OR ("creditAmount" > 0 AND "debitAmount" = 0)
);
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_no_self_reversal" CHECK ("reversalOfMatchId" IS NULL OR "reversalOfMatchId" <> "id");
-- A match references exactly one of an existing ledger entry or a new
-- manual-adjustment journal, never both, never neither.
ALTER TABLE "finance_reconciliation_matches" ADD CONSTRAINT "finance_reconciliation_matches_one_target" CHECK (
  ("ledgerEntryId" IS NOT NULL AND "adjustmentJournalId" IS NULL) OR ("ledgerEntryId" IS NULL AND "adjustmentJournalId" IS NOT NULL)
);

-- Expense claims: once submitted, claim-side content is immutable except
-- lifecycle/status columns — mirrors the invoice/bill pattern. Lines are
-- editable only while the parent claim is DRAFT, except approvedAmount,
-- which is written once during approval and is the one field allowed to
-- change on a non-draft claim's lines.
CREATE OR REPLACE FUNCTION finance_reject_submitted_claim_mutation() RETURNS trigger AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'A non-draft expense claim cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' THEN
    old_row := to_jsonb(OLD) - 'status' - 'totalApprovedAmount' - 'journalId' - 'approvedById' - 'approvedAt'
             - 'rejectedById' - 'rejectedAt' - 'rejectionReason' - 'postedById' - 'postedAt' - 'reimbursedAt'
             - 'updatedAt' - 'version';
    new_row := to_jsonb(NEW) - 'status' - 'totalApprovedAmount' - 'journalId' - 'approvedById' - 'approvedAt'
             - 'rejectedById' - 'rejectedAt' - 'rejectionReason' - 'postedById' - 'postedAt' - 'reimbursedAt'
             - 'updatedAt' - 'version';
    IF old_row IS DISTINCT FROM new_row THEN
      RAISE EXCEPTION 'A non-draft expense claim''s content is immutable';
    END IF;
    IF OLD."journalId" IS NOT NULL AND NEW."journalId" IS DISTINCT FROM OLD."journalId" THEN
      RAISE EXCEPTION 'An expense claim''s journal reference cannot be changed once set';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_expense_claims_submitted_immutable
  BEFORE UPDATE OR DELETE ON "finance_expense_claims"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_submitted_claim_mutation();

CREATE OR REPLACE FUNCTION finance_reject_submitted_claim_line_mutation() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
  old_row jsonb;
  new_row jsonb;
BEGIN
  SELECT "status" INTO parent_status FROM "finance_expense_claims" WHERE "id" = COALESCE(NEW."claimId", OLD."claimId");
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Lines of a non-draft expense claim cannot be deleted';
    END IF;
    old_row := to_jsonb(OLD) - 'approvedAmount';
    new_row := to_jsonb(NEW) - 'approvedAmount';
    IF old_row IS DISTINCT FROM new_row THEN
      RAISE EXCEPTION 'Lines of a non-draft expense claim are immutable except recording the approved amount';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_expense_lines_submitted_immutable
  BEFORE UPDATE OR DELETE ON "finance_expense_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_submitted_claim_line_mutation();

CREATE OR REPLACE FUNCTION finance_assert_expense_line_organization() RETURNS trigger AS $$
DECLARE
  account_org TEXT;
  category_org TEXT;
BEGIN
  SELECT "organizationKey" INTO account_org FROM "finance_accounts" WHERE "id" = NEW."accountId";
  IF account_org IS NULL OR account_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Expense line account must belong to the same organization';
  END IF;
  SELECT "organizationKey" INTO category_org FROM "finance_expense_categories" WHERE "id" = NEW."categoryId";
  IF category_org IS NULL OR category_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Expense line category must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_expense_lines_org_guard
  BEFORE INSERT OR UPDATE ON "finance_expense_lines"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_expense_line_organization();

-- Finalized (COMPLETED) reconciliation sessions are immutable; matches
-- belonging to a completed session are unconditionally append-only
-- (reversal is a new row, same pattern as receipt/payment allocations).
CREATE OR REPLACE FUNCTION finance_reject_completed_session_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'COMPLETED' THEN
      RAISE EXCEPTION 'A completed reconciliation session cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'COMPLETED' AND (
    NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."bankAccountId" IS DISTINCT FROM OLD."bankAccountId" OR
    NEW."statementId" IS DISTINCT FROM OLD."statementId" OR
    NEW."openingBalance" IS DISTINCT FROM OLD."openingBalance" OR
    NEW."closingBalance" IS DISTINCT FROM OLD."closingBalance" OR
    NEW."preparedById" IS DISTINCT FROM OLD."preparedById" OR
    NEW."completedById" IS DISTINCT FROM OLD."completedById" OR
    NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
  ) THEN
    RAISE EXCEPTION 'A completed reconciliation session is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_reconciliation_sessions_completed_immutable
  BEFORE UPDATE OR DELETE ON "finance_reconciliation_sessions"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_completed_session_mutation();

CREATE TRIGGER finance_reconciliation_matches_immutable
  BEFORE UPDATE OR DELETE ON "finance_reconciliation_matches"
  FOR EACH ROW EXECUTE FUNCTION finance_reject_ledger_mutation();
