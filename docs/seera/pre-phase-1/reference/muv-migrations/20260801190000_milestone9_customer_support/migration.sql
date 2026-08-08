-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('GENERAL_INQUIRY', 'COMPLAINT', 'PRODUCT_ISSUE', 'RETURN_REPLACEMENT', 'REFUND', 'WARRANTY_CLAIM', 'ORDER_STATUS', 'BILLING', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_INTERNAL', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('WEBSITE', 'EMAIL', 'PHONE', 'WHATSAPP', 'SOCIAL_MEDIA', 'MARKETPLACE', 'WALK_IN', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "SupportCaseType" AS ENUM ('SIMPLE', 'COMPLEX');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "channel" "SupportChannel" NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "caseType" "SupportCaseType" NOT NULL DEFAULT 'SIMPLE',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'NEW',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "severity" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "instOrderId" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "departmentId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "ownerTeamId" TEXT,
    "slaPolicyId" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "slaPaused" BOOLEAN NOT NULL DEFAULT false,
    "slaPausedAt" TIMESTAMP(3),
    "slaPausedMinutes" INTEGER NOT NULL DEFAULT 0,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_links" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_product_issue_reports" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "batchId" TEXT,
    "issueType" TEXT NOT NULL,
    "evidenceUrls" TEXT[],
    "rootCauseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_product_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_return_requests" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_refund_requests" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "orderId" TEXT,
    "instOrderId" TEXT,
    "requestedAmount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "financeEventLogId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_warranty_registrations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "orderId" TEXT,
    "serialOrBatchRef" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "warrantyExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "registeredById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_warranty_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "channel" "SupportChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_notes" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_follow_ups" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_departments" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sla_policies" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupportTicketCategory",
    "priority" "SupportPriority",
    "responseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_business_hours" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "support_business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_holidays" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "support_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_escalation_rules" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "chainJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_escalation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_escalations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "escalatedToId" TEXT,
    "escalatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_feedback" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_csat_responses" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "support_csat_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_nps_responses" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "surveyRound" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_nps_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_kb_categories" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "support_kb_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_kb_articles" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_kb_article_versions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_kb_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_kb_article_views" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "viewedById" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_kb_article_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_faqs" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "kbCategoryId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_resolution_templates" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "SupportTicketCategory",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_resolution_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_template_usage" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "usedById" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_template_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_status_priority_idx" ON "support_tickets"("organizationKey", "status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_assignedToId_status_idx" ON "support_tickets"("organizationKey", "assignedToId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_customerId_idx" ON "support_tickets"("organizationKey", "customerId");

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_departmentId_status_idx" ON "support_tickets"("organizationKey", "departmentId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_responseDueAt_idx" ON "support_tickets"("organizationKey", "responseDueAt");

-- CreateIndex
CREATE INDEX "support_tickets_organizationKey_resolutionDueAt_idx" ON "support_tickets"("organizationKey", "resolutionDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_organizationKey_ticketNumber_key" ON "support_tickets"("organizationKey", "ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_links_organizationKey_parentId_childId_key" ON "support_ticket_links"("organizationKey", "parentId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "support_product_issue_reports_ticketId_key" ON "support_product_issue_reports"("ticketId");

-- CreateIndex
CREATE INDEX "support_product_issue_reports_organizationKey_batchId_idx" ON "support_product_issue_reports"("organizationKey", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "support_return_requests_ticketId_key" ON "support_return_requests"("ticketId");

-- CreateIndex
CREATE INDEX "support_return_requests_organizationKey_orderId_idx" ON "support_return_requests"("organizationKey", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "support_refund_requests_ticketId_key" ON "support_refund_requests"("ticketId");

-- CreateIndex
CREATE INDEX "support_refund_requests_organizationKey_orderId_idx" ON "support_refund_requests"("organizationKey", "orderId");

-- CreateIndex
CREATE INDEX "support_warranty_registrations_organizationKey_customerId_idx" ON "support_warranty_registrations"("organizationKey", "customerId");

-- CreateIndex
CREATE INDEX "support_messages_organizationKey_ticketId_sentAt_idx" ON "support_messages"("organizationKey", "ticketId", "sentAt");

-- CreateIndex
CREATE INDEX "support_ticket_notes_organizationKey_ticketId_idx" ON "support_ticket_notes"("organizationKey", "ticketId");

-- CreateIndex
CREATE INDEX "support_attachments_organizationKey_ticketId_idx" ON "support_attachments"("organizationKey", "ticketId");

-- CreateIndex
CREATE INDEX "support_follow_ups_organizationKey_assignedToId_status_dueA_idx" ON "support_follow_ups"("organizationKey", "assignedToId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_departments_organizationKey_code_key" ON "support_departments"("organizationKey", "code");

-- CreateIndex
CREATE INDEX "support_sla_policies_organizationKey_active_category_priori_idx" ON "support_sla_policies"("organizationKey", "active", "category", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "support_business_hours_organizationKey_dayOfWeek_key" ON "support_business_hours"("organizationKey", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "support_holidays_organizationKey_date_key" ON "support_holidays"("organizationKey", "date");

-- CreateIndex
CREATE INDEX "support_escalation_rules_organizationKey_active_triggerType_idx" ON "support_escalation_rules"("organizationKey", "active", "triggerType");

-- CreateIndex
CREATE INDEX "support_escalations_organizationKey_ticketId_idx" ON "support_escalations"("organizationKey", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "support_escalations_organizationKey_ticketId_ruleId_level_key" ON "support_escalations"("organizationKey", "ticketId", "ruleId", "level");

-- CreateIndex
CREATE INDEX "support_feedback_organizationKey_customerId_idx" ON "support_feedback"("organizationKey", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "support_csat_responses_ticketId_key" ON "support_csat_responses"("ticketId");

-- CreateIndex
CREATE INDEX "support_nps_responses_organizationKey_customerId_idx" ON "support_nps_responses"("organizationKey", "customerId");

-- CreateIndex
CREATE INDEX "support_kb_articles_organizationKey_status_visibility_idx" ON "support_kb_articles"("organizationKey", "status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "support_kb_articles_organizationKey_slug_key" ON "support_kb_articles"("organizationKey", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "support_kb_article_versions_articleId_version_key" ON "support_kb_article_versions"("articleId", "version");

-- CreateIndex
CREATE INDEX "support_kb_article_views_organizationKey_articleId_idx" ON "support_kb_article_views"("organizationKey", "articleId");

-- CreateIndex
CREATE INDEX "support_faqs_organizationKey_isPublic_idx" ON "support_faqs"("organizationKey", "isPublic");

-- CreateIndex
CREATE INDEX "support_resolution_templates_organizationKey_active_categor_idx" ON "support_resolution_templates"("organizationKey", "active", "category");

-- CreateIndex
CREATE INDEX "support_template_usage_organizationKey_templateId_idx" ON "support_template_usage"("organizationKey", "templateId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "support_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_product_issue_reports" ADD CONSTRAINT "support_product_issue_reports_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_return_requests" ADD CONSTRAINT "support_return_requests_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_refund_requests" ADD CONSTRAINT "support_refund_requests_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_notes" ADD CONSTRAINT "support_ticket_notes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_follow_ups" ADD CONSTRAINT "support_follow_ups_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_escalations" ADD CONSTRAINT "support_escalations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_csat_responses" ADD CONSTRAINT "support_csat_responses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_kb_articles" ADD CONSTRAINT "support_kb_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "support_kb_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_kb_article_versions" ADD CONSTRAINT "support_kb_article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "support_kb_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_kb_article_views" ADD CONSTRAINT "support_kb_article_views_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "support_kb_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_template_usage" ADD CONSTRAINT "support_template_usage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "support_resolution_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_template_usage" ADD CONSTRAINT "support_template_usage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
