-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3C, Wave 1 (Finance Foundation)
-- Additive only. No existing table, column, index, or constraint is dropped,
-- renamed, or altered. Journal/ledger/posting/AR/AP/expense/banking domain
-- tables are reserved for later waves of this same Part 3C.

-- CreateTable
CREATE TABLE "finance_configurations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "accountingTimezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 4,
    "retainedEarningsAccountId" TEXT,
    "arControlAccountId" TEXT,
    "apControlAccountId" TEXT,
    "inputTaxControlAccountId" TEXT,
    "outputTaxControlAccountId" TEXT,
    "defaultCashAccountId" TEXT,
    "defaultBankAccountId" TEXT,
    "roundingAccountId" TEXT,
    "defaultExpensePayableAccountId" TEXT,
    "postingPolicyVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_fiscal_years" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_fiscal_periods" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_cost_centers" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_profit_centers" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_profit_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_accounts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "subtype" TEXT,
    "normalBalance" TEXT NOT NULL,
    "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
    "postingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "hierarchyLevel" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "financialStatementClassification" TEXT,
    "cashFlowClassification" TEXT,
    "taxRelevant" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_configurations_organizationKey_key" ON "finance_configurations"("organizationKey");

-- CreateIndex
CREATE INDEX "finance_fiscal_years_organizationKey_status_idx" ON "finance_fiscal_years"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fiscal_years_organizationKey_code_key" ON "finance_fiscal_years"("organizationKey", "code");

-- CreateIndex
CREATE INDEX "finance_fiscal_periods_organizationKey_status_startDate_idx" ON "finance_fiscal_periods"("organizationKey", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fiscal_periods_organizationKey_fiscalYearId_periodN_key" ON "finance_fiscal_periods"("organizationKey", "fiscalYearId", "periodNumber");

-- CreateIndex
CREATE INDEX "finance_cost_centers_organizationKey_status_idx" ON "finance_cost_centers"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cost_centers_organizationKey_code_key" ON "finance_cost_centers"("organizationKey", "code");

-- CreateIndex
CREATE INDEX "finance_profit_centers_organizationKey_status_idx" ON "finance_profit_centers"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_profit_centers_organizationKey_code_key" ON "finance_profit_centers"("organizationKey", "code");

-- CreateIndex
CREATE INDEX "finance_accounts_organizationKey_status_category_idx" ON "finance_accounts"("organizationKey", "status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "finance_accounts_organizationKey_accountCode_key" ON "finance_accounts"("organizationKey", "accountCode");

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_retainedEarningsAccountId_fkey" FOREIGN KEY ("retainedEarningsAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_arControlAccountId_fkey" FOREIGN KEY ("arControlAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_apControlAccountId_fkey" FOREIGN KEY ("apControlAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_inputTaxControlAccountId_fkey" FOREIGN KEY ("inputTaxControlAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_outputTaxControlAccountId_fkey" FOREIGN KEY ("outputTaxControlAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_defaultCashAccountId_fkey" FOREIGN KEY ("defaultCashAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_defaultBankAccountId_fkey" FOREIGN KEY ("defaultBankAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_roundingAccountId_fkey" FOREIGN KEY ("roundingAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_defaultExpensePayableAccountId_fkey" FOREIGN KEY ("defaultExpensePayableAccountId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_fiscal_periods" ADD CONSTRAINT "finance_fiscal_periods_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "finance_fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_cost_centers" ADD CONSTRAINT "finance_cost_centers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "finance_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_profit_centers" ADD CONSTRAINT "finance_profit_centers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "finance_profit_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "finance_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (trusted User references — matches Phase 1's enterprise_* convention)
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_configurations" ADD CONSTRAINT "finance_configurations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_fiscal_years" ADD CONSTRAINT "finance_fiscal_years_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_fiscal_periods" ADD CONSTRAINT "finance_fiscal_periods_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_fiscal_periods" ADD CONSTRAINT "finance_fiscal_periods_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_cost_centers" ADD CONSTRAINT "finance_cost_centers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_profit_centers" ADD CONSTRAINT "finance_profit_centers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organization-consistent hierarchy: a Chart of Accounts / cost center /
-- profit center parent must belong to the same organization as its child.
-- Enforced at the database level, not service-only, per Section 31.
CREATE OR REPLACE FUNCTION finance_assert_same_organization_parent() RETURNS trigger AS $$
DECLARE
  parent_org TEXT;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'finance_cost_centers' THEN
    SELECT "organizationKey" INTO parent_org FROM "finance_cost_centers" WHERE "id" = NEW."parentId";
  ELSIF TG_TABLE_NAME = 'finance_profit_centers' THEN
    SELECT "organizationKey" INTO parent_org FROM "finance_profit_centers" WHERE "id" = NEW."parentId";
  ELSIF TG_TABLE_NAME = 'finance_accounts' THEN
    SELECT "organizationKey" INTO parent_org FROM "finance_accounts" WHERE "id" = NEW."parentId";
  END IF;
  IF parent_org IS NOT NULL AND parent_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Cross-organization parent relationship is not permitted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finance_cost_centers_org_guard
  BEFORE INSERT OR UPDATE ON "finance_cost_centers"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_same_organization_parent();

CREATE TRIGGER finance_profit_centers_org_guard
  BEFORE INSERT OR UPDATE ON "finance_profit_centers"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_same_organization_parent();

CREATE TRIGGER finance_accounts_org_guard
  BEFORE INSERT OR UPDATE ON "finance_accounts"
  FOR EACH ROW EXECUTE FUNCTION finance_assert_same_organization_parent();

-- A parent may not reference itself directly (immediate self-parenting).
-- Multi-level cycles are additionally rejected at the Business Service
-- layer (breadth-first ancestor walk) before any write reaches this table,
-- matching the existing NetworkPartnerHierarchy precedent.
ALTER TABLE "finance_cost_centers" ADD CONSTRAINT "finance_cost_centers_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "finance_profit_centers" ADD CONSTRAINT "finance_profit_centers_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_no_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- Non-negative, valid date ranges.
ALTER TABLE "finance_fiscal_years" ADD CONSTRAINT "finance_fiscal_years_valid_range" CHECK ("endDate" > "startDate");
ALTER TABLE "finance_fiscal_periods" ADD CONSTRAINT "finance_fiscal_periods_valid_range" CHECK ("endDate" > "startDate");
