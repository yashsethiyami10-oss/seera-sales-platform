-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmployeeDocumentType" AS ENUM ('SALARY_SLIP', 'POLICY');

-- CreateEnum
CREATE TYPE "FinanceAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TreasuryAccountKind" AS ENUM ('BANK', 'CASH');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('MANUAL', 'OPENING_BALANCE', 'SALES_INVOICE', 'SALES_RECEIPT', 'SALES_ADVANCE', 'SALES_CREDIT_NOTE', 'SALES_DEBIT_NOTE', 'VENDOR_BILL', 'VENDOR_PAYMENT', 'EXPENSE', 'PAYROLL', 'TRANSFER', 'RECONCILIATION_ADJUSTMENT', 'REVERSAL', 'LOAN_RECEIVED', 'LOAN_REPAYMENT', 'CAPITAL_INTRODUCED', 'DRAWINGS', 'ASSET_PURCHASE');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "FinanceApprovalCategory" AS ENUM ('EXPENSE', 'VENDOR_BILL', 'PAYMENT', 'MANUAL_JOURNAL', 'REVERSAL', 'LARGE_CASH_TXN', 'PERIOD_REOPEN');

-- CreateEnum
CREATE TYPE "LoanTransactionType" AS ENUM ('DISBURSEMENT', 'PRINCIPAL_REPAYMENT', 'INTEREST_PAYMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "DocumentStatus" ADD VALUE 'REJECTED';
ALTER TYPE "DocumentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "DocumentStatus" ADD VALUE 'CONVERTED';

-- DropIndex
DROP INDEX "seera_retailers_normalizedMobile_businessName_key";

-- AlterTable
ALTER TABLE "seera_retailers" ADD COLUMN     "alternateMobile" TEXT,
ADD COLUMN     "customerType" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PLANNED',
ALTER COLUMN "ownerName" DROP NOT NULL,
ALTER COLUMN "mobile" DROP NOT NULL,
ALTER COLUMN "normalizedMobile" SET DEFAULT '',
ALTER COLUMN "shopType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "seera_prospects" ADD COLUMN     "alternateMobile" TEXT,
ADD COLUMN     "existingBrands" TEXT,
ADD COLUMN     "expectedVolume" TEXT,
ADD COLUMN     "geographyType" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sampleDetails" TEXT,
ADD COLUMN     "sampleGiven" BOOLEAN,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "seera_work_sessions" ADD COLUMN     "endExceptionReason" TEXT,
ADD COLUMN     "hqId" TEXT,
ADD COLUMN     "returnedToHq" BOOLEAN,
ADD COLUMN     "startExceptionReason" TEXT,
ADD COLUMN     "startInsideGeofence" BOOLEAN;

-- AlterTable
ALTER TABLE "seera_visits" ADD COLUMN     "checkInAccuracy" DECIMAL(10,2),
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "partnerType" TEXT,
ADD COLUMN     "partnerVisitPurpose" TEXT,
ADD COLUMN     "photoExceptionReason" TEXT,
ADD COLUMN     "routeDeviationReason" TEXT,
ADD COLUMN     "skipReason" TEXT;

-- AlterTable
ALTER TABLE "seera_joint_work" ADD COLUMN     "objective" TEXT;

-- AlterTable
ALTER TABLE "seera_sales_orders" ADD COLUMN     "commercialPaymentType" TEXT;

-- AlterTable
ALTER TABLE "seera_deliveries" ADD COLUMN     "challanNumber" TEXT,
ADD COLUMN     "driverMobile" TEXT,
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "eta" TIMESTAMP(3),
ADD COLUMN     "invoiceDocumentId" TEXT,
ADD COLUMN     "lrNumber" TEXT,
ADD COLUMN     "transporterName" TEXT,
ADD COLUMN     "vehicleNumber" TEXT;

-- AlterTable
ALTER TABLE "seera_journey_plans" ADD COLUMN     "beatId" TEXT,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "distributorId" TEXT,
ADD COLUMN     "distributorNameSnapshot" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "territoryId" TEXT;

-- AlterTable
ALTER TABLE "seera_commercial_documents" ADD COLUMN     "convertedOrderId" TEXT,
ADD COLUMN     "duplicatedFromId" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseReason" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "seera_ta_claims" ADD COLUMN     "fromLocation" TEXT,
ADD COLUMN     "hotelAmount" DECIMAL(14,2),
ADD COLUMN     "hotelBillFileId" TEXT,
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "hotelStay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otherExpenseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherExpenseNote" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "toLocation" TEXT;

-- CreateTable
CREATE TABLE "seera_gps_samples" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(10,2),
    "source" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "trackingStatus" TEXT NOT NULL,

    CONSTRAINT "seera_gps_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_hq_configurations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "radiusMeters" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_hq_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_visit_photos" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "retailerId" TEXT,
    "actorId" TEXT NOT NULL,
    "photoType" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deleteReason" TEXT,

    CONSTRAINT "seera_visit_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_follow_ups" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "retailerId" TEXT,
    "prospectId" TEXT,
    "visitId" TEXT,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmployeeDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "periodLabel" TEXT,
    "fileId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_return_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "partyType" "InventoryPartyType" NOT NULL,
    "partyId" TEXT NOT NULL,
    "retailerId" TEXT,
    "sourceOrderId" TEXT,
    "skuId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "condition" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "creditNoteRequested" BOOLEAN NOT NULL DEFAULT false,
    "decisionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "movementId" TEXT,
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_distributor_reassignment_events" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "fromSuperStockistId" TEXT,
    "toSuperStockistId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_distributor_reassignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinanceAccountType" NOT NULL,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_financial_dimensions" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_financial_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_treasury_accounts" (
    "id" TEXT NOT NULL,
    "kind" "TreasuryAccountKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountType" TEXT,
    "maskedAccountNumber" TEXT,
    "ifsc" TEXT,
    "chartOfAccountId" TEXT NOT NULL,
    "openingBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_treasury_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_journal_entries" (
    "id" TEXT NOT NULL,
    "journalNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accountingPeriodId" TEXT,
    "sourceType" "JournalSourceType" NOT NULL,
    "sourceId" TEXT,
    "narration" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "reason" TEXT,
    "originalJournalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_journal_lines" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "partyType" TEXT,
    "partyId" TEXT,
    "dimensionId" TEXT,
    "treasuryAccountId" TEXT,
    "description" TEXT,

    CONSTRAINT "seera_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_vendors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "state" TEXT,
    "stateCode" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_vendor_bills" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "vendorInvoiceNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "taxable" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(16,2) NOT NULL,
    "paidAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
    "dimensionId" TEXT,
    "documentFileId" TEXT,
    "journalId" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_vendor_payments" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "billId" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "reference" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "journalId" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_expense_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "seera_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_expenses" (
    "id" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeId" TEXT,
    "payeeName" TEXT,
    "categoryId" TEXT NOT NULL,
    "dimensionId" TEXT,
    "paymentMode" TEXT NOT NULL,
    "treasuryAccountId" TEXT,
    "gstTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "description" TEXT,
    "documentFileId" TEXT,
    "isReimbursable" BOOLEAN NOT NULL DEFAULT false,
    "employeeId" TEXT,
    "recurringTemplateId" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvalReason" TEXT,
    "journalId" TEXT,
    "vendorPayableJournalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_recurring_expense_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "payeeName" TEXT,
    "expectedAmount" DECIMAL(16,2) NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_recurring_expense_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "dimensionId" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "seera_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_loans" (
    "id" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principal" DECIMAL(16,2) NOT NULL,
    "outstanding" DECIMAL(16,2) NOT NULL,
    "interestRate" DECIMAL(6,3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "documentFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_loan_transactions" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "type" "LoanTransactionType" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "journalId" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_loan_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_fixed_assets" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "cost" DECIMAL(16,2) NOT NULL,
    "vendorId" TEXT,
    "location" TEXT,
    "documentFileId" TEXT,
    "usefulLifeMonths" INTEGER,
    "residualValue" DECIMAL(16,2),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "journalId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_bank_statement_imports" (
    "id" TEXT NOT NULL,
    "treasuryAccountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_bank_statement_lines" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(16,2),
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedJournalLineId" TEXT,

    CONSTRAINT "seera_bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_payroll_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "allowances" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "incentives" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approvedTaDa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reimbursements" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "treasuryAccountId" TEXT,
    "journalId" TEXT,
    "paymentDate" TIMESTAMP(3),
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_finance_approval_policies" (
    "id" TEXT NOT NULL,
    "category" "FinanceApprovalCategory" NOT NULL,
    "thresholdAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_finance_approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_gps_samples_employeeId_capturedAt_idx" ON "seera_gps_samples"("employeeId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_gps_samples_workSessionId_sequence_key" ON "seera_gps_samples"("workSessionId", "sequence");

-- CreateIndex
CREATE INDEX "seera_hq_configurations_status_effectiveFrom_effectiveTo_idx" ON "seera_hq_configurations"("status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "seera_visit_photos_visitId_idx" ON "seera_visit_photos"("visitId");

-- CreateIndex
CREATE INDEX "seera_visit_photos_retailerId_capturedAt_idx" ON "seera_visit_photos"("retailerId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_follow_ups_idempotencyKey_key" ON "seera_follow_ups"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_follow_ups_ownerId_status_dueDate_idx" ON "seera_follow_ups"("ownerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "seera_follow_ups_retailerId_status_idx" ON "seera_follow_ups"("retailerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_employee_documents_idempotencyKey_key" ON "seera_employee_documents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_employee_documents_employeeId_type_createdAt_idx" ON "seera_employee_documents"("employeeId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_return_requests_requestNumber_key" ON "seera_return_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_return_requests_idempotencyKey_key" ON "seera_return_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_return_requests_partyType_partyId_status_idx" ON "seera_return_requests"("partyType", "partyId", "status");

-- CreateIndex
CREATE INDEX "seera_return_requests_retailerId_status_idx" ON "seera_return_requests"("retailerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_distributor_reassignment_events_idempotencyKey_key" ON "seera_distributor_reassignment_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_distributor_reassignment_events_distributorId_occurre_idx" ON "seera_distributor_reassignment_events"("distributorId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_chart_of_accounts_code_key" ON "seera_chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "seera_chart_of_accounts_type_isActive_idx" ON "seera_chart_of_accounts"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "seera_financial_dimensions_kind_code_key" ON "seera_financial_dimensions"("kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_treasury_accounts_code_key" ON "seera_treasury_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_treasury_accounts_chartOfAccountId_key" ON "seera_treasury_accounts"("chartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_journal_entries_journalNumber_key" ON "seera_journal_entries"("journalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_journal_entries_idempotencyKey_key" ON "seera_journal_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_journal_entries_sourceType_sourceId_idx" ON "seera_journal_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "seera_journal_entries_accountingPeriodId_status_idx" ON "seera_journal_entries"("accountingPeriodId", "status");

-- CreateIndex
CREATE INDEX "seera_journal_entries_date_status_idx" ON "seera_journal_entries"("date", "status");

-- CreateIndex
CREATE INDEX "seera_journal_lines_journalId_idx" ON "seera_journal_lines"("journalId");

-- CreateIndex
CREATE INDEX "seera_journal_lines_accountId_journalId_idx" ON "seera_journal_lines"("accountId", "journalId");

-- CreateIndex
CREATE INDEX "seera_journal_lines_treasuryAccountId_idx" ON "seera_journal_lines"("treasuryAccountId");

-- CreateIndex
CREATE INDEX "seera_journal_lines_partyType_partyId_idx" ON "seera_journal_lines"("partyType", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendors_code_key" ON "seera_vendors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendor_bills_billNumber_key" ON "seera_vendor_bills"("billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendor_bills_idempotencyKey_key" ON "seera_vendor_bills"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_vendor_bills_status_dueDate_idx" ON "seera_vendor_bills"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendor_bills_vendorId_vendorInvoiceNumber_key" ON "seera_vendor_bills"("vendorId", "vendorInvoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendor_payments_paymentNumber_key" ON "seera_vendor_payments"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_vendor_payments_idempotencyKey_key" ON "seera_vendor_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_vendor_payments_vendorId_paymentDate_idx" ON "seera_vendor_payments"("vendorId", "paymentDate");

-- CreateIndex
CREATE INDEX "seera_vendor_payments_billId_idx" ON "seera_vendor_payments"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_expense_categories_code_key" ON "seera_expense_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seera_expenses_expenseNumber_key" ON "seera_expenses"("expenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_expenses_idempotencyKey_key" ON "seera_expenses"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_expenses_status_date_idx" ON "seera_expenses"("status", "date");

-- CreateIndex
CREATE INDEX "seera_expenses_employeeId_idx" ON "seera_expenses"("employeeId");

-- CreateIndex
CREATE INDEX "seera_budget_lines_budgetId_idx" ON "seera_budget_lines"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_loan_transactions_idempotencyKey_key" ON "seera_loan_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_loan_transactions_loanId_date_idx" ON "seera_loan_transactions"("loanId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "seera_fixed_assets_assetCode_key" ON "seera_fixed_assets"("assetCode");

-- CreateIndex
CREATE INDEX "seera_bank_statement_lines_importId_matchStatus_idx" ON "seera_bank_statement_lines"("importId", "matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payroll_entries_idempotencyKey_key" ON "seera_payroll_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_payroll_entries_month_status_idx" ON "seera_payroll_entries"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payroll_entries_employeeId_month_key" ON "seera_payroll_entries"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "seera_finance_approval_policies_category_key" ON "seera_finance_approval_policies"("category");

-- CreateIndex
CREATE INDEX "seera_retailers_normalizedMobile_businessName_idx" ON "seera_retailers"("normalizedMobile", "businessName");

-- CreateIndex
CREATE INDEX "seera_prospects_ownerEmployeeId_stage_idx" ON "seera_prospects"("ownerEmployeeId", "stage");

-- CreateIndex
CREATE INDEX "seera_journey_plans_status_effectiveFrom_idx" ON "seera_journey_plans"("status", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "seera_gps_samples" ADD CONSTRAINT "seera_gps_samples_workSessionId_fkey" FOREIGN KEY ("workSessionId") REFERENCES "seera_work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_visit_photos" ADD CONSTRAINT "seera_visit_photos_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "seera_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_journal_lines" ADD CONSTRAINT "seera_journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "seera_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_vendor_bills" ADD CONSTRAINT "seera_vendor_bills_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "seera_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_budget_lines" ADD CONSTRAINT "seera_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "seera_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_loan_transactions" ADD CONSTRAINT "seera_loan_transactions_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "seera_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_bank_statement_lines" ADD CONSTRAINT "seera_bank_statement_lines_importId_fkey" FOREIGN KEY ("importId") REFERENCES "seera_bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

