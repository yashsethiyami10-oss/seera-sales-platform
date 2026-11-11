-- Partner KYC documents + typed KYC details for distributor / super stockist prospects and
-- partners. Additive only; idempotent so a database that already has the tables is untouched.

CREATE TABLE IF NOT EXISTS "seera_partner_kyc_documents" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    CONSTRAINT "seera_partner_kyc_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seera_partner_kyc_documents_subjectType_subjectId_docType_idx" ON "seera_partner_kyc_documents"("subjectType", "subjectId", "docType");
CREATE INDEX IF NOT EXISTS "seera_partner_kyc_documents_uploadedById_createdAt_idx" ON "seera_partner_kyc_documents"("uploadedById", "createdAt");

CREATE TABLE IF NOT EXISTS "seera_partner_kyc_details" (
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "aadhaarLast4" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "ifsc" TEXT,
    "bankName" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seera_partner_kyc_details_pkey" PRIMARY KEY ("subjectType", "subjectId")
);
