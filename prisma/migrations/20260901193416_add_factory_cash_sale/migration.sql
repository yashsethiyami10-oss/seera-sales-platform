-- CreateTable
CREATE TABLE "seera_factory_cash_sales" (
    "id" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "partyName" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_factory_cash_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_factory_cash_sales_saleDate_idx" ON "seera_factory_cash_sales"("saleDate");

-- CreateIndex
CREATE INDEX "seera_factory_cash_sales_createdById_createdAt_idx" ON "seera_factory_cash_sales"("createdById", "createdAt");
