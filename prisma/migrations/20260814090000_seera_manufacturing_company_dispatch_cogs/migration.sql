-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'COGS_RECOGNITION';

-- CreateTable
CREATE TABLE "seera_mfg_company_dispatch_allocations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(16,4),
    "costConfidence" "CostConfidence" NOT NULL DEFAULT 'UNAVAILABLE',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_mfg_company_dispatch_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seera_mfg_company_dispatch_allocations_idempotencyKey_key" ON "seera_mfg_company_dispatch_allocations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_mfg_company_dispatch_allocations_receiptId_idx" ON "seera_mfg_company_dispatch_allocations"("receiptId");

-- CreateIndex
CREATE INDEX "seera_mfg_company_dispatch_allocations_orderId_idx" ON "seera_mfg_company_dispatch_allocations"("orderId");

-- CreateIndex
CREATE INDEX "seera_mfg_company_dispatch_allocations_skuId_idx" ON "seera_mfg_company_dispatch_allocations"("skuId");

