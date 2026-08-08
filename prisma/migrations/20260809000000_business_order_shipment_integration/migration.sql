-- MUV Platform — Sales OS Separation, Phase 10.0, Block 3, Part D.
-- Founder-approved integration #3: BusinessOrder -> Shipment.
--
-- Relaxes Shipment.orderId/provider to optional and adds a new optional,
-- unique businessOrderId so one Shipment/ShipmentEvent model can track
-- fulfillment for BOTH the D2C Order track (unchanged behavior — every
-- existing row keeps its non-null orderId/provider) and the new B2B
-- BusinessOrder track (provider stays null there — no real courier-API
-- provider exists for a SELF_DELIVERY/TRANSPORT dispatch; courierName/
-- awbNumber, both pre-existing free-text columns, carry that case).

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "businessOrderId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "provider" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_businessOrderId_key" ON "shipments"("businessOrderId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_businessOrderId_fkey" FOREIGN KEY ("businessOrderId") REFERENCES "business_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application-level invariant Prisma's schema syntax can't express (the
-- same precedent this schema already uses for the BusinessOrder
-- DIRECT_LEAD partial-unique-index rule): a Shipment belongs to exactly
-- one of Order or BusinessOrder, never both and never neither.
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_exactly_one_order_ref"
  CHECK (("orderId" IS NOT NULL AND "businessOrderId" IS NULL) OR ("orderId" IS NULL AND "businessOrderId" IS NOT NULL));
