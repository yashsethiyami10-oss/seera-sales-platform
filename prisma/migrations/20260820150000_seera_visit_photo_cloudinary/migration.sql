-- Additive dual-storage metadata. Existing database-backed photo rows remain unchanged.
ALTER TABLE "seera_visit_photos"
  ALTER COLUMN "fileId" DROP NOT NULL,
  ADD COLUMN "storageProvider" TEXT,
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "secureUrl" TEXT,
  ADD COLUMN "sizeBytes" BIGINT,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "format" TEXT;

CREATE UNIQUE INDEX "seera_visit_photos_publicId_key"
  ON "seera_visit_photos"("publicId");
