CREATE TYPE "TravelDutyType" AS ENUM ('UNCLASSIFIED', 'LOCAL_HQ', 'OUTSTATION');
CREATE TYPE "DaPolicyType" AS ENUM ('HALF_DAY', 'FULL_DAY', 'OVERNIGHT');

CREATE TABLE "seera_employee_headquarters" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "headquartersName" TEXT NOT NULL,
  "geographyId" TEXT,
  "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "configuredById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seera_employee_headquarters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seera_employee_headquarters_employeeId_effectiveFrom_key" ON "seera_employee_headquarters"("employeeId", "effectiveFrom");
CREATE INDEX "seera_employee_headquarters_employeeId_status_effectiveFrom_effectiveTo_idx" ON "seera_employee_headquarters"("employeeId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "seera_employee_headquarters_geographyId_status_idx" ON "seera_employee_headquarters"("geographyId", "status");

CREATE TABLE "seera_da_policies" (
  "id" TEXT NOT NULL,
  "employeeRole" TEXT,
  "policyType" "DaPolicyType" NOT NULL,
  "amount" DECIMAL(12,2),
  "status" "TravelPolicyStatus" NOT NULL DEFAULT 'INACTIVE',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "approvedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seera_da_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seera_da_policies_employeeRole_policyType_effectiveFrom_key" ON "seera_da_policies"("employeeRole", "policyType", "effectiveFrom");
CREATE INDEX "seera_da_policies_status_effectiveFrom_effectiveTo_idx" ON "seera_da_policies"("status", "effectiveFrom", "effectiveTo");

ALTER TABLE "seera_ta_claims"
  ADD COLUMN "dutyType" "TravelDutyType" NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "dutyClassificationSource" TEXT,
  ADD COLUMN "classifiedById" TEXT,
  ADD COLUMN "classifiedAt" TIMESTAMP(3),
  ADD COLUMN "classificationReason" TEXT,
  ADD COLUMN "hqAssignmentId" TEXT,
  ADD COLUMN "taPolicyId" TEXT,
  ADD COLUMN "taMode" "TravelPolicyType",
  ADD COLUMN "taRatePerKm" DECIMAL(12,2),
  ADD COLUMN "taAmount" DECIMAL(14,2),
  ADD COLUMN "daEligible" BOOLEAN,
  ADD COLUMN "daPolicyId" TEXT,
  ADD COLUMN "daAmount" DECIMAL(14,2),
  ADD COLUMN "daStatus" TEXT NOT NULL DEFAULT 'NOT_EVALUATED',
  ADD COLUMN "totalReimbursement" DECIMAL(14,2);
