-- Stage 6C — Runtime Engineering. Additive only.
-- Hand-authored (not `prisma migrate dev`) because the shadow database used
-- for that command's diffing fails to replay an unrelated, pre-existing
-- migration (20260727000000_sales_architecture_v1, error P1014 — "the
-- underlying table for model `users` does not exist"), which predates this
-- change and is not caused by it. This file contains only the genuinely
-- additive statements from `prisma migrate diff` against the live database;
-- one unrelated statement the diff tool proposed
-- (`DROP INDEX "knowledge_embeddings_embedding_hnsw_idx"`, pre-existing
-- drift from a raw-SQL pgvector index not represented in schema.prisma) was
-- deliberately excluded — it is not part of this change and must not be
-- dropped.

-- CreateEnum
CREATE TYPE "FounderDecisionStatus" AS ENUM ('APPROVED', 'SUPERSEDED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "LearningCandidateType" AS ENUM ('UNANSWERED_QUESTION', 'RETRIEVAL_FAILURE', 'REPEATED_CONFLICT', 'WEAK_RESPONSE', 'KCR_CANDIDATE', 'FOUNDER_DECISION_CANDIDATE');

-- CreateEnum
CREATE TYPE "LearningCandidateStatus" AS ENUM ('OPEN', 'REVIEWED_APPROVED', 'REVIEWED_REJECTED', 'DEFERRED');

-- CreateTable
CREATE TABLE "founder_decision_registry_entries" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "decisionText" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "FounderDecisionStatus" NOT NULL DEFAULT 'APPROVED',
    "supersedesId" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_decision_registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_audit_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "turnId" TEXT NOT NULL,
    "intentPrimary" TEXT,
    "retrievalMethodMix" JSONB,
    "conflictStatus" TEXT,
    "confidenceScore" INTEGER,
    "safetyVerdict" TEXT,
    "stageTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_candidates" (
    "id" TEXT NOT NULL,
    "type" "LearningCandidateType" NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "LearningCandidateStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "founder_decision_registry_entries_decisionId_key" ON "founder_decision_registry_entries"("decisionId");

-- CreateIndex
CREATE INDEX "founder_decision_registry_entries_category_idx" ON "founder_decision_registry_entries"("category");

-- CreateIndex
CREATE INDEX "founder_decision_registry_entries_status_idx" ON "founder_decision_registry_entries"("status");

-- CreateIndex
CREATE INDEX "runtime_audit_logs_sessionId_idx" ON "runtime_audit_logs"("sessionId");

-- CreateIndex
CREATE INDEX "runtime_audit_logs_createdAt_idx" ON "runtime_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "learning_candidates_type_status_idx" ON "learning_candidates"("type", "status");
