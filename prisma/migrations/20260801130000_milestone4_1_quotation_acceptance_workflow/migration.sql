-- Milestone 4.1 — Quotation Acceptance Workflow Enhancement.
-- Purely additive: one new enum, four new nullable columns on
-- inst_quotation_versions, one new FK. No existing column, table, or
-- constraint is touched.

-- CreateEnum
CREATE TYPE "InstQuotationAcceptanceMethod" AS ENUM ('VERBAL_CONFIRMATION', 'PHONE_CALL', 'WHATSAPP', 'EMAIL', 'SIGNED_COPY', 'CUSTOMER_PORTAL', 'OTHER');

-- AlterTable
ALTER TABLE "inst_quotation_versions" ADD COLUMN     "acceptanceMethod" "InstQuotationAcceptanceMethod",
ADD COLUMN     "acceptanceRemarks" TEXT,
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT;

-- AddForeignKey
ALTER TABLE "inst_quotation_versions" ADD CONSTRAINT "inst_quotation_versions_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
