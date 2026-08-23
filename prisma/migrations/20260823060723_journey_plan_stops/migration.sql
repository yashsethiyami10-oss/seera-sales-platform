-- AlterTable
ALTER TABLE "seera_travel_policies" ALTER COLUMN "ratePerKm" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "seera_journey_plan_stops" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "retailerNameSnapshot" TEXT NOT NULL,
    "mobileSnapshot" TEXT,
    "addressSnapshot" JSONB,
    "beatIdSnapshot" TEXT,
    "territoryIdSnapshot" TEXT,
    "distributorIdSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_journey_plan_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_journey_plan_stops_planId_sequence_idx" ON "seera_journey_plan_stops"("planId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "seera_journey_plan_stops_planId_retailerId_key" ON "seera_journey_plan_stops"("planId", "retailerId");

-- AddForeignKey
ALTER TABLE "seera_journey_plan_stops" ADD CONSTRAINT "seera_journey_plan_stops_planId_fkey" FOREIGN KEY ("planId") REFERENCES "seera_journey_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "seera_employee_headquarters_employeeId_status_effectiveFrom_eff" RENAME TO "seera_employee_headquarters_employeeId_status_effectiveFrom_idx";
