DROP INDEX IF EXISTS "sales_channels_defaultAssignmentQueueId_key";
CREATE INDEX "sales_channels_defaultAssignmentQueueId_idx" ON "sales_channels"("defaultAssignmentQueueId");
