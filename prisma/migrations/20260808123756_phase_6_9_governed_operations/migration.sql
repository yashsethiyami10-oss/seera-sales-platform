-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TAX_INVOICE', 'NON_TAX_INVOICE', 'PRO_FORMA_INVOICE', 'QUOTATION_DOCUMENT', 'RECEIPT', 'PAYMENT_RECEIPT', 'DELIVERY_CHALLAN', 'CREDIT_NOTE', 'DEBIT_NOTE', 'EXTERNAL_BILL', 'SUPPORTING_DOCUMENT', 'CLAIM_RETURN_DOCUMENT', 'PAYMENT_PROOF', 'ADJUSTMENT_DOCUMENT');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('SYSTEM_GENERATED', 'EXTERNAL_UPLOAD', 'ASSISTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED', 'VOID', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('INVOICE', 'PAYMENT', 'ADVANCE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'RETURN', 'CLAIM_ADJUSTMENT', 'OPENING_BALANCE', 'REVERSAL', 'ADJUSTMENT', 'EXPENSE', 'REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'MATCHED', 'PARTIALLY_MATCHED', 'EXCEPTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TaClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'MANAGER_VERIFIED', 'MANAGER_REJECTED', 'ACCOUNTS_APPROVED', 'ACCOUNTS_REJECTED', 'PAID', 'CLOSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PartnerLifecycleAction" AS ENUM ('SUSPEND', 'DEACTIVATE', 'CLOSE', 'FORCE_CLOSE', 'REACTIVATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PartnerLifecycle" ADD VALUE 'DEACTIVATED';
ALTER TYPE "PartnerLifecycle" ADD VALUE 'CLOSED';

-- CreateTable
CREATE TABLE "seera_billing_profiles" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT,
    "pan" TEXT,
    "registeredAddress" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "contact" JSONB,
    "invoicePrefix" TEXT NOT NULL,
    "authorizedBilling" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_document_sequences" (
    "id" TEXT NOT NULL,
    "issuerType" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "financialYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_commercial_documents" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "issuerType" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "buyerType" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "onBehalfOfPartyId" TEXT,
    "orderId" TEXT,
    "originalDocumentId" TEXT,
    "supersededById" TEXT,
    "issuerSnapshot" JSONB NOT NULL,
    "buyerSnapshot" JSONB NOT NULL,
    "supplySnapshot" JSONB NOT NULL,
    "lineSnapshot" JSONB NOT NULL,
    "taxSnapshot" JSONB NOT NULL,
    "subtotal" DECIMAL(16,2) NOT NULL,
    "taxableTotal" DECIMAL(16,2) NOT NULL,
    "cgstTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issueDate" TIMESTAMP(3),
    "paymentTermsSnapshot" JSONB,
    "externalFileId" TEXT,
    "generatedFileId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_commercial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_document_share_grants" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_document_share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_manager_instructions" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "assignedEmployeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_manager_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_accounting_periods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "lockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_financial_entries" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "type" "FinancialEntryType" NOT NULL,
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "debitPartyType" TEXT NOT NULL,
    "debitPartyId" TEXT NOT NULL,
    "creditPartyType" TEXT NOT NULL,
    "creditPartyId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "documentId" TEXT,
    "orderId" TEXT,
    "claimId" TEXT,
    "taClaimId" TEXT,
    "originalEntryId" TEXT,
    "accountingPeriodId" TEXT,
    "commercialSnapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_financial_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_payment_records" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "payerType" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "payeeType" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "amountClaimed" DECIMAL(16,2) NOT NULL,
    "amountMatched" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "unappliedAmount" DECIMAL(16,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "proofId" TEXT,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_credit_extensions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "originalDueDate" TIMESTAMP(3) NOT NULL,
    "extensionUntil" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvalId" TEXT,
    "financialEffect" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "seera_credit_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_financial_reconciliations" (
    "id" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "expectedAmount" DECIMAL(16,2) NOT NULL,
    "matchedAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(16,2) NOT NULL,
    "exceptionReason" TEXT,
    "actorId" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_financial_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_claim_settlements" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "approvedAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "rejectedAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "financialEntryId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_claim_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_travel_policies" (
    "id" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "ratePerKm" DECIMAL(12,2) NOT NULL,
    "fixedAllowance" DECIMAL(12,2),
    "dailyAllowance" DECIMAL(12,2),
    "eligibility" JSONB NOT NULL,
    "territoryId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_travel_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_travel_estimates" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workSessionId" TEXT NOT NULL,
    "estimateDate" TIMESTAMP(3) NOT NULL,
    "distanceKm" DECIMAL(12,3) NOT NULL,
    "sourceEvents" JSONB NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_travel_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_ta_claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "claimDate" TIMESTAMP(3) NOT NULL,
    "travelEstimateId" TEXT,
    "originalDistanceKm" DECIMAL(12,3) NOT NULL,
    "claimedDistanceKm" DECIMAL(12,3) NOT NULL,
    "approvedDistanceKm" DECIMAL(12,3),
    "vehicleType" TEXT NOT NULL,
    "rateSnapshot" JSONB NOT NULL,
    "travelAmount" DECIMAL(14,2) NOT NULL,
    "tollAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "parkingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dailyAllowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalClaimed" DECIMAL(14,2) NOT NULL,
    "totalApproved" DECIMAL(14,2),
    "deviationReason" TEXT,
    "remarks" TEXT,
    "proofFileIds" TEXT[],
    "status" "TaClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "managerVerifiedById" TEXT,
    "accountsApprovedById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_ta_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_partner_lifecycle_events" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "action" "PartnerLifecycleAction" NOT NULL,
    "fromLifecycle" "PartnerLifecycle" NOT NULL,
    "toLifecycle" "PartnerLifecycle" NOT NULL,
    "actorId" TEXT NOT NULL,
    "approverId" TEXT,
    "reason" TEXT NOT NULL,
    "obligationsSnapshot" JSONB NOT NULL,
    "restoredScope" JSONB,
    "forceClose" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_partner_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_billing_profiles_ownerType_ownerId_verificationStatus_idx" ON "seera_billing_profiles"("ownerType", "ownerId", "verificationStatus", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_billing_profiles_ownerType_ownerId_effectiveFrom_key" ON "seera_billing_profiles"("ownerType", "ownerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "seera_document_sequences_issuerType_issuerId_documentType_f_key" ON "seera_document_sequences"("issuerType", "issuerId", "documentType", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "seera_commercial_documents_idempotencyKey_key" ON "seera_commercial_documents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_commercial_documents_issuerType_issuerId_status_issue_idx" ON "seera_commercial_documents"("issuerType", "issuerId", "status", "issueDate");

-- CreateIndex
CREATE INDEX "seera_commercial_documents_buyerType_buyerId_status_issueDa_idx" ON "seera_commercial_documents"("buyerType", "buyerId", "status", "issueDate");

-- CreateIndex
CREATE INDEX "seera_commercial_documents_orderId_idx" ON "seera_commercial_documents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_commercial_documents_issuerType_issuerId_type_documen_key" ON "seera_commercial_documents"("issuerType", "issuerId", "type", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_document_share_grants_tokenHash_key" ON "seera_document_share_grants"("tokenHash");

-- CreateIndex
CREATE INDEX "seera_document_share_grants_documentId_expiresAt_revokedAt_idx" ON "seera_document_share_grants"("documentId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "seera_manager_instructions_managerId_status_dueAt_idx" ON "seera_manager_instructions"("managerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "seera_manager_instructions_assignedEmployeeId_status_dueAt_idx" ON "seera_manager_instructions"("assignedEmployeeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_accounting_periods_code_key" ON "seera_accounting_periods"("code");

-- CreateIndex
CREATE INDEX "seera_accounting_periods_startsAt_endsAt_lockedAt_idx" ON "seera_accounting_periods"("startsAt", "endsAt", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_financial_entries_entryNumber_key" ON "seera_financial_entries"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_financial_entries_idempotencyKey_key" ON "seera_financial_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_financial_entries_debitPartyType_debitPartyId_status__idx" ON "seera_financial_entries"("debitPartyType", "debitPartyId", "status", "postedAt");

-- CreateIndex
CREATE INDEX "seera_financial_entries_creditPartyType_creditPartyId_statu_idx" ON "seera_financial_entries"("creditPartyType", "creditPartyId", "status", "postedAt");

-- CreateIndex
CREATE INDEX "seera_financial_entries_documentId_status_idx" ON "seera_financial_entries"("documentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payment_records_paymentNumber_key" ON "seera_payment_records"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payment_records_idempotencyKey_key" ON "seera_payment_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_payment_records_reference_paymentDate_idx" ON "seera_payment_records"("reference", "paymentDate");

-- CreateIndex
CREATE INDEX "seera_payment_records_payerType_payerId_status_idx" ON "seera_payment_records"("payerType", "payerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seera_payment_allocations_idempotencyKey_key" ON "seera_payment_allocations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_payment_allocations_paymentId_status_idx" ON "seera_payment_allocations"("paymentId", "status");

-- CreateIndex
CREATE INDEX "seera_payment_allocations_documentId_status_idx" ON "seera_payment_allocations"("documentId", "status");

-- CreateIndex
CREATE INDEX "seera_credit_extensions_orderId_status_createdAt_idx" ON "seera_credit_extensions"("orderId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_financial_reconciliations_idempotencyKey_key" ON "seera_financial_reconciliations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_financial_reconciliations_status_createdAt_idx" ON "seera_financial_reconciliations"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_claim_settlements_claimId_key" ON "seera_claim_settlements"("claimId");

-- CreateIndex
CREATE INDEX "seera_travel_policies_effectiveFrom_effectiveTo_idx" ON "seera_travel_policies"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_travel_policies_vehicleType_territoryId_effectiveFrom_key" ON "seera_travel_policies"("vehicleType", "territoryId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seera_travel_estimates_employeeId_estimateDate_idx" ON "seera_travel_estimates"("employeeId", "estimateDate");

-- CreateIndex
CREATE UNIQUE INDEX "seera_travel_estimates_employeeId_workSessionId_key" ON "seera_travel_estimates"("employeeId", "workSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_ta_claims_claimNumber_key" ON "seera_ta_claims"("claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_ta_claims_idempotencyKey_key" ON "seera_ta_claims"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_ta_claims_employeeId_status_claimDate_idx" ON "seera_ta_claims"("employeeId", "status", "claimDate");

-- CreateIndex
CREATE INDEX "seera_ta_claims_managerId_status_claimDate_idx" ON "seera_ta_claims"("managerId", "status", "claimDate");

-- CreateIndex
CREATE UNIQUE INDEX "seera_partner_lifecycle_events_idempotencyKey_key" ON "seera_partner_lifecycle_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_partner_lifecycle_events_partnerId_occurredAt_idx" ON "seera_partner_lifecycle_events"("partnerId", "occurredAt");

-- AddForeignKey
ALTER TABLE "seera_document_share_grants" ADD CONSTRAINT "seera_document_share_grants_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "seera_commercial_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_payment_allocations" ADD CONSTRAINT "seera_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "seera_payment_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
