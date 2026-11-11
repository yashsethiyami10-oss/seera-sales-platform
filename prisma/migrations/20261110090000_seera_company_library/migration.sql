-- Company document library (Sales Executive / Sales Manager / Founder "Company documents").
-- Stores the documents the Founder/Admin uploads; file bytes live in stored_files.
-- Idempotent so it is safe on databases that were synced with db push.

CREATE TABLE IF NOT EXISTS "seera_company_library_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "fileId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_company_library_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "seera_company_library_documents_category_archivedAt_createdAt_idx"
    ON "seera_company_library_documents"("category", "archivedAt", "createdAt");
