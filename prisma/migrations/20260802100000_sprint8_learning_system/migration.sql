-- MUV AI Engineering Execution — Sprint 8: Learning System.
-- Purely additive: three new columns on each of the six Foundation Version
-- tables (reviewDueAt/containsHistoricalPricing/requiresRevalidation,
-- deliberately deferred from Sprint 5 so all six gain them together) plus
-- three new tables (KnowledgeUsageReference/KnowledgeChangeProposal/
-- RecallEvent). No existing table dropped, no existing column altered or
-- dropped, no existing index dropped.
--
-- NOTE: `prisma migrate diff` also emitted `DROP INDEX
-- "knowledge_embeddings_embedding_hnsw_idx"` ahead of these statements —
-- deliberately excluded from this file. That index was created via raw SQL
-- in migration 20260801250000_sprint6_retrieval_platform (`USING hnsw`,
-- pgvector's cosine-distance index type) because Prisma's schema DSL has no
-- way to express a non-btree index method; since schema.prisma therefore has
-- no `@@index` annotation that could ever match it, `migrate diff` always
-- proposes dropping it when nothing in schema.prisma changes about that
-- table — a known, harmless false positive of the diff tool against
-- DSL-inexpressible objects, not a real schema drift. Dropping it would
-- silently degrade lib/retrieval/embedding-service.ts's searchSimilar() to
-- a full sequential scan. The same "raw SQL wins, diff noise around it is
-- discarded" handling already applied to the partial unique indexes in
-- migrations 20260801200000 and 20260801241000.

-- AlterTable
ALTER TABLE "care_intelligence_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "category_intelligence_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "knowledge_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "problem_intelligence_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_intelligence_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_variant_intelligence_versions" ADD COLUMN     "containsHistoricalPricing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresRevalidation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "knowledge_usage_references" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "usedInAction" TEXT NOT NULL,
    "callerRole" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_usage_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_change_proposals" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "proposedChange" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proposedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall_events" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "reportedById" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recall_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_usage_references_organizationKey_targetType_targe_idx" ON "knowledge_usage_references"("organizationKey", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "knowledge_usage_references_organizationKey_usedAt_idx" ON "knowledge_usage_references"("organizationKey", "usedAt");

-- CreateIndex
CREATE INDEX "knowledge_change_proposals_organizationKey_targetType_targe_idx" ON "knowledge_change_proposals"("organizationKey", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "knowledge_change_proposals_organizationKey_status_idx" ON "knowledge_change_proposals"("organizationKey", "status");

-- CreateIndex
CREATE INDEX "recall_events_organizationKey_targetType_targetId_idx" ON "recall_events"("organizationKey", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "recall_events_organizationKey_outcome_idx" ON "recall_events"("organizationKey", "outcome");

-- AddForeignKey
ALTER TABLE "knowledge_change_proposals" ADD CONSTRAINT "knowledge_change_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_change_proposals" ADD CONSTRAINT "knowledge_change_proposals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_events" ADD CONSTRAINT "recall_events_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
