-- Milestone 6 — Dispatch & Delivery. Purely additive: one new enum, six new
-- nullable columns on business_orders, two new nullable FKs to users. No
-- existing column, table, or constraint is altered or dropped.

-- CreateEnum
CREATE TYPE "BusinessOrderDispatchMethod" AS ENUM ('COURIER', 'SELF_DELIVERY', 'TRANSPORT');

-- AlterTable
ALTER TABLE "business_orders" ADD COLUMN     "deliveredById" TEXT,
ADD COLUMN     "deliveryConfirmation" TEXT,
ADD COLUMN     "deliveryRemarks" TEXT,
ADD COLUMN     "dispatchMethod" "BusinessOrderDispatchMethod",
ADD COLUMN     "dispatchNotes" TEXT,
ADD COLUMN     "dispatchedById" TEXT;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
