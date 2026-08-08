-- Milestone 7 — Manufacturing (Including Procurement). Purely additive: three
-- new StockChangeReason enum values, two new nullable columns on the
-- already-existing enterprise_batches table. No existing table, column, or
-- constraint is altered or dropped, and no Enterprise* model is redesigned.

-- AlterEnum
ALTER TYPE "StockChangeReason" ADD VALUE 'RAW_MATERIAL_RECEIPT';
ALTER TYPE "StockChangeReason" ADD VALUE 'RAW_MATERIAL_CONSUMPTION';
ALTER TYPE "StockChangeReason" ADD VALUE 'FINISHED_GOODS_PRODUCTION';

-- AlterTable
ALTER TABLE "enterprise_batches" ADD COLUMN     "finishedGoodsMovementId" TEXT,
ADD COLUMN     "transferredToInventoryAt" TIMESTAMP(3);
