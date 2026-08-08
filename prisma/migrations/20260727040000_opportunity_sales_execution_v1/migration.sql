-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateTable
CREATE TABLE "opportunity_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "probabilityDefault" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_lost_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_won_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_won_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "opportunityNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceInquiryId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "territoryId" TEXT,
    "salesChannelId" TEXT,
    "customerTypeId" TEXT,
    "currentStageId" TEXT NOT NULL,
    "lostReasonId" TEXT,
    "wonReasonId" TEXT,
    "estimatedValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "probability" INTEGER NOT NULL,
    "priorityId" TEXT NOT NULL,
    "expectedCloseDate" TIMESTAMP(3),
    "actualCloseDate" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "leadSourceId" TEXT,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "previousStageId" TEXT,
    "newStageId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_activity_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_activity_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_activity_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_activities" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "performedBy" TEXT NOT NULL,
    "assignedTo" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "statusId" TEXT NOT NULL,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_task_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_task_statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_task_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_priorities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_tasks" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priorityId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "territoryId" TEXT,

    CONSTRAINT "opportunity_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_notes" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_attachments" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "storageReference" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_orders" (
    "opportunityId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "opportunity_orders_pkey" PRIMARY KEY ("opportunityId","orderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_stages_name_key" ON "opportunity_stages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_stages_code_key" ON "opportunity_stages"("code");

-- CreateIndex
CREATE INDEX "opportunity_stages_active_displayOrder_idx" ON "opportunity_stages"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_lost_reasons_code_key" ON "opportunity_lost_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_won_reasons_code_key" ON "opportunity_won_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_opportunityNumber_key" ON "opportunities"("opportunityNumber");

-- CreateIndex
CREATE INDEX "opportunities_customerId_createdAt_idx" ON "opportunities"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunities_sourceInquiryId_idx" ON "opportunities"("sourceInquiryId");

-- CreateIndex
CREATE INDEX "opportunities_ownerUserId_status_idx" ON "opportunities"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "opportunities_currentStageId_status_idx" ON "opportunities"("currentStageId", "status");

-- CreateIndex
CREATE INDEX "opportunities_territoryId_status_idx" ON "opportunities"("territoryId", "status");

-- CreateIndex
CREATE INDEX "opportunities_salesChannelId_createdAt_idx" ON "opportunities"("salesChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunities_customerTypeId_idx" ON "opportunities"("customerTypeId");

-- CreateIndex
CREATE INDEX "opportunities_priorityId_idx" ON "opportunities"("priorityId");

-- CreateIndex
CREATE INDEX "opportunities_expectedCloseDate_idx" ON "opportunities"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "opportunities_createdAt_idx" ON "opportunities"("createdAt");

-- CreateIndex
CREATE INDEX "opportunities_updatedAt_idx" ON "opportunities"("updatedAt");

-- CreateIndex
CREATE INDEX "opportunities_estimatedValue_idx" ON "opportunities"("estimatedValue");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_opportunityId_changedAt_idx" ON "opportunity_stage_history"("opportunityId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_activity_types_code_key" ON "opportunity_activity_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_activity_statuses_code_key" ON "opportunity_activity_statuses"("code");

-- CreateIndex
CREATE INDEX "opportunity_activities_opportunityId_createdAt_idx" ON "opportunity_activities"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunity_activities_assignedTo_statusId_scheduledAt_idx" ON "opportunity_activities"("assignedTo", "statusId", "scheduledAt");

-- CreateIndex
CREATE INDEX "opportunity_activities_customerId_createdAt_idx" ON "opportunity_activities"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_task_types_code_key" ON "opportunity_task_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_task_statuses_code_key" ON "opportunity_task_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_priorities_code_key" ON "opportunity_priorities"("code");

-- CreateIndex
CREATE INDEX "opportunity_tasks_ownerUserId_statusId_dueDate_idx" ON "opportunity_tasks"("ownerUserId", "statusId", "dueDate");

-- CreateIndex
CREATE INDEX "opportunity_tasks_opportunityId_dueDate_idx" ON "opportunity_tasks"("opportunityId", "dueDate");

-- CreateIndex
CREATE INDEX "opportunity_tasks_customerId_createdAt_idx" ON "opportunity_tasks"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunity_notes_opportunityId_createdAt_idx" ON "opportunity_notes"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunity_attachments_opportunityId_createdAt_idx" ON "opportunity_attachments"("opportunityId", "createdAt");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_sourceInquiryId_fkey" FOREIGN KEY ("sourceInquiryId") REFERENCES "sales_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "customer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "opportunity_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lostReasonId_fkey" FOREIGN KEY ("lostReasonId") REFERENCES "opportunity_lost_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_wonReasonId_fkey" FOREIGN KEY ("wonReasonId") REFERENCES "opportunity_won_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "opportunity_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_previousStageId_fkey" FOREIGN KEY ("previousStageId") REFERENCES "opportunity_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_newStageId_fkey" FOREIGN KEY ("newStageId") REFERENCES "opportunity_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "opportunity_activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "opportunity_activity_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_activities" ADD CONSTRAINT "opportunity_activities_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "opportunity_task_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "opportunity_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "opportunity_task_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_tasks" ADD CONSTRAINT "opportunity_tasks_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_notes" ADD CONSTRAINT "opportunity_notes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_notes" ADD CONSTRAINT "opportunity_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_attachments" ADD CONSTRAINT "opportunity_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_orders" ADD CONSTRAINT "opportunity_orders_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_orders" ADD CONSTRAINT "opportunity_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 3 invariants and concurrency-safe, never-reused numbering.
ALTER TABLE "opportunity_stages"
  ADD CONSTRAINT "opportunity_stages_probability_check"
  CHECK ("probabilityDefault" BETWEEN 0 AND 100);
ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
  ADD CONSTRAINT "opportunities_estimated_value_check" CHECK ("estimatedValue" >= 0);
ALTER TABLE "opportunity_attachments"
  ADD CONSTRAINT "opportunity_attachments_size_check" CHECK ("sizeBytes" >= 0);

CREATE SEQUENCE IF NOT EXISTS "opportunity_number_seq" START 1;
CREATE OR REPLACE FUNCTION "assign_opportunity_number"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."opportunityNumber" IS NULL OR NEW."opportunityNumber" = '' THEN
    NEW."opportunityNumber" :=
      'MUV-OPP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
      LPAD(NEXTVAL('opportunity_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "opportunity_number_before_insert"
BEFORE INSERT ON "opportunities"
FOR EACH ROW EXECUTE FUNCTION "assign_opportunity_number"();

-- Stage history and notes are historical records: updates and deletes are
-- rejected even for direct SQL clients.
CREATE OR REPLACE FUNCTION "reject_phase3_history_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "opportunity_stage_history_immutable"
BEFORE UPDATE OR DELETE ON "opportunity_stage_history"
FOR EACH ROW EXECUTE FUNCTION "reject_phase3_history_mutation"();
CREATE TRIGGER "opportunity_notes_no_delete"
BEFORE DELETE ON "opportunity_notes"
FOR EACH ROW EXECUTE FUNCTION "reject_phase3_history_mutation"();
