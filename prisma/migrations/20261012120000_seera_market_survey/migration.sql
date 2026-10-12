-- Seera Retailer Market Survey & Recovery. Strictly additive: three new tables plus three
-- new permissions and their role grants. Idempotent (ON CONFLICT DO NOTHING); no existing
-- row is updated or deleted and no business/demo data is created.

-- CreateTable
CREATE TABLE "seera_market_surveys" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "retailerId" TEXT,
    "shopName" TEXT NOT NULL,
    "contactName" TEXT,
    "mobile" TEXT,
    "market" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gpsAccuracyM" INTEGER,
    "relationship" TEXT NOT NULL,
    "issues" TEXT[],
    "issueOther" TEXT,
    "retailerWords" TEXT,
    "staffInterpretation" TEXT,
    "competitorBrand" TEXT,
    "competitorPackSize" TEXT,
    "competitorPurchasePrice" DECIMAL(14,2),
    "competitorMrp" DECIMAL(14,2),
    "competitorWeeklyUnits" INTEGER,
    "competitorReason" TEXT,
    "competitorVisitFrequency" TEXT,
    "willingToReconsider" TEXT NOT NULL,
    "shelfSpace" TEXT NOT NULL,
    "trialQuantityOk" TEXT NOT NULL,
    "wantsTesting" BOOLEAN NOT NULL DEFAULT false,
    "wantsQuotation" BOOLEAN NOT NULL DEFAULT false,
    "wantsFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "notInterested" BOOLEAN NOT NULL DEFAULT false,
    "preferredFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "recommendedActions" TEXT[],
    "recommendedActionOther" TEXT,
    "consentStatus" TEXT NOT NULL,
    "consentScopes" TEXT[],
    "consentOther" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "followUpStatus" TEXT NOT NULL DEFAULT 'NEW',
    "followUpAssigneeId" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "trialAgreed" BOOLEAN,
    "lastOutcome" TEXT,
    "whatsappState" TEXT NOT NULL,
    "followUpOutboxEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_market_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_market_survey_activities" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_market_survey_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seera_market_survey_links" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "outboxEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_market_survey_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seera_market_surveys_reference_key" ON "seera_market_surveys"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "seera_market_surveys_idempotencyKey_key" ON "seera_market_surveys"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "seera_market_surveys_followUpOutboxEventId_key" ON "seera_market_surveys"("followUpOutboxEventId");

-- CreateIndex
CREATE INDEX "seera_market_surveys_createdAt_idx" ON "seera_market_surveys"("createdAt");

-- CreateIndex
CREATE INDEX "seera_market_surveys_staffUserId_createdAt_idx" ON "seera_market_surveys"("staffUserId", "createdAt");

-- CreateIndex
CREATE INDEX "seera_market_surveys_market_createdAt_idx" ON "seera_market_surveys"("market", "createdAt");

-- CreateIndex
CREATE INDEX "seera_market_surveys_followUpStatus_followUpDueAt_idx" ON "seera_market_surveys"("followUpStatus", "followUpDueAt");

-- CreateIndex
CREATE INDEX "seera_market_surveys_mobile_createdAt_idx" ON "seera_market_surveys"("mobile", "createdAt");

-- CreateIndex
CREATE INDEX "seera_market_surveys_retailerId_idx" ON "seera_market_surveys"("retailerId");

-- CreateIndex
CREATE INDEX "seera_market_survey_activities_surveyId_createdAt_idx" ON "seera_market_survey_activities"("surveyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "seera_market_survey_links_tokenHash_key" ON "seera_market_survey_links"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "seera_market_survey_links_outboxEventId_key" ON "seera_market_survey_links"("outboxEventId");

-- CreateIndex
CREATE INDEX "seera_market_survey_links_surveyId_createdAt_idx" ON "seera_market_survey_links"("surveyId", "createdAt");

-- AddForeignKey
ALTER TABLE "seera_market_surveys" ADD CONSTRAINT "seera_market_surveys_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_surveys" ADD CONSTRAINT "seera_market_surveys_followUpAssigneeId_fkey" FOREIGN KEY ("followUpAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_surveys" ADD CONSTRAINT "seera_market_surveys_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "seera_retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_survey_activities" ADD CONSTRAINT "seera_market_survey_activities_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "seera_market_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_survey_activities" ADD CONSTRAINT "seera_market_survey_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_survey_links" ADD CONSTRAINT "seera_market_survey_links_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "seera_market_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seera_market_survey_links" ADD CONSTRAINT "seera_market_survey_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Market survey permissions.
INSERT INTO "permissions" ("id","code","resource","action","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text,'market_survey:create','market_survey','create',now(),now()),
  (gen_random_uuid()::text,'market_survey:view_all','market_survey','view_all',now(),now()),
  (gen_random_uuid()::text,'market_survey:manage','market_survey','manage',now(),now())
ON CONFLICT ("code") DO NOTHING;

-- Field staff submit surveys; the Founder and Company Admin review and manage follow-up.
INSERT INTO "role_permissions" ("roleId","permissionId","grantedAt")
SELECT r.id, p.id, now()
FROM (VALUES
  ('SALES_EXECUTIVE','market_survey:create'),
  ('SALES_MANAGER','market_survey:create'),
  ('COMPANY_ADMIN','market_survey:create'),
  ('COMPANY_ADMIN','market_survey:view_all'),
  ('COMPANY_ADMIN','market_survey:manage'),
  ('FOUNDER_SUPER_ADMIN','market_survey:create'),
  ('FOUNDER_SUPER_ADMIN','market_survey:view_all'),
  ('FOUNDER_SUPER_ADMIN','market_survey:manage')
) AS grant_list(role_code, permission_code)
JOIN "roles" r ON r.code = grant_list.role_code
JOIN "permissions" p ON p.code = grant_list.permission_code
ON CONFLICT ("roleId","permissionId") DO NOTHING;
