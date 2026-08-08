-- CreateEnum
CREATE TYPE "KnowledgePublicationStatus" AS ENUM ('PUBLISHED', 'PENDING_REVIEW', 'DRAFT', 'PENDING_FOUNDER_INPUT', 'UNKNOWN_STATUS', 'ARCHIVED', 'SOURCE_MISSING');

-- CreateTable
CREATE TABLE "published_knowledge_records" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "koid" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "productId" TEXT,
    "category" TEXT,
    "approvalStatus" TEXT NOT NULL,
    "publicationStatus" "KnowledgePublicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "accessLayer" TEXT NOT NULL DEFAULT 'INTERNAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "isGapRecord" BOOLEAN NOT NULL DEFAULT false,
    "escalationRequired" BOOLEAN NOT NULL DEFAULT false,
    "relationships" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawFields" JSONB NOT NULL DEFAULT '{}',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_knowledge_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_publish_runs" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "discovered" INTEGER NOT NULL,
    "validCount" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "inserted" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "archived" INTEGER NOT NULL,
    "embeddingsCreated" INTEGER NOT NULL,
    "embeddingsUpdated" INTEGER NOT NULL,
    "embeddingsSkipped" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "perDomainTotals" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "knowledge_publish_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "published_knowledge_records_sourceId_key" ON "published_knowledge_records"("sourceId");

-- CreateIndex
CREATE INDEX "published_knowledge_records_domain_idx" ON "published_knowledge_records"("domain");

-- CreateIndex
CREATE INDEX "published_knowledge_records_publicationStatus_idx" ON "published_knowledge_records"("publicationStatus");

-- CreateIndex
CREATE INDEX "published_knowledge_records_productId_idx" ON "published_knowledge_records"("productId");

-- CreateIndex
CREATE INDEX "knowledge_publish_runs_mode_startedAt_idx" ON "knowledge_publish_runs"("mode", "startedAt");

