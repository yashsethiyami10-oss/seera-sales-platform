-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('FIELD_VISIT', 'PHONE_CALL', 'WHATSAPP', 'OTHER');

-- AlterEnum
ALTER TYPE "PartnerType" ADD VALUE 'COMPANY_DIRECT';

-- AlterTable
ALTER TABLE "seera_retailers" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "seera_sales_orders" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'FIELD_VISIT',
ADD COLUMN     "visitId" TEXT;

-- DataMigration: existing retailer-self-service-portal orders were never field visits — the
-- FIELD_VISIT default above is only correct for the executive/manager-authored orders that made
-- up the rest of history. Placeholder value pending Founder confirmation of a dedicated
-- OrderSource value for retailer self-service (see plan doc "Open items requiring Founder
-- judgment", item 1).
UPDATE "seera_sales_orders" SET "source" = 'OTHER' WHERE "sourcePortal" = 'retailer';

-- CreateIndex
CREATE UNIQUE INDEX "seera_retailers_idempotencyKey_key" ON "seera_retailers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_sales_orders_source_createdAt_idx" ON "seera_sales_orders"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "seera_sales_orders" ADD CONSTRAINT "seera_sales_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "seera_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
