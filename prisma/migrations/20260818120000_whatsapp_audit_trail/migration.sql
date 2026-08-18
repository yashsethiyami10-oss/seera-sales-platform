-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OutboxStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "OutboxStatus" ADD VALUE 'READ';

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "templateKey" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_webhook_receipts" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_receipts_dedupeKey_key" ON "whatsapp_webhook_receipts"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_providerMessageId_key" ON "outbox_events"("providerMessageId");

