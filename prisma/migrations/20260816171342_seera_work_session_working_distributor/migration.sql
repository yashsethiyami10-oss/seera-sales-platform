-- AlterTable
ALTER TABLE "seera_work_sessions" ADD COLUMN     "workingDistributorId" TEXT;

-- CreateIndex
CREATE INDEX "seera_work_sessions_workingDistributorId_startedAt_idx" ON "seera_work_sessions"("workingDistributorId", "startedAt");
