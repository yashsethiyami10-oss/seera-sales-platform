-- Milestone 5 — Operations Foundation.
-- Purely additive: one nullable column + FK on business_orders, one
-- nullable column + FK + unique index on inventory_reservations (the
-- existing orderId column becomes nullable too, so a reservation can now
-- belong to either the general-commerce Order or a BusinessOrder — the
-- existing @@unique([orderId, variantId]) is untouched and still enforces
-- "one reservation per variant" for Order-owned rows, since Postgres
-- treats multiple NULLs as distinct under that index).

-- AlterTable
ALTER TABLE "business_orders" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "inventory_reservations" ADD COLUMN     "businessOrderId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "business_orders_warehouseId_idx" ON "business_orders"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_businessOrderId_variantId_key" ON "inventory_reservations"("businessOrderId", "variantId");

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_businessOrderId_fkey" FOREIGN KEY ("businessOrderId") REFERENCES "business_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
