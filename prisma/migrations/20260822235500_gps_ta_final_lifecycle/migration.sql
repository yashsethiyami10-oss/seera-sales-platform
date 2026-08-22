ALTER TYPE "TaClaimStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "TaClaimStatus" ADD VALUE IF NOT EXISTS 'TRAVEL_REVIEW_REQUIRED';
ALTER TYPE "TaClaimStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "TaClaimStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_ACCOUNTS';

CREATE TYPE "TravelPolicyType" AS ENUM ('PER_KM', 'FIXED_DAILY', 'PER_KM_PLUS_FIXED', 'NONE');
CREATE TYPE "TravelPolicyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "seera_travel_policies"
  ADD COLUMN "policyType" "TravelPolicyType" NOT NULL DEFAULT 'PER_KM',
  ADD COLUMN "employeeRole" TEXT,
  ADD COLUMN "status" "TravelPolicyStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "seera_ta_claims"
  ADD COLUMN "paidById" TEXT,
  ADD COLUMN "policyStatus" TEXT NOT NULL DEFAULT 'CONFIGURED',
  ADD COLUMN "gpsReviewRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "sentToAccountsAt" TIMESTAMP(3),
  ADD COLUMN "returnedAt" TIMESTAMP(3),
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "amountPaid" DECIMAL(14,2),
  ALTER COLUMN "travelAmount" DROP NOT NULL,
  ALTER COLUMN "totalClaimed" DROP NOT NULL;

CREATE UNIQUE INDEX "seera_ta_claims_travelEstimateId_key"
  ON "seera_ta_claims"("travelEstimateId");
