-- Milestone 8 — Finance & Accounts. Purely additive: no table dropped, no
-- column altered/dropped, no frozen Part 3C migration edited. Two small,
-- disclosed extensions to frozen finance_customer_accounts/
-- finance_vendor_accounts/finance_fiscal_periods (new nullable columns for
-- credit control and posting cutoff, explicitly authorized by this
-- milestone's own approval — see schema.prisma's block-header note).
-- Everything else is new tables for the genuinely-missing Finance domains.

-- AlterTable
ALTER TABLE "finance_customer_accounts" ADD COLUMN     "creditHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditHoldOverrideById" TEXT,
ADD COLUMN     "creditHoldOverrideExpiresAt" TIMESTAMP(3),
ADD COLUMN     "creditHoldOverrideReason" TEXT,
ADD COLUMN     "creditHoldReason" TEXT,
ADD COLUMN     "creditHoldSetAt" TIMESTAMP(3),
ADD COLUMN     "paymentTermTemplateId" TEXT,
ADD COLUMN     "riskRating" TEXT,
ADD COLUMN     "temporaryCreditLimit" DECIMAL(18,2),
ADD COLUMN     "temporaryCreditLimitExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "finance_fiscal_periods" ADD COLUMN     "postingCutoffDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "finance_vendor_accounts" ADD COLUMN     "creditHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditHoldOverrideById" TEXT,
ADD COLUMN     "creditHoldReason" TEXT,
ADD COLUMN     "paymentTermTemplateId" TEXT,
ADD COLUMN     "riskRating" TEXT;

-- CreateTable
CREATE TABLE "finance_event_posting_rules" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEventAction" TEXT NOT NULL,
    "journalType" TEXT NOT NULL,
    "debitAccountCode" TEXT NOT NULL,
    "creditAccountCode" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_event_posting_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_event_processing_log" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEventAction" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "journalId" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_event_processing_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_credit_notes" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_credit_note_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unitPrice" DECIMAL(18,2),
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_credit_note_allocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allocatedById" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_credit_note_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_debit_notes" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "debitNoteNumber" TEXT NOT NULL,
    "vendorAccountId" TEXT NOT NULL,
    "billId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_debit_note_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unitPrice" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineAmount" DECIMAL(18,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_debit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_debit_note_allocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "debitNoteId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allocatedById" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_debit_note_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_asset_categories" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDepreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "defaultUsefulLifeMonths" INTEGER NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "depreciationExpenseAccountId" TEXT NOT NULL,
    "accumulatedDepreciationAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_fixed_assets" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "capitalizationDate" TIMESTAMP(3),
    "cost" DECIMAL(18,2) NOT NULL,
    "salvageValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "locationText" TEXT,
    "custodianId" TEXT,
    "costCenterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "accumulatedDepreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL(18,2) NOT NULL,
    "acquisitionJournalId" TEXT,
    "supportingDocumentRef" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_depreciation_entries" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "postedAmount" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "journalId" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_asset_disposals" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "disposalDate" TIMESTAMP(3) NOT NULL,
    "proceeds" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netBookValueAtDisposal" DECIMAL(18,2) NOT NULL,
    "gainLoss" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "journalId" TEXT,
    "approvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_asset_transfers" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromCostCenterId" TEXT,
    "toCostCenterId" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "transferredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_asset_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budgets" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "budgetNumber" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budget_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "profitCenterId" TEXT,
    "budgetedAmount" DECIMAL(18,2) NOT NULL,
    "committedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hardBlock" BOOLEAN NOT NULL DEFAULT false,
    "softWarningPercent" INTEGER NOT NULL DEFAULT 90,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_budget_revisions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_budget_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_batch_costs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "costingMethod" TEXT NOT NULL DEFAULT 'STANDARD',
    "directMaterialCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "directLaborCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "machineCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "utilityCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "qualityControlCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "normalWastageCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "abnormalWastageCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightInwardAllocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherLandedCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subcontractingCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costPerUnit" DECIMAL(18,4),
    "standardCostPerUnit" DECIMAL(18,4),
    "varianceAmount" DECIMAL(18,2),
    "journalId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_batch_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_cash_accounts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "isPettyCash" BOOLEAN NOT NULL DEFAULT false,
    "custodianId" TEXT,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_cash_vouchers" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "partyType" TEXT,
    "partyId" TEXT,
    "description" TEXT NOT NULL,
    "supportingDocumentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_cash_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_cash_verifications" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "verificationDate" TIMESTAMP(3) NOT NULL,
    "physicalCount" DECIMAL(18,2) NOT NULL,
    "bookBalance" DECIMAL(18,2) NOT NULL,
    "shortExcess" DECIMAL(18,2) NOT NULL,
    "verifiedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_cash_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_collection_cases" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "agingBucket" TEXT,
    "assignedCollectorId" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_collection_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_collection_activities" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "notes" TEXT,
    "promiseDate" TIMESTAMP(3),
    "promiseAmount" DECIMAL(18,2),
    "brokenPromise" BOOLEAN NOT NULL DEFAULT false,
    "communicationReference" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_collection_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_write_off_requests" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "journalId" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_write_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_approval_rules" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(18,2),
    "costCenterId" TEXT,
    "profitCenterId" TEXT,
    "dimensionCode" TEXT,
    "requiredRole" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_payment_term_templates" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termType" TEXT NOT NULL,
    "creditPeriodDays" INTEGER,
    "installments" JSONB,
    "earlyPaymentDiscountPercent" DECIMAL(6,3),
    "earlyPaymentDiscountDays" INTEGER,
    "latePaymentChargePercent" DECIMAL(6,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_payment_term_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_holiday_calendar" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_holiday_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_tax_jurisdictions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_tax_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_tax_types" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_tax_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_tax_rates" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "taxTypeId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ratePercent" DECIMAL(6,3) NOT NULL,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "isReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_audit_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_audit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_audit_findings" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "findingNumber" TEXT NOT NULL,
    "planId" TEXT,
    "area" TEXT NOT NULL,
    "procedureText" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "financialImpact" DECIMAL(18,2),
    "responsibleOwnerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "repeatFinding" BOOLEAN NOT NULL DEFAULT false,
    "controlFailure" BOOLEAN NOT NULL DEFAULT false,
    "policyDeviation" BOOLEAN NOT NULL DEFAULT false,
    "fraudRiskFlag" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRef" TEXT,
    "closureApprovedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_corrective_actions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_event_posting_rules_organizationKey_active_idx" ON "finance_event_posting_rules"("organizationKey", "active");

-- CreateIndex
CREATE UNIQUE INDEX "finance_event_posting_rules_organizationKey_sourceModule_so_key" ON "finance_event_posting_rules"("organizationKey", "sourceModule", "sourceEventAction");

-- CreateIndex
CREATE INDEX "finance_event_processing_log_organizationKey_status_idx" ON "finance_event_processing_log"("organizationKey", "status");

-- CreateIndex
CREATE INDEX "finance_event_processing_log_organizationKey_sourceModule_s_idx" ON "finance_event_processing_log"("organizationKey", "sourceModule", "sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_event_processing_log_organizationKey_idempotencyKey_key" ON "finance_event_processing_log"("organizationKey", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "finance_credit_notes_journalId_key" ON "finance_credit_notes"("journalId");

-- CreateIndex
CREATE INDEX "finance_credit_notes_organizationKey_customerAccountId_stat_idx" ON "finance_credit_notes"("organizationKey", "customerAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_credit_notes_organizationKey_creditNoteNumber_key" ON "finance_credit_notes"("organizationKey", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "finance_credit_note_lines_organizationKey_creditNoteId_line_key" ON "finance_credit_note_lines"("organizationKey", "creditNoteId", "lineNumber");

-- CreateIndex
CREATE INDEX "finance_credit_note_allocations_organizationKey_creditNoteI_idx" ON "finance_credit_note_allocations"("organizationKey", "creditNoteId");

-- CreateIndex
CREATE INDEX "finance_credit_note_allocations_organizationKey_invoiceId_idx" ON "finance_credit_note_allocations"("organizationKey", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_debit_notes_journalId_key" ON "finance_debit_notes"("journalId");

-- CreateIndex
CREATE INDEX "finance_debit_notes_organizationKey_vendorAccountId_status_idx" ON "finance_debit_notes"("organizationKey", "vendorAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_debit_notes_organizationKey_debitNoteNumber_key" ON "finance_debit_notes"("organizationKey", "debitNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "finance_debit_note_lines_organizationKey_debitNoteId_lineNu_key" ON "finance_debit_note_lines"("organizationKey", "debitNoteId", "lineNumber");

-- CreateIndex
CREATE INDEX "finance_debit_note_allocations_organizationKey_debitNoteId_idx" ON "finance_debit_note_allocations"("organizationKey", "debitNoteId");

-- CreateIndex
CREATE INDEX "finance_debit_note_allocations_organizationKey_billId_idx" ON "finance_debit_note_allocations"("organizationKey", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_categories_organizationKey_code_key" ON "finance_asset_categories"("organizationKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fixed_assets_acquisitionJournalId_key" ON "finance_fixed_assets"("acquisitionJournalId");

-- CreateIndex
CREATE INDEX "finance_fixed_assets_organizationKey_status_categoryId_idx" ON "finance_fixed_assets"("organizationKey", "status", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_fixed_assets_organizationKey_assetCode_key" ON "finance_fixed_assets"("organizationKey", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "finance_depreciation_entries_journalId_key" ON "finance_depreciation_entries"("journalId");

-- CreateIndex
CREATE INDEX "finance_depreciation_entries_organizationKey_fiscalPeriodId_idx" ON "finance_depreciation_entries"("organizationKey", "fiscalPeriodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_depreciation_entries_organizationKey_assetId_fiscal_key" ON "finance_depreciation_entries"("organizationKey", "assetId", "fiscalPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_disposals_assetId_key" ON "finance_asset_disposals"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_asset_disposals_journalId_key" ON "finance_asset_disposals"("journalId");

-- CreateIndex
CREATE INDEX "finance_asset_transfers_organizationKey_assetId_idx" ON "finance_asset_transfers"("organizationKey", "assetId");

-- CreateIndex
CREATE INDEX "finance_budgets_organizationKey_fiscalYearId_status_idx" ON "finance_budgets"("organizationKey", "fiscalYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_budgets_organizationKey_budgetNumber_key" ON "finance_budgets"("organizationKey", "budgetNumber");

-- CreateIndex
CREATE INDEX "finance_budget_lines_organizationKey_budgetId_idx" ON "finance_budget_lines"("organizationKey", "budgetId");

-- CreateIndex
CREATE INDEX "finance_budget_lines_organizationKey_fiscalPeriodId_account_idx" ON "finance_budget_lines"("organizationKey", "fiscalPeriodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_budget_revisions_organizationKey_budgetId_revisionN_key" ON "finance_budget_revisions"("organizationKey", "budgetId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "finance_batch_costs_batchId_key" ON "finance_batch_costs"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_batch_costs_journalId_key" ON "finance_batch_costs"("journalId");

-- CreateIndex
CREATE INDEX "finance_batch_costs_organizationKey_batchId_idx" ON "finance_batch_costs"("organizationKey", "batchId");

-- CreateIndex
CREATE INDEX "finance_cash_accounts_organizationKey_status_idx" ON "finance_cash_accounts"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cash_vouchers_journalId_key" ON "finance_cash_vouchers"("journalId");

-- CreateIndex
CREATE INDEX "finance_cash_vouchers_organizationKey_cashAccountId_status_idx" ON "finance_cash_vouchers"("organizationKey", "cashAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_cash_vouchers_organizationKey_voucherNumber_key" ON "finance_cash_vouchers"("organizationKey", "voucherNumber");

-- CreateIndex
CREATE INDEX "finance_cash_verifications_organizationKey_cashAccountId_ve_idx" ON "finance_cash_verifications"("organizationKey", "cashAccountId", "verificationDate");

-- CreateIndex
CREATE INDEX "finance_collection_cases_organizationKey_status_assignedCol_idx" ON "finance_collection_cases"("organizationKey", "status", "assignedCollectorId");

-- CreateIndex
CREATE INDEX "finance_collection_cases_organizationKey_customerAccountId_idx" ON "finance_collection_cases"("organizationKey", "customerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_collection_cases_organizationKey_caseNumber_key" ON "finance_collection_cases"("organizationKey", "caseNumber");

-- CreateIndex
CREATE INDEX "finance_collection_activities_organizationKey_caseId_idx" ON "finance_collection_activities"("organizationKey", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_write_off_requests_journalId_key" ON "finance_write_off_requests"("journalId");

-- CreateIndex
CREATE INDEX "finance_write_off_requests_organizationKey_caseId_status_idx" ON "finance_write_off_requests"("organizationKey", "caseId", "status");

-- CreateIndex
CREATE INDEX "finance_approval_rules_organizationKey_transactionType_acti_idx" ON "finance_approval_rules"("organizationKey", "transactionType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "finance_payment_term_templates_organizationKey_code_key" ON "finance_payment_term_templates"("organizationKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_holiday_calendar_organizationKey_date_key" ON "finance_holiday_calendar"("organizationKey", "date");

-- CreateIndex
CREATE UNIQUE INDEX "finance_tax_jurisdictions_organizationKey_code_key" ON "finance_tax_jurisdictions"("organizationKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_tax_types_organizationKey_code_key" ON "finance_tax_types"("organizationKey", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_tax_rates_organizationKey_taxTypeId_jurisdictionId__key" ON "finance_tax_rates"("organizationKey", "taxTypeId", "jurisdictionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_audit_plans_organizationKey_planNumber_key" ON "finance_audit_plans"("organizationKey", "planNumber");

-- CreateIndex
CREATE INDEX "finance_audit_findings_organizationKey_status_severity_idx" ON "finance_audit_findings"("organizationKey", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "finance_audit_findings_organizationKey_findingNumber_key" ON "finance_audit_findings"("organizationKey", "findingNumber");

-- CreateIndex
CREATE INDEX "finance_corrective_actions_organizationKey_findingId_idx" ON "finance_corrective_actions"("organizationKey", "findingId");

-- AddForeignKey
ALTER TABLE "finance_credit_note_lines" ADD CONSTRAINT "finance_credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "finance_credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_credit_note_allocations" ADD CONSTRAINT "finance_credit_note_allocations_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "finance_credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_debit_note_lines" ADD CONSTRAINT "finance_debit_note_lines_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "finance_debit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_debit_note_allocations" ADD CONSTRAINT "finance_debit_note_allocations_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "finance_debit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_fixed_assets" ADD CONSTRAINT "finance_fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_depreciation_entries" ADD CONSTRAINT "finance_depreciation_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "finance_fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_disposals" ADD CONSTRAINT "finance_asset_disposals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "finance_fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_asset_transfers" ADD CONSTRAINT "finance_asset_transfers_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "finance_fixed_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_lines" ADD CONSTRAINT "finance_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "finance_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_budget_revisions" ADD CONSTRAINT "finance_budget_revisions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "finance_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_cash_vouchers" ADD CONSTRAINT "finance_cash_vouchers_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "finance_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_cash_verifications" ADD CONSTRAINT "finance_cash_verifications_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "finance_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_collection_activities" ADD CONSTRAINT "finance_collection_activities_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "finance_collection_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_write_off_requests" ADD CONSTRAINT "finance_write_off_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "finance_collection_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_tax_rates" ADD CONSTRAINT "finance_tax_rates_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "finance_tax_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_tax_rates" ADD CONSTRAINT "finance_tax_rates_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "finance_tax_jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_audit_findings" ADD CONSTRAINT "finance_audit_findings_planId_fkey" FOREIGN KEY ("planId") REFERENCES "finance_audit_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_corrective_actions" ADD CONSTRAINT "finance_corrective_actions_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "finance_audit_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
