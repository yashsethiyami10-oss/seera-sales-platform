-- AlterTable
ALTER TABLE "network_agreements" ADD COLUMN     "correctionReason" TEXT,
ADD COLUMN     "previousVersionId" TEXT;

-- AlterTable
ALTER TABLE "network_claims" ADD COLUMN     "approvedAmount" DECIMAL(18,2),
ADD COLUMN     "remainingAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "network_compliance_requirements" ADD COLUMN     "trainingProgramId" TEXT;

-- AlterTable
ALTER TABLE "network_training_assignments" ADD COLUMN     "certificationReference" TEXT,
ADD COLUMN     "renewalDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "network_partner_order_sources" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "territoryKey" TEXT,
    "metricKey" TEXT NOT NULL DEFAULT 'REVENUE',
    "attributedAmount" DECIMAL(18,2) NOT NULL,
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_partner_order_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_partner_order_sources_organizationKey_partnerId_met_idx" ON "network_partner_order_sources"("organizationKey", "partnerId", "metricKey", "effectiveAt");

-- CreateIndex
CREATE INDEX "network_partner_order_sources_organizationKey_territoryKey__idx" ON "network_partner_order_sources"("organizationKey", "territoryKey", "metricKey", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "network_partner_order_source_key" ON "network_partner_order_sources"("organizationKey", "partnerId", "orderId", "metricKey", "sourceVersion");

-- AddForeignKey
ALTER TABLE "network_compliance_requirements" ADD CONSTRAINT "network_compliance_requirements_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "network_training_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_order_sources" ADD CONSTRAINT "network_partner_order_sources_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "network_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_partner_order_sources" ADD CONSTRAINT "network_partner_order_sources_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Finalized Part 3B history is append-only. Corrections create successor rows.
CREATE OR REPLACE FUNCTION prevent_finalized_network_mutation()
RETURNS TRIGGER AS $$
DECLARE protected BOOLEAN := FALSE;
BEGIN
  protected := CASE TG_TABLE_NAME
    WHEN 'network_agreements' THEN OLD.status IN ('APPROVED','PENDING_EXECUTION','ACTIVE','EXPIRED','TERMINATED','SUPERSEDED')
    WHEN 'network_royalty_runs' THEN OLD.status IN ('FINALIZED','REVERSED')
    WHEN 'network_commission_runs' THEN OLD.status IN ('FINALIZED','REVERSED')
    WHEN 'network_claims' THEN OLD.status IN ('APPROVED','PARTIALLY_APPROVED','SETTLED')
    WHEN 'network_target_plans' THEN OLD.status IN ('APPROVED','FINALIZED','ACTIVE')
    WHEN 'network_training_assignments' THEN OLD.status IN ('COMPLETED','EXPIRED')
    WHEN 'network_compliance_records' THEN OLD.status IN ('COMPLIANT','NON_COMPLIANT','EXPIRED')
    ELSE FALSE
  END;
  IF protected THEN
    RAISE EXCEPTION 'Finalized Enterprise Business Network history is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER network_agreements_immutable BEFORE UPDATE OR DELETE ON "network_agreements"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_royalty_runs_immutable BEFORE UPDATE OR DELETE ON "network_royalty_runs"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_commission_runs_immutable BEFORE UPDATE OR DELETE ON "network_commission_runs"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_claims_immutable BEFORE UPDATE OR DELETE ON "network_claims"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_target_plans_immutable BEFORE UPDATE OR DELETE ON "network_target_plans"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_training_assignments_immutable BEFORE UPDATE OR DELETE ON "network_training_assignments"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();
CREATE TRIGGER network_compliance_records_immutable BEFORE UPDATE OR DELETE ON "network_compliance_records"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_network_mutation();

-- Enforce organization consistency at the database boundary for every
-- organization-aware Part 3B parent/child relationship.
CREATE OR REPLACE FUNCTION enforce_network_parent_organization()
RETURNS TRIGGER AS $$
DECLARE parent_org TEXT;
BEGIN
  EXECUTE format('SELECT "organizationKey" FROM %I WHERE id = $1', TG_ARGV[0])
    INTO parent_org USING (to_jsonb(NEW) ->> TG_ARGV[1]);
  IF parent_org IS NULL OR parent_org <> NEW."organizationKey" THEN
    RAISE EXCEPTION 'Cross-organization Enterprise Business Network reference denied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER network_contact_partner_org BEFORE INSERT OR UPDATE ON "network_partner_contacts" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_address_partner_org BEFORE INSERT OR UPDATE ON "network_partner_addresses" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_profile_partner_org BEFORE INSERT OR UPDATE ON "network_partner_profiles" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_hierarchy_parent_org BEFORE INSERT OR UPDATE ON "network_partner_hierarchy" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','parentPartnerId');
CREATE TRIGGER network_hierarchy_child_org BEFORE INSERT OR UPDATE ON "network_partner_hierarchy" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','childPartnerId');
CREATE TRIGGER network_onboarding_partner_org BEFORE INSERT OR UPDATE ON "network_onboarding_cases" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_onboarding_requirement_org BEFORE INSERT OR UPDATE ON "network_onboarding_requirements" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_onboarding_cases','onboardingId');
CREATE TRIGGER network_assignment_territory_org BEFORE INSERT OR UPDATE ON "network_territory_assignments" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_territories','territoryId');
CREATE TRIGGER network_assignment_partner_org BEFORE INSERT OR UPDATE ON "network_territory_assignments" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_agreement_partner_org BEFORE INSERT OR UPDATE ON "network_agreements" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_royalty_line_run_org BEFORE INSERT OR UPDATE ON "network_royalty_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_royalty_runs','runId');
CREATE TRIGGER network_royalty_line_partner_org BEFORE INSERT OR UPDATE ON "network_royalty_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_commission_line_run_org BEFORE INSERT OR UPDATE ON "network_commission_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_commission_runs','runId');
CREATE TRIGGER network_commission_line_partner_org BEFORE INSERT OR UPDATE ON "network_commission_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_target_line_plan_org BEFORE INSERT OR UPDATE ON "network_target_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_target_plans','planId');
CREATE TRIGGER network_target_line_partner_org BEFORE INSERT OR UPDATE ON "network_target_lines" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_claim_partner_org BEFORE INSERT OR UPDATE ON "network_claims" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_support_partner_org BEFORE INSERT OR UPDATE ON "network_support_cases" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_training_assignment_program_org BEFORE INSERT OR UPDATE ON "network_training_assignments" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_training_programs','programId');
CREATE TRIGGER network_training_assignment_partner_org BEFORE INSERT OR UPDATE ON "network_training_assignments" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_compliance_record_requirement_org BEFORE INSERT OR UPDATE ON "network_compliance_records" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_compliance_requirements','requirementId');
CREATE TRIGGER network_compliance_record_partner_org BEFORE INSERT OR UPDATE ON "network_compliance_records" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_partner_user_partner_org BEFORE INSERT OR UPDATE ON "network_partner_users" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
CREATE TRIGGER network_order_source_partner_org BEFORE INSERT OR UPDATE ON "network_partner_order_sources" FOR EACH ROW EXECUTE FUNCTION enforce_network_parent_organization('network_partners','partnerId');
