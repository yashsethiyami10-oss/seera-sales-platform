CREATE TYPE "SeeraOfflineSyncStatus" AS ENUM ('PENDING','SYNCING','SYNCED','FAILED','CONFLICT','CANCELLED');
CREATE TYPE "SeeraOfflineConflictClass" AS ENUM ('AUTO_RESOLVABLE','USER_REVIEW_REQUIRED','SERVER_REJECTED');
CREATE TABLE "seera_offline_operations" (
  "id" TEXT NOT NULL,"clientOperationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"deviceId" TEXT NOT NULL,
  "sessionContext" JSONB NOT NULL,"entityType" TEXT NOT NULL,"actionType" TEXT NOT NULL,"localCreatedAt" TIMESTAMP(3) NOT NULL,
  "payloadVersion" INTEGER NOT NULL,"originalPayload" JSONB NOT NULL,"status" "SeeraOfflineSyncStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,"lastErrorCode" TEXT,"serverAcknowledgment" JSONB,
  "conflictClass" "SeeraOfflineConflictClass","conflictDetails" JSONB,"syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seera_offline_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seera_offline_operations_userId_clientOperationId_key" ON "seera_offline_operations"("userId","clientOperationId");
CREATE INDEX "seera_offline_operations_userId_status_localCreatedAt_idx" ON "seera_offline_operations"("userId","status","localCreatedAt");
CREATE INDEX "seera_offline_operations_status_updatedAt_idx" ON "seera_offline_operations"("status","updatedAt");
ALTER TABLE "seera_offline_operations" ADD CONSTRAINT "seera_offline_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
