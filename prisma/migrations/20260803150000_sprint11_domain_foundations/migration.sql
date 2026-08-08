-- MUV AI Engineering Execution — Sprint 11: Domain Foundations.
-- Purely additive: two new independent table groups (SalesIntelligenceSnapshot;
-- ComplianceRequirement/ComplianceRecord). CustomerIntelligence itself needed
-- NO schema change — it already exists in full as CustomerIntelligenceProfile
-- (Phase 6, lib/growth/*) and is reused via a new adapter file
-- (lib/retrieval/operational-data-adapter.ts), not duplicated here.
--
-- NOTE: `prisma migrate diff` also emitted `DROP INDEX
-- "knowledge_embeddings_embedding_hnsw_idx"` ahead of these statements —
-- deliberately excluded, the same known false positive documented in every
-- migration since 20260801200000 (Prisma's schema DSL cannot express
-- `USING hnsw`, so `migrate diff` always proposes dropping that raw-SQL
-- index whenever anything else in the schema changes).

-- CreateTable
CREATE TABLE "sales_intelligence_snapshots" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "stage" "InstOpportunityStage" NOT NULL,
    "daysSinceLastActivity" INTEGER NOT NULL,
    "quotationCount" INTEGER NOT NULL,
    "acceptedQuotationCount" INTEGER NOT NULL,
    "quotationAcceptanceRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "dealHealthScore" INTEGER NOT NULL,
    "dealHealthLevel" TEXT NOT NULL,
    "evidence" TEXT[],
    "calculationVersion" TEXT NOT NULL DEFAULT 'v1',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_intelligence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_requirements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "requirementKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_records" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "requirementId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "validFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_intelligence_snapshots_opportunityId_generatedAt_idx" ON "sales_intelligence_snapshots"("opportunityId", "generatedAt");

-- CreateIndex
CREATE INDEX "compliance_requirements_organizationKey_scopeType_status_idx" ON "compliance_requirements"("organizationKey", "scopeType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_requirements_organizationKey_requirementKey_vers_key" ON "compliance_requirements"("organizationKey", "requirementKey", "version");

-- CreateIndex
CREATE INDEX "compliance_records_organizationKey_requirementId_idx" ON "compliance_records"("organizationKey", "requirementId");

-- CreateIndex
CREATE INDEX "compliance_records_organizationKey_targetType_targetId_idx" ON "compliance_records"("organizationKey", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "compliance_records_organizationKey_status_idx" ON "compliance_records"("organizationKey", "status");

-- AddForeignKey
ALTER TABLE "sales_intelligence_snapshots" ADD CONSTRAINT "sales_intelligence_snapshots_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "inst_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "compliance_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
