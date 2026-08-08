-- CreateTable
CREATE TABLE "seera_journey_plans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "geographyType" TEXT NOT NULL,
    "geographyId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "deviationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_journey_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_targets" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metricType" TEXT NOT NULL,
    "skuId" TEXT,
    "targetValue" DECIMAL(16,3) NOT NULL,
    "achievementBasis" TEXT NOT NULL DEFAULT 'DELIVERED',
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_collection_entries" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "reference" TEXT,
    "proofFileId" TEXT,
    "invoiceRef" TEXT,
    "remarks" TEXT,
    "actorId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_collection_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_market_intelligence" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT,
    "geographyId" TEXT,
    "competitor" TEXT NOT NULL,
    "product" TEXT,
    "price" DECIMAL(14,2),
    "scheme" TEXT,
    "retailerFeedback" TEXT,
    "newLaunch" TEXT,
    "shelfDisplay" TEXT,
    "marketIssue" TEXT,
    "actorId" TEXT NOT NULL,
    "workSessionId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_market_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_journey_plans_employeeId_effectiveFrom_effectiveTo_idx" ON "seera_journey_plans"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_journey_plans_employeeId_dayOfWeek_geographyId_effect_key" ON "seera_journey_plans"("employeeId", "dayOfWeek", "geographyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "seera_targets_employeeId_periodStart_periodEnd_idx" ON "seera_targets"("employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "seera_targets_employeeId_periodType_periodStart_metricType__key" ON "seera_targets"("employeeId", "periodType", "periodStart", "metricType", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "seera_collection_entries_idempotencyKey_key" ON "seera_collection_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "seera_collection_entries_retailerId_collectedAt_idx" ON "seera_collection_entries"("retailerId", "collectedAt");

-- CreateIndex
CREATE INDEX "seera_market_intelligence_actorId_capturedAt_idx" ON "seera_market_intelligence"("actorId", "capturedAt");

-- CreateIndex
CREATE INDEX "seera_market_intelligence_competitor_geographyId_idx" ON "seera_market_intelligence"("competitor", "geographyId");
