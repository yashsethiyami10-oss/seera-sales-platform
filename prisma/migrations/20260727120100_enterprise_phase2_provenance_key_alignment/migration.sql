-- Align the provenance key with Prisma's field-based composite uniqueness.
-- Existing null event identifiers are normalized to the canonical empty value.
UPDATE "phase2_source_references" SET "sourceEventId" = '' WHERE "sourceEventId" IS NULL;
ALTER TABLE "phase2_source_references"
  ALTER COLUMN "sourceEventId" SET DEFAULT '',
  ALTER COLUMN "sourceEventId" SET NOT NULL;
DROP INDEX "phase2_source_references_deterministic_source_key";
CREATE UNIQUE INDEX "phase2_source_references_organizationKey_targetEntityType_targetEntityId_sourceDomain_sourceEntityType_sourceEntityId_sourceEventId_key"
  ON "phase2_source_references"(
    "organizationKey", "targetEntityType", "targetEntityId", "sourceDomain",
    "sourceEntityType", "sourceEntityId", "sourceEventId"
  );
