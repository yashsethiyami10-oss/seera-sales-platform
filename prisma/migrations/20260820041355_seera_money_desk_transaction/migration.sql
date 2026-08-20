-- CreateEnum
CREATE TYPE "MoneyDeskDirection" AS ENUM ('CASH_IN', 'CASH_OUT', 'BANK_IN', 'BANK_OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MoneyDeskStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'POSTING', 'POSTED', 'REJECTED', 'VOIDED');

-- AlterTable
ALTER TABLE "seera_return_requests" ADD COLUMN     "refundJournalId" TEXT;

-- AlterTable
ALTER TABLE "seera_vendor_bills" ADD COLUMN     "sourceGrnId" TEXT;

-- CreateTable
CREATE TABLE "seera_money_desk_transactions" (
    "id" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "purposeCode" TEXT NOT NULL,
    "direction" "MoneyDeskDirection" NOT NULL,
    "status" "MoneyDeskStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(16,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "treasuryAccountId" TEXT,
    "counterpartyType" TEXT,
    "counterpartyId" TEXT,
    "counterpartyName" TEXT,
    "description" TEXT,
    "documentFileId" TEXT,
    "formData" JSONB NOT NULL,
    "downstreamRefs" JSONB,
    "failureReason" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_money_desk_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seera_money_desk_transactions_transactionNumber_key" ON "seera_money_desk_transactions"("transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "seera_money_desk_transactions_idempotencyKey_key" ON "seera_money_desk_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_money_desk_transactions_status_createdAt_idx" ON "seera_money_desk_transactions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "seera_money_desk_transactions_purposeCode_createdAt_idx" ON "seera_money_desk_transactions"("purposeCode", "createdAt");
