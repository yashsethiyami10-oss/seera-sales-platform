CREATE TYPE "SeeraInsightSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'HIGH', 'CRITICAL');
CREATE TYPE "SeeraInsightStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'RESOLVED', 'EXPIRED');
CREATE TYPE "SeeraAutomationExecutionStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');
CREATE TYPE "SeeraReportFormat" AS ENUM ('CSV', 'PRINT', 'PDF');

CREATE TABLE "seera_automation_rules" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "category" TEXT NOT NULL, "eventCode" TEXT NOT NULL,
  "condition" JSONB NOT NULL, "recipientScope" JSONB NOT NULL, "channels" "NotificationChannel"[],
  "templateKey" TEXT NOT NULL, "defaultLanguage" "UiLanguage" NOT NULL DEFAULT 'EN', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "timingOffsetMinutes" INTEGER NOT NULL DEFAULT 0, "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "severity" "SeeraInsightSeverity" NOT NULL DEFAULT 'INFO', "cooldownMinutes" INTEGER NOT NULL DEFAULT 1440,
  "configuration" JSONB, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "seera_automation_rules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "seera_automation_executions" (
  "id" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
  "language" "UiLanguage" NOT NULL, "status" "SeeraAutomationExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "deduplicationKey" TEXT NOT NULL, "attemptCount" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3),
  "sourceMetrics" JSONB NOT NULL, "providerReferences" JSONB, "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3),
  CONSTRAINT "seera_automation_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "seera_insights" (
  "id" TEXT NOT NULL, "ruleCode" TEXT NOT NULL, "subjectType" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL, "severity" "SeeraInsightSeverity" NOT NULL, "explanationKey" TEXT NOT NULL,
  "explanationArgs" JSONB NOT NULL, "sourceMetrics" JSONB NOT NULL, "confidence" DECIMAL(5,4), "actionPath" TEXT,
  "status" "SeeraInsightStatus" NOT NULL DEFAULT 'ACTIVE', "deduplicationKey" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "seera_insights_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "seera_report_exports" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "reportCode" TEXT NOT NULL, "format" "SeeraReportFormat" NOT NULL,
  "filters" JSONB NOT NULL, "scopeSnapshot" JSONB NOT NULL, "rowCount" INTEGER NOT NULL,
  "sensitive" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seera_report_exports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seera_automation_rules_code_key" ON "seera_automation_rules"("code");
CREATE INDEX "seera_automation_rules_category_eventCode_enabled_idx" ON "seera_automation_rules"("category","eventCode","enabled");
CREATE UNIQUE INDEX "seera_automation_executions_deduplicationKey_key" ON "seera_automation_executions"("deduplicationKey");
CREATE INDEX "seera_automation_executions_status_nextAttemptAt_idx" ON "seera_automation_executions"("status","nextAttemptAt");
CREATE INDEX "seera_automation_executions_recipientId_createdAt_idx" ON "seera_automation_executions"("recipientId","createdAt");
CREATE UNIQUE INDEX "seera_insights_deduplicationKey_key" ON "seera_insights"("deduplicationKey");
CREATE INDEX "seera_insights_recipientId_status_severity_generatedAt_idx" ON "seera_insights"("recipientId","status","severity","generatedAt");
CREATE INDEX "seera_insights_subjectType_subjectId_idx" ON "seera_insights"("subjectType","subjectId");
CREATE INDEX "seera_report_exports_actorId_reportCode_createdAt_idx" ON "seera_report_exports"("actorId","reportCode","createdAt");
ALTER TABLE "seera_automation_rules" ADD CONSTRAINT "seera_automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seera_automation_executions" ADD CONSTRAINT "seera_automation_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "seera_automation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seera_automation_executions" ADD CONSTRAINT "seera_automation_executions_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seera_insights" ADD CONSTRAINT "seera_insights_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seera_report_exports" ADD CONSTRAINT "seera_report_exports_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
