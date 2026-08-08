-- MUV Enterprise Architecture v3.0 Phase 2 Part 3A
-- Additive shared governance foundations. No existing data is changed.

CREATE TABLE "phase2_operations" (
  "id" TEXT NOT NULL,
  "organizationKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "requestFingerprint" TEXT,
  "sourceDomain" TEXT,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "sourceEventId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "resultEntityType" TEXT,
  "resultEntityId" TEXT,
  "failureCode" TEXT,
  "correlationId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phase2_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "phase2_operations_organizationKey_operationType_idempotencyKey_key"
  ON "phase2_operations"("organizationKey", "operationType", "idempotencyKey");
CREATE INDEX "phase2_operations_organizationKey_status_createdAt_idx"
  ON "phase2_operations"("organizationKey", "status", "createdAt");
CREATE INDEX "phase2_operations_organizationKey_sourceDomain_sourceEntityType_sourceEntityId_idx"
  ON "phase2_operations"("organizationKey", "sourceDomain", "sourceEntityType", "sourceEntityId");
CREATE INDEX "phase2_operations_correlationId_idx" ON "phase2_operations"("correlationId");

CREATE TABLE "phase2_policy_versions" (
  "id" TEXT NOT NULL,
  "organizationKey" TEXT NOT NULL,
  "policyType" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "configuration" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phase2_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "phase2_policy_versions_effective_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "phase2_policy_versions_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "phase2_policy_versions_organizationKey_policyType_policyKey_version_key"
  ON "phase2_policy_versions"("organizationKey", "policyType", "policyKey", "version");
CREATE INDEX "phase2_policy_versions_organizationKey_policyType_policyKey_status_effectiveFrom_idx"
  ON "phase2_policy_versions"("organizationKey", "policyType", "policyKey", "status", "effectiveFrom");

CREATE TABLE "phase2_source_references" (
  "id" TEXT NOT NULL,
  "organizationKey" TEXT NOT NULL,
  "targetEntityType" TEXT NOT NULL,
  "targetEntityId" TEXT NOT NULL,
  "sourceDomain" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "sourceDocumentNo" TEXT,
  "sourceVersion" INTEGER,
  "processingStatus" TEXT NOT NULL DEFAULT 'RECORDED',
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phase2_source_references_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "phase2_source_references_deterministic_source_key"
  ON "phase2_source_references"(
    "organizationKey", "targetEntityType", "targetEntityId", "sourceDomain",
    "sourceEntityType", "sourceEntityId", COALESCE("sourceEventId", '')
  );
CREATE INDEX "phase2_source_references_organizationKey_source_idx"
  ON "phase2_source_references"("organizationKey", "sourceDomain", "sourceEntityType", "sourceEntityId");
CREATE INDEX "phase2_source_references_organizationKey_target_idx"
  ON "phase2_source_references"("organizationKey", "targetEntityType", "targetEntityId");

CREATE TABLE "phase2_sod_policies" (
  "id" TEXT NOT NULL,
  "organizationKey" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "preparerAction" TEXT NOT NULL,
  "approverAction" TEXT NOT NULL,
  "prohibitSameActor" BOOLEAN NOT NULL DEFAULT true,
  "overridePermission" TEXT,
  "overrideApprovalType" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phase2_sod_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "phase2_sod_policies_organizationKey_operationType_key"
  ON "phase2_sod_policies"("organizationKey", "operationType");
CREATE INDEX "phase2_sod_policies_organizationKey_active_idx"
  ON "phase2_sod_policies"("organizationKey", "active");

-- Finalized policy versions and provenance evidence are append-only.
CREATE OR REPLACE FUNCTION reject_phase2_foundation_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable Phase 2 foundation record';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_phase2_finalized_policy()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'finalized Phase 2 policy versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phase2_source_reference_no_update
  BEFORE UPDATE ON "phase2_source_references"
  FOR EACH ROW EXECUTE FUNCTION reject_phase2_foundation_mutation();
CREATE TRIGGER phase2_source_reference_no_delete
  BEFORE DELETE ON "phase2_source_references"
  FOR EACH ROW EXECUTE FUNCTION reject_phase2_foundation_mutation();
CREATE TRIGGER phase2_policy_finalized_no_update
  BEFORE UPDATE ON "phase2_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION protect_phase2_finalized_policy();
CREATE TRIGGER phase2_policy_finalized_no_delete
  BEFORE DELETE ON "phase2_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION protect_phase2_finalized_policy();
