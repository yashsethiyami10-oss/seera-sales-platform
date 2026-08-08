-- MUV AI Engineering Execution — Sprint 2: Source Registry.
-- Purely additive — two new tables, no existing table touched.

-- CreateTable
CREATE TABLE "canonical_source_documents" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "sourceLocator" JSONB NOT NULL,
    "fileHash" TEXT NOT NULL,
    "authorityLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "supersedesId" TEXT,
    "ingestedById" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "canonical_source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_provenance" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "sourceDocumentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "extractedById" TEXT,
    "extractionConfidence" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canonical_source_documents_organizationKey_documentType_idx" ON "canonical_source_documents"("organizationKey", "documentType");

-- CreateIndex
CREATE INDEX "canonical_source_documents_organizationKey_authorityLevel_idx" ON "canonical_source_documents"("organizationKey", "authorityLevel");

-- CreateIndex
CREATE INDEX "canonical_source_documents_organizationKey_status_idx" ON "canonical_source_documents"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_source_documents_organizationKey_fileHash_key" ON "canonical_source_documents"("organizationKey", "fileHash");

-- CreateIndex
CREATE INDEX "source_provenance_organizationKey_targetType_targetId_idx" ON "source_provenance"("organizationKey", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "source_provenance_organizationKey_sourceDocumentId_idx" ON "source_provenance"("organizationKey", "sourceDocumentId");

-- AddForeignKey
ALTER TABLE "canonical_source_documents" ADD CONSTRAINT "canonical_source_documents_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "canonical_source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_source_documents" ADD CONSTRAINT "canonical_source_documents_ingestedById_fkey" FOREIGN KEY ("ingestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_provenance" ADD CONSTRAINT "source_provenance_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "canonical_source_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_provenance" ADD CONSTRAINT "source_provenance_extractedById_fkey" FOREIGN KEY ("extractedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
