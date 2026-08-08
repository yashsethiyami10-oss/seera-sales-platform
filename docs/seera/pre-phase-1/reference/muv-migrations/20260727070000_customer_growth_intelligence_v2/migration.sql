-- CreateTable
CREATE TABLE "customer_intelligence_profiles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "statusCode" TEXT NOT NULL,
    "primarySegmentId" TEXT,
    "firstPurchaseDate" TIMESTAMP(3),
    "lastPurchaseDate" TIMESTAMP(3),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "averageOrderValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "averageInvoiceValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "averagePaymentTimeDays" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "purchaseFrequency" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "averageDaysBetweenOrders" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "repeatPurchaseCount" INTEGER NOT NULL DEFAULT 0,
    "repeatPurchaseRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "collectionRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "partialPaymentCount" INTEGER NOT NULL DEFAULT 0,
    "paidInvoiceCount" INTEGER NOT NULL DEFAULT 0,
    "overdueInvoiceCount" INTEGER NOT NULL DEFAULT 0,
    "preferredProducts" JSONB NOT NULL DEFAULT '[]',
    "preferredVariants" JSONB NOT NULL DEFAULT '[]',
    "preferredCategories" JSONB NOT NULL DEFAULT '[]',
    "paymentMethodDistribution" JSONB NOT NULL DEFAULT '{}',
    "calculationVersion" TEXT NOT NULL,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_intelligence_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_status_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule" JSONB NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_segments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule" JSONB,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_segment_assignments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersion" INTEGER,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_intelligence_snapshots" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "segmentState" JSONB NOT NULL,
    "statusCode" TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_intelligence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_profiles" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "membershipLevelId" TEXT,
    "currentRewardBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRewardEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRewardRedeemed" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRewardExpired" INTEGER NOT NULL DEFAULT 0,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "successfulReferralCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "lastRecalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_transaction_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_transaction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_ledger_entries" (
    "id" TEXT NOT NULL,
    "ledgerNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionTypeId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "previousBalance" INTEGER NOT NULL,
    "newBalance" INTEGER NOT NULL,
    "referenceEntity" TEXT,
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_levels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "rule" JSONB NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "previousLevelId" TEXT,
    "newLevelId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ruleVersion" INTEGER,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "membership_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_status_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_referrals" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "referrerCustomerId" TEXT NOT NULL,
    "referredCustomerId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_history" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "previousStatusId" TEXT,
    "newStatusId" TEXT NOT NULL,
    "changedById" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_snapshots" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rewardBalance" INTEGER NOT NULL,
    "membershipLevelId" TEXT,
    "lifetimeEarned" INTEGER NOT NULL,
    "lifetimeRedeemed" INTEGER NOT NULL,
    "lifetimeExpired" INTEGER NOT NULL,
    "referralSummary" JSONB NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "formula" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_report_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executive_report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "filters" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "kpiDefinitionVersion" JSONB NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase6_configuration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase6_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_intelligence_profiles_customerId_key" ON "customer_intelligence_profiles"("customerId");

-- CreateIndex
CREATE INDEX "customer_intelligence_profiles_statusCode_lastCalculatedAt_idx" ON "customer_intelligence_profiles"("statusCode", "lastCalculatedAt");

-- CreateIndex
CREATE INDEX "customer_intelligence_profiles_primarySegmentId_idx" ON "customer_intelligence_profiles"("primarySegmentId");

-- CreateIndex
CREATE INDEX "customer_intelligence_profiles_netRevenue_idx" ON "customer_intelligence_profiles"("netRevenue");

-- CreateIndex
CREATE INDEX "customer_intelligence_profiles_lastPurchaseDate_idx" ON "customer_intelligence_profiles"("lastPurchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_status_definitions_code_key" ON "customer_status_definitions"("code");

-- CreateIndex
CREATE INDEX "customer_status_definitions_active_idx" ON "customer_status_definitions"("active");

-- CreateIndex
CREATE UNIQUE INDEX "customer_segments_code_key" ON "customer_segments"("code");

-- CreateIndex
CREATE INDEX "customer_segments_active_idx" ON "customer_segments"("active");

-- CreateIndex
CREATE INDEX "customer_segment_assignments_customerId_active_isPrimary_idx" ON "customer_segment_assignments"("customerId", "active", "isPrimary");

-- CreateIndex
CREATE INDEX "customer_segment_assignments_segmentId_active_idx" ON "customer_segment_assignments"("segmentId", "active");

-- CreateIndex
CREATE INDEX "customer_intelligence_snapshots_customerId_generatedAt_idx" ON "customer_intelligence_snapshots"("customerId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_profiles_customerId_key" ON "loyalty_profiles"("customerId");

-- CreateIndex
CREATE INDEX "loyalty_profiles_membershipLevelId_idx" ON "loyalty_profiles"("membershipLevelId");

-- CreateIndex
CREATE INDEX "loyalty_profiles_currentRewardBalance_idx" ON "loyalty_profiles"("currentRewardBalance");

-- CreateIndex
CREATE UNIQUE INDEX "reward_transaction_types_code_key" ON "reward_transaction_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "reward_ledger_entries_ledgerNumber_key" ON "reward_ledger_entries"("ledgerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "reward_ledger_entries_idempotencyKey_key" ON "reward_ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reward_ledger_entries_customerId_createdAt_idx" ON "reward_ledger_entries"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "reward_ledger_entries_transactionTypeId_createdAt_idx" ON "reward_ledger_entries"("transactionTypeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "membership_levels_code_key" ON "membership_levels"("code");

-- CreateIndex
CREATE INDEX "membership_levels_active_displayOrder_idx" ON "membership_levels"("active", "displayOrder");

-- CreateIndex
CREATE INDEX "membership_history_customerId_assignedAt_idx" ON "membership_history"("customerId", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "referral_status_definitions_code_key" ON "referral_status_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_referrals_referenceCode_key" ON "customer_referrals"("referenceCode");

-- CreateIndex
CREATE INDEX "customer_referrals_statusId_createdAt_idx" ON "customer_referrals"("statusId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_referrals_referrerCustomerId_referredCustomerId_key" ON "customer_referrals"("referrerCustomerId", "referredCustomerId");

-- CreateIndex
CREATE INDEX "referral_history_referralId_createdAt_idx" ON "referral_history"("referralId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_snapshots_customerId_generatedAt_idx" ON "loyalty_snapshots"("customerId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_code_key" ON "kpi_definitions"("code");

-- CreateIndex
CREATE INDEX "kpi_definitions_module_active_idx" ON "kpi_definitions"("module", "active");

-- CreateIndex
CREATE UNIQUE INDEX "executive_report_templates_code_key" ON "executive_report_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "executive_reports_reportNumber_key" ON "executive_reports"("reportNumber");

-- CreateIndex
CREATE INDEX "executive_reports_reportType_generatedAt_idx" ON "executive_reports"("reportType", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "executive_reports_templateId_periodStart_periodEnd_reportVe_key" ON "executive_reports"("templateId", "periodStart", "periodEnd", "reportVersion");

-- CreateIndex
CREATE UNIQUE INDEX "phase6_configuration_key_key" ON "phase6_configuration"("key");

-- Referential integrity is explicit because Phase 6 extends existing identity
-- and infrastructure models without adding duplicate Prisma relations.
ALTER TABLE "customer_intelligence_profiles" ADD CONSTRAINT "customer_intelligence_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_intelligence_profiles" ADD CONSTRAINT "customer_intelligence_profiles_primarySegmentId_fkey" FOREIGN KEY ("primarySegmentId") REFERENCES "customer_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_segment_assignments" ADD CONSTRAINT "customer_segment_assignments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_segment_assignments" ADD CONSTRAINT "customer_segment_assignments_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_segment_assignments" ADD CONSTRAINT "customer_segment_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_intelligence_snapshots" ADD CONSTRAINT "customer_intelligence_snapshots_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_profiles" ADD CONSTRAINT "loyalty_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_profiles" ADD CONSTRAINT "loyalty_profiles_membershipLevelId_fkey" FOREIGN KEY ("membershipLevelId") REFERENCES "membership_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_transactionTypeId_fkey" FOREIGN KEY ("transactionTypeId") REFERENCES "reward_transaction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_history" ADD CONSTRAINT "membership_history_newLevelId_fkey" FOREIGN KEY ("newLevelId") REFERENCES "membership_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_referrerCustomerId_fkey" FOREIGN KEY ("referrerCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_referredCustomerId_fkey" FOREIGN KEY ("referredCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "referral_status_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_history" ADD CONSTRAINT "referral_history_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "customer_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loyalty_snapshots" ADD CONSTRAINT "loyalty_snapshots_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "executive_reports" ADD CONSTRAINT "executive_reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "executive_report_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "one_active_primary_segment_per_customer" ON "customer_segment_assignments" ("customerId") WHERE "active" = true AND "isPrimary" = true;
CREATE UNIQUE INDEX "one_active_segment_per_customer" ON "customer_segment_assignments" ("customerId", "segmentId") WHERE "active" = true;
ALTER TABLE "customer_referrals" ADD CONSTRAINT "customer_referrals_no_self_referral" CHECK ("referrerCustomerId" <> "referredCustomerId");

CREATE SEQUENCE "reward_ledger_number_seq";
CREATE SEQUENCE "referral_reference_code_seq";
CREATE SEQUENCE "executive_report_number_seq";
CREATE OR REPLACE FUNCTION phase6_assign_numbers() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'reward_ledger_entries' AND (NEW."ledgerNumber" IS NULL OR NEW."ledgerNumber" = '') THEN NEW."ledgerNumber" := 'RWD-' || LPAD(nextval('reward_ledger_number_seq')::text, 8, '0'); END IF;
  IF TG_TABLE_NAME = 'customer_referrals' AND (NEW."referenceCode" IS NULL OR NEW."referenceCode" = '') THEN NEW."referenceCode" := 'REF-' || LPAD(nextval('referral_reference_code_seq')::text, 8, '0'); END IF;
  IF TG_TABLE_NAME = 'executive_reports' AND (NEW."reportNumber" IS NULL OR NEW."reportNumber" = '') THEN NEW."reportNumber" := 'EXR-' || LPAD(nextval('executive_report_number_seq')::text, 8, '0'); END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "reward_ledger_number_trigger" BEFORE INSERT ON "reward_ledger_entries" FOR EACH ROW EXECUTE FUNCTION phase6_assign_numbers();
CREATE TRIGGER "referral_reference_code_trigger" BEFORE INSERT ON "customer_referrals" FOR EACH ROW EXECUTE FUNCTION phase6_assign_numbers();
CREATE TRIGGER "executive_report_number_trigger" BEFORE INSERT ON "executive_reports" FOR EACH ROW EXECUTE FUNCTION phase6_assign_numbers();

CREATE OR REPLACE FUNCTION phase6_reject_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Phase 6 historical records are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "customer_intelligence_snapshots_immutable" BEFORE UPDATE OR DELETE ON "customer_intelligence_snapshots" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
CREATE TRIGGER "reward_ledger_entries_immutable" BEFORE UPDATE OR DELETE ON "reward_ledger_entries" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
CREATE TRIGGER "membership_history_immutable" BEFORE UPDATE OR DELETE ON "membership_history" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
CREATE TRIGGER "referral_history_immutable" BEFORE UPDATE OR DELETE ON "referral_history" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
CREATE TRIGGER "loyalty_snapshots_immutable" BEFORE UPDATE OR DELETE ON "loyalty_snapshots" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
CREATE TRIGGER "executive_reports_immutable" BEFORE UPDATE OR DELETE ON "executive_reports" FOR EACH ROW EXECUTE FUNCTION phase6_reject_mutation();
