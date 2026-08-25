-- DropIndex
DROP INDEX "seera_da_policies_employeeRole_policyType_effectiveFrom_key";

-- AlterTable
ALTER TABLE "seera_da_policies" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "seera_ta_claims" ADD COLUMN     "dayClassification" "DaPolicyType",
ADD COLUMN     "dayClassificationReason" TEXT,
ADD COLUMN     "dayClassifiedAt" TIMESTAMP(3),
ADD COLUMN     "dayClassifiedById" TEXT;

-- CreateIndex
CREATE INDEX "seera_da_policies_employeeId_status_effectiveFrom_effective_idx" ON "seera_da_policies"("employeeId", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_da_policies_employeeId_employeeRole_policyType_effect_key" ON "seera_da_policies"("employeeId", "employeeRole", "policyType", "effectiveFrom");

