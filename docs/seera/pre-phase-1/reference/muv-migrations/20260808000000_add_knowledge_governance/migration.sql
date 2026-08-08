-- CreateEnum
CREATE TYPE "KnowledgeGovernanceTier" AS ENUM ('PUBLIC', 'CUSTOMER', 'PARTNER', 'INTERNAL', 'FOUNDER', 'CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "KnowledgeGovernanceReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "knowledge_governance_classifications" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "proposedTier" "KnowledgeGovernanceTier" NOT NULL,
    "status" "KnowledgeGovernanceReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "proposedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_governance_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_governance_classifications_status_idx" ON "knowledge_governance_classifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_governance_classifications_targetType_targetId_key" ON "knowledge_governance_classifications"("targetType", "targetId");

