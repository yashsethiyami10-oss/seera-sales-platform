-- CreateEnum
CREATE TYPE "BusinessOrderSource" AS ENUM ('D2C', 'INSTITUTIONAL');

-- CreateEnum
CREATE TYPE "BusinessOrderStatus" AS ENUM ('CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InstEntityType" ADD VALUE 'ORDER';

-- CreateTable
CREATE TABLE "business_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "source" "BusinessOrderSource" NOT NULL DEFAULT 'INSTITUTIONAL',
    "quotationVersionId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "customerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "territoryId" TEXT,
    "status" "BusinessOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "deliveryAddress" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "carrierName" TEXT,
    "trackingReference" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "lineTotal" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "business_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_orders_quotationVersionId_key" ON "business_orders"("quotationVersionId");

-- CreateIndex
CREATE INDEX "business_orders_organizationKey_status_idx" ON "business_orders"("organizationKey", "status");

-- CreateIndex
CREATE INDEX "business_orders_organizationKey_customerId_idx" ON "business_orders"("organizationKey", "customerId");

-- CreateIndex
CREATE INDEX "business_orders_organizationKey_ownerId_status_idx" ON "business_orders"("organizationKey", "ownerId", "status");

-- CreateIndex
CREATE INDEX "business_orders_organizationKey_territoryId_idx" ON "business_orders"("organizationKey", "territoryId");

-- CreateIndex
CREATE INDEX "business_orders_opportunityId_idx" ON "business_orders"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "business_orders_organizationKey_orderNumber_key" ON "business_orders"("organizationKey", "orderNumber");

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_quotationVersionId_fkey" FOREIGN KEY ("quotationVersionId") REFERENCES "inst_quotation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "inst_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_orders" ADD CONSTRAINT "business_orders_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_order_items" ADD CONSTRAINT "business_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "business_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_order_items" ADD CONSTRAINT "business_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_order_items" ADD CONSTRAINT "business_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
