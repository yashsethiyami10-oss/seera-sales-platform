-- AlterTable
ALTER TABLE "seera_factory_cash_sales" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "seera_factory_cash_sales_idempotencyKey_key" ON "seera_factory_cash_sales"("idempotencyKey");
