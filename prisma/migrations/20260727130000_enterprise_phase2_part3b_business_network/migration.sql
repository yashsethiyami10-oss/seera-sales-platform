-- CreateTable
CREATE TABLE "network_partners" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerNumber" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "partnerType" TEXT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "onboardingStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "complianceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "activationStatus" TEXT NOT NULL DEFAULT 'INACTIVE',
    "taxRegistrationNumber" TEXT,
    "registrationNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "bankDetailReference" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_partner_contacts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_partner_addresses" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "addressType" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_partner_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_partner_profiles" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerType" TEXT NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_partner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_partner_hierarchy" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "hierarchyType" TEXT NOT NULL,
    "parentPartnerId" TEXT NOT NULL,
    "childPartnerId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_partner_hierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_onboarding_cases" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "checklistVersion" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "correctionNotes" TEXT,
    "readinessSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_onboarding_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_onboarding_requirements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "requirementType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_onboarding_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_territories" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "territoryKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "territoryType" TEXT NOT NULL,
    "parentKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "geometry" JSONB,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_territory_assignments" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_territory_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_agreements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "agreementKey" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "agreementType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "terms" JSONB NOT NULL DEFAULT '{}',
    "documentRefs" JSONB NOT NULL DEFAULT '[]',
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_policy_applicability" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "partnerId" TEXT,
    "partnerType" TEXT,
    "territoryKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_policy_applicability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_royalty_runs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "runNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceSnapshotHash" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "reversalOfId" TEXT,
    "correctionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_royalty_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_royalty_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER,
    "policyVersionId" TEXT NOT NULL,
    "basisAmount" DECIMAL(18,2) NOT NULL,
    "calculatedAmount" DECIMAL(18,2) NOT NULL,
    "calculation" JSONB NOT NULL,
    "financeReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_royalty_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_commission_runs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "runNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceSnapshotHash" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "reversalOfId" TEXT,
    "correctionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_commission_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_commission_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER,
    "policyVersionId" TEXT NOT NULL,
    "basisAmount" DECIMAL(18,2) NOT NULL,
    "calculatedAmount" DECIMAL(18,2) NOT NULL,
    "calculation" JSONB NOT NULL,
    "financeReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_commission_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_target_plans" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_target_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_target_lines" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "targetValue" DECIMAL(18,2) NOT NULL,
    "sourceRule" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_target_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_claims" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "sourceReferences" JSONB NOT NULL DEFAULT '[]',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "financeReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_support_cases" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedToId" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_training_programs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "programKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "partnerTypes" JSONB NOT NULL DEFAULT '[]',
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "validForDays" INTEGER,
    "contentRefs" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_training_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_training_assignments" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "assignedById" TEXT NOT NULL,

    CONSTRAINT "network_training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_compliance_requirements" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "partnerTypes" JSONB NOT NULL DEFAULT '[]',
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "renewalDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_compliance_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_compliance_records" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "validFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_compliance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_partner_users" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "network_partner_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_partners_organizationKey_partnerType_lifecycleStatu_idx" ON "network_partners"("organizationKey", "partnerType", "lifecycleStatus", "createdAt");

-- CreateIndex
CREATE INDEX "network_partners_organizationKey_legalName_idx" ON "network_partners"("organizationKey", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "network_partners_organizationKey_partnerNumber_key" ON "network_partners"("organizationKey", "partnerNumber");

-- CreateIndex
CREATE INDEX "network_partner_contacts_organizationKey_partnerId_active_idx" ON "network_partner_contacts"("organizationKey", "partnerId", "active");

-- CreateIndex
CREATE INDEX "network_partner_addresses_organizationKey_partnerId_active_idx" ON "network_partner_addresses"("organizationKey", "partnerId", "active");

-- CreateIndex
CREATE INDEX "network_partner_profiles_organizationKey_partnerType_effect_idx" ON "network_partner_profiles"("organizationKey", "partnerType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_partner_profiles_organizationKey_partnerId_partnerT_key" ON "network_partner_profiles"("organizationKey", "partnerId", "partnerType", "version");

-- CreateIndex
CREATE INDEX "network_partner_hierarchy_organizationKey_childPartnerId_st_idx" ON "network_partner_hierarchy"("organizationKey", "childPartnerId", "status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "network_partner_hierarchy_organizationKey_parentPartnerId_s_idx" ON "network_partner_hierarchy"("organizationKey", "parentPartnerId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_hierarchy_effective_key" ON "network_partner_hierarchy"("organizationKey", "hierarchyType", "parentPartnerId", "childPartnerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "network_onboarding_cases_organizationKey_partnerId_status_idx" ON "network_onboarding_cases"("organizationKey", "partnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "network_onboarding_cases_organizationKey_caseNumber_key" ON "network_onboarding_cases"("organizationKey", "caseNumber");

-- CreateIndex
CREATE INDEX "network_onboarding_requirements_organizationKey_onboardingI_idx" ON "network_onboarding_requirements"("organizationKey", "onboardingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "network_onboarding_requirements_organizationKey_onboardingI_key" ON "network_onboarding_requirements"("organizationKey", "onboardingId", "requirementKey");

-- CreateIndex
CREATE INDEX "network_territories_organizationKey_status_effectiveFrom_ef_idx" ON "network_territories"("organizationKey", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "network_territories_organizationKey_territoryKey_version_key" ON "network_territories"("organizationKey", "territoryKey", "version");

-- CreateIndex
CREATE INDEX "network_territory_assignments_organizationKey_partnerId_sta_idx" ON "network_territory_assignments"("organizationKey", "partnerId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_territory_assignment_effective_key" ON "network_territory_assignments"("organizationKey", "territoryId", "partnerId", "assignmentType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "network_agreements_organizationKey_partnerId_status_effecti_idx" ON "network_agreements"("organizationKey", "partnerId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_agreements_organizationKey_agreementKey_version_key" ON "network_agreements"("organizationKey", "agreementKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "network_agreements_organizationKey_agreementNumber_key" ON "network_agreements"("organizationKey", "agreementNumber");

-- CreateIndex
CREATE INDEX "network_policy_applicability_organizationKey_partnerId_part_idx" ON "network_policy_applicability"("organizationKey", "partnerId", "partnerType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_policy_applicability_key" ON "network_policy_applicability"("organizationKey", "policyVersionId", "partnerId", "partnerType", "territoryKey");

-- CreateIndex
CREATE INDEX "network_royalty_runs_organizationKey_status_periodStart_per_idx" ON "network_royalty_runs"("organizationKey", "status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "network_royalty_runs_organizationKey_runNumber_key" ON "network_royalty_runs"("organizationKey", "runNumber");

-- CreateIndex
CREATE INDEX "network_royalty_lines_organizationKey_partnerId_createdAt_idx" ON "network_royalty_lines"("organizationKey", "partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_royalty_line_source_key" ON "network_royalty_lines"("organizationKey", "runId", "partnerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "network_commission_runs_organizationKey_status_periodStart__idx" ON "network_commission_runs"("organizationKey", "status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "network_commission_runs_organizationKey_runNumber_key" ON "network_commission_runs"("organizationKey", "runNumber");

-- CreateIndex
CREATE INDEX "network_commission_lines_organizationKey_partnerId_createdA_idx" ON "network_commission_lines"("organizationKey", "partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_commission_line_source_key" ON "network_commission_lines"("organizationKey", "runId", "partnerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "network_target_plans_organizationKey_status_periodStart_per_idx" ON "network_target_plans"("organizationKey", "status", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "network_target_plans_organizationKey_planKey_version_key" ON "network_target_plans"("organizationKey", "planKey", "version");

-- CreateIndex
CREATE INDEX "network_target_lines_organizationKey_partnerId_metricKey_idx" ON "network_target_lines"("organizationKey", "partnerId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "network_target_lines_organizationKey_planId_partnerId_metri_key" ON "network_target_lines"("organizationKey", "planId", "partnerId", "metricKey");

-- CreateIndex
CREATE INDEX "network_claims_organizationKey_partnerId_status_createdAt_idx" ON "network_claims"("organizationKey", "partnerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_claims_organizationKey_claimNumber_key" ON "network_claims"("organizationKey", "claimNumber");

-- CreateIndex
CREATE INDEX "network_support_cases_organizationKey_partnerId_status_prio_idx" ON "network_support_cases"("organizationKey", "partnerId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "network_support_cases_organizationKey_caseNumber_key" ON "network_support_cases"("organizationKey", "caseNumber");

-- CreateIndex
CREATE INDEX "network_training_programs_organizationKey_status_idx" ON "network_training_programs"("organizationKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "network_training_programs_organizationKey_programKey_versio_key" ON "network_training_programs"("organizationKey", "programKey", "version");

-- CreateIndex
CREATE INDEX "network_training_assignments_organizationKey_partnerId_stat_idx" ON "network_training_assignments"("organizationKey", "partnerId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_training_assignments_organizationKey_programId_part_key" ON "network_training_assignments"("organizationKey", "programId", "partnerId");

-- CreateIndex
CREATE INDEX "network_compliance_requirements_organizationKey_status_effe_idx" ON "network_compliance_requirements"("organizationKey", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "network_compliance_requirements_organizationKey_requirement_key" ON "network_compliance_requirements"("organizationKey", "requirementKey", "version");

-- CreateIndex
CREATE INDEX "network_compliance_records_organizationKey_partnerId_status_idx" ON "network_compliance_records"("organizationKey", "partnerId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_compliance_records_organizationKey_requirementId_pa_key" ON "network_compliance_records"("organizationKey", "requirementId", "partnerId", "version");

-- CreateIndex
CREATE INDEX "network_partner_users_organizationKey_userId_status_idx" ON "network_partner_users"("organizationKey", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "network_partner_users_organizationKey_partnerId_userId_key" ON "network_partner_users"("organizationKey", "partnerId", "userId");

-- AddForeignKey
ALTER TABLE "network_partner_contacts" ADD CONSTRAINT "network_partner_contacts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_addresses" ADD CONSTRAINT "network_partner_addresses_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_profiles" ADD CONSTRAINT "network_partner_profiles_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_hierarchy" ADD CONSTRAINT "network_partner_hierarchy_parentPartnerId_fkey" FOREIGN KEY ("parentPartnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_hierarchy" ADD CONSTRAINT "network_partner_hierarchy_childPartnerId_fkey" FOREIGN KEY ("childPartnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_onboarding_cases" ADD CONSTRAINT "network_onboarding_cases_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_onboarding_requirements" ADD CONSTRAINT "network_onboarding_requirements_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "network_onboarding_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_territory_assignments" ADD CONSTRAINT "network_territory_assignments_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "network_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_territory_assignments" ADD CONSTRAINT "network_territory_assignments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_agreements" ADD CONSTRAINT "network_agreements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_policy_applicability" ADD CONSTRAINT "network_policy_applicability_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_royalty_lines" ADD CONSTRAINT "network_royalty_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "network_royalty_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_royalty_lines" ADD CONSTRAINT "network_royalty_lines_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_commission_lines" ADD CONSTRAINT "network_commission_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES "network_commission_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_commission_lines" ADD CONSTRAINT "network_commission_lines_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_target_lines" ADD CONSTRAINT "network_target_lines_planId_fkey" FOREIGN KEY ("planId") REFERENCES "network_target_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_target_lines" ADD CONSTRAINT "network_target_lines_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_claims" ADD CONSTRAINT "network_claims_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_support_cases" ADD CONSTRAINT "network_support_cases_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_training_assignments" ADD CONSTRAINT "network_training_assignments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "network_training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_training_assignments" ADD CONSTRAINT "network_training_assignments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_compliance_records" ADD CONSTRAINT "network_compliance_records_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "network_compliance_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_compliance_records" ADD CONSTRAINT "network_compliance_records_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_users" ADD CONSTRAINT "network_partner_users_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
