-- MUV AI Engineering Execution — Sprint 3: Conflict Queue.
-- Purely additive — one new table, no existing table touched.

-- CreateTable
CREATE TABLE "knowledge_conflicts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conflictType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceARef" TEXT NOT NULL,
    "sourceBRef" TEXT NOT NULL,
    "severity" "ProblemRiskLevel" NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_conflicts_organizationKey_status_idx" ON "knowledge_conflicts"("organizationKey", "status");

-- CreateIndex
CREATE INDEX "knowledge_conflicts_organizationKey_conflictType_idx" ON "knowledge_conflicts"("organizationKey", "conflictType");

-- AddForeignKey
ALTER TABLE "knowledge_conflicts" ADD CONSTRAINT "knowledge_conflicts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
