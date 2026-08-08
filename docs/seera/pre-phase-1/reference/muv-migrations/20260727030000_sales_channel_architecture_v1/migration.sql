-- CreateEnum
CREATE SEQUENCE "sales_inquiry_number_seq" START 1;

ALTER TYPE "NotificationChannel" ADD VALUE 'DASHBOARD';
ALTER TYPE "NotificationStatus" ADD VALUE 'PENDING';

-- CreateEnum
CREATE TYPE "SalesInquiryPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SalesTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IdentityMatchState" AS ENUM ('EXACT', 'POSSIBLE', 'NONE', 'MANUAL_REVIEW');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "assignedOwnerId" TEXT,
ADD COLUMN     "assignedTerritoryId" TEXT,
ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'India',
ADD COLUMN     "crmStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "customerTypeId" TEXT,
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "lifecycleStage" TEXT NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "primaryChannelId" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "customer_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publicVisibility" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultOwnerRoleId" TEXT,
    "defaultAssignmentQueueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_channel_customer_types" (
    "channelId" TEXT NOT NULL,
    "customerTypeId" TEXT NOT NULL,

    CONSTRAINT "sales_channel_customer_types_pkey" PRIMARY KEY ("channelId","customerTypeId")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" TEXT NOT NULL,
    "salesChannelId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_queues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channelId" TEXT,
    "territoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "escalationUserId" TEXT,
    "initialSlaMinutes" INTEGER NOT NULL DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_inquiry_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_inquiry_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_inquiry_status_transitions" (
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT NOT NULL,

    CONSTRAINT "sales_inquiry_status_transitions_pkey" PRIMARY KEY ("fromStatusId","toStatusId")
);

-- CreateTable
CREATE TABLE "sales_application_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_application_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_inquiries" (
    "id" TEXT NOT NULL,
    "inquiryNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "salesChannelId" TEXT NOT NULL,
    "leadSourceId" TEXT NOT NULL,
    "customerTypeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "requirementSummary" TEXT NOT NULL,
    "priority" "SalesInquiryPriority" NOT NULL DEFAULT 'NORMAL',
    "statusId" TEXT NOT NULL,
    "assignedOwnerId" TEXT,
    "assignmentQueueId" TEXT,
    "territoryId" TEXT,
    "submittedUserId" TEXT,
    "campaignData" JSONB,
    "sourceUrl" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "responseSlaAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "identityMatchState" "IdentityMatchState" NOT NULL DEFAULT 'NONE',
    "possibleCustomerId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "sales_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutional_inquiry_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "institutionType" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "numberOfLocations" INTEGER,
    "monthlyRequirement" TEXT,
    "currentProducts" TEXT[],
    "painPoints" TEXT,
    "requestedCategories" TEXT[],
    "siteVisitRequired" BOOLEAN NOT NULL DEFAULT false,
    "procurementContact" TEXT,
    "expectedPurchaseDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutional_inquiry_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_inquiry_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "locations" INTEGER,
    "employeeCount" INTEGER,
    "annualRequirement" TEXT,
    "procurementProcess" TEXT,
    "contractExpectation" TEXT,
    "requestedCategories" TEXT[],
    "decisionMaker" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_inquiry_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_order_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "requiredDate" TIMESTAMP(3),
    "requestedProducts" TEXT[],
    "requestedQuantities" INTEGER[],
    "estimatedBudget" INTEGER,
    "gstRequired" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_order_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_request_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "requestedProducts" TEXT[],
    "quantities" INTEGER[],
    "deliveryLocation" TEXT NOT NULL,
    "taxRequirement" TEXT,
    "requiredDate" TIMESTAMP(3),
    "attachmentReference" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_request_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_request_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "requestedProducts" TEXT[],
    "reason" TEXT NOT NULL,
    "expectedMonthlyPurchase" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "dispatchStatus" TEXT NOT NULL DEFAULT 'NOT_DISPATCHED',
    "feedbackStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_request_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_application_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "yearsInBusiness" INTEGER NOT NULL,
    "marketArea" TEXT NOT NULL,
    "shopDetails" TEXT,
    "warehouseDetails" TEXT,
    "currentBrands" TEXT[],
    "gstNumber" TEXT,
    "expectedInitialOrder" INTEGER,
    "requestedTerritory" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "applicationStatusId" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_application_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_application_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalStructure" TEXT,
    "warehouseCapacity" TEXT NOT NULL,
    "dealerCount" INTEGER,
    "salesTeamSize" INTEGER,
    "vehicleCount" INTEGER,
    "currentBrands" TEXT[],
    "annualTurnover" INTEGER,
    "investmentCapacity" INTEGER NOT NULL,
    "requestedTerritory" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "financialReviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "applicationStatusId" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_application_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchise_inquiry_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "preferredCity" TEXT NOT NULL,
    "preferredTerritory" TEXT,
    "investmentCapacity" INTEGER NOT NULL,
    "propertyAvailable" BOOLEAN NOT NULL DEFAULT false,
    "timelineExpectation" TEXT NOT NULL,
    "businessExperience" TEXT NOT NULL,
    "applicationStatusId" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "franchise_inquiry_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_sales_details" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "contactReason" TEXT NOT NULL,
    "preferredContactMethod" TEXT,
    "preferredContactTime" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_sales_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_attachments" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "storageReference" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_timeline_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "customerId" TEXT,
    "relatedRecordType" TEXT NOT NULL,
    "relatedRecordId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "inquiryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_follow_up_tasks" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "customerId" TEXT,
    "inquiryId" TEXT NOT NULL,
    "priority" "SalesInquiryPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SalesTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sales_follow_up_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_inquiry_notes" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_inquiry_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_classification_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromTypeId" TEXT,
    "toTypeId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_classification_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_types_name_key" ON "customer_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_types_code_key" ON "customer_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_name_key" ON "sales_channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_code_key" ON "sales_channels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_defaultAssignmentQueueId_key" ON "sales_channels"("defaultAssignmentQueueId");

-- CreateIndex
CREATE INDEX "sales_channels_active_publicVisibility_displayOrder_idx" ON "sales_channels"("active", "publicVisibility", "displayOrder");

-- CreateIndex
CREATE INDEX "sales_channels_defaultOwnerRoleId_idx" ON "sales_channels"("defaultOwnerRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_code_key" ON "lead_sources"("code");

-- CreateIndex
CREATE INDEX "lead_sources_salesChannelId_active_idx" ON "lead_sources"("salesChannelId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_queues_name_key" ON "assignment_queues"("name");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_queues_code_key" ON "assignment_queues"("code");

-- CreateIndex
CREATE INDEX "assignment_queues_channelId_territoryId_active_idx" ON "assignment_queues"("channelId", "territoryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sales_inquiry_statuses_code_key" ON "sales_inquiry_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_application_statuses_code_key" ON "sales_application_statuses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_inquiries_inquiryNumber_key" ON "sales_inquiries"("inquiryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_inquiries_idempotencyKey_key" ON "sales_inquiries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "sales_inquiries_customerId_createdAt_idx" ON "sales_inquiries"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_assignedOwnerId_statusId_idx" ON "sales_inquiries"("assignedOwnerId", "statusId");

-- CreateIndex
CREATE INDEX "sales_inquiries_assignmentQueueId_statusId_idx" ON "sales_inquiries"("assignmentQueueId", "statusId");

-- CreateIndex
CREATE INDEX "sales_inquiries_territoryId_createdAt_idx" ON "sales_inquiries"("territoryId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_salesChannelId_createdAt_idx" ON "sales_inquiries"("salesChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_leadSourceId_createdAt_idx" ON "sales_inquiries"("leadSourceId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_priority_createdAt_idx" ON "sales_inquiries"("priority", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_statusId_createdAt_idx" ON "sales_inquiries"("statusId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_inquiries_updatedAt_idx" ON "sales_inquiries"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "institutional_inquiry_details_inquiryId_key" ON "institutional_inquiry_details"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_inquiry_details_inquiryId_key" ON "corporate_inquiry_details"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_order_details_inquiryId_key" ON "bulk_order_details"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_request_details_inquiryId_key" ON "quotation_request_details"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "sample_request_details_inquiryId_key" ON "sample_request_details"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_application_details_inquiryId_key" ON "dealer_application_details"("inquiryId");

-- CreateIndex
CREATE INDEX "dealer_application_details_applicationStatusId_idx" ON "dealer_application_details"("applicationStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_application_details_inquiryId_key" ON "distributor_application_details"("inquiryId");

-- CreateIndex
CREATE INDEX "distributor_application_details_applicationStatusId_idx" ON "distributor_application_details"("applicationStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "franchise_inquiry_details_inquiryId_key" ON "franchise_inquiry_details"("inquiryId");

-- CreateIndex
CREATE INDEX "franchise_inquiry_details_applicationStatusId_idx" ON "franchise_inquiry_details"("applicationStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_sales_details_inquiryId_key" ON "contact_sales_details"("inquiryId");

-- CreateIndex
CREATE INDEX "inquiry_attachments_inquiryId_idx" ON "inquiry_attachments"("inquiryId");

-- CreateIndex
CREATE INDEX "sales_timeline_events_customerId_createdAt_idx" ON "sales_timeline_events"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_timeline_events_inquiryId_createdAt_idx" ON "sales_timeline_events"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_timeline_events_relatedRecordType_relatedRecordId_idx" ON "sales_timeline_events"("relatedRecordType", "relatedRecordId");

-- CreateIndex
CREATE INDEX "sales_follow_up_tasks_ownerId_status_dueAt_idx" ON "sales_follow_up_tasks"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "sales_follow_up_tasks_inquiryId_idx" ON "sales_follow_up_tasks"("inquiryId");

-- CreateIndex
CREATE INDEX "sales_inquiry_notes_inquiryId_createdAt_idx" ON "sales_inquiry_notes"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_classification_history_customerId_createdAt_idx" ON "customer_classification_history"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_gstNumber_idx" ON "customers"("gstNumber");

-- CreateIndex
CREATE INDEX "customers_businessName_idx" ON "customers"("businessName");

-- CreateIndex
CREATE INDEX "customers_customerTypeId_idx" ON "customers"("customerTypeId");

-- CreateIndex
CREATE INDEX "customers_primaryChannelId_idx" ON "customers"("primaryChannelId");

-- CreateIndex
CREATE INDEX "customers_assignedOwnerId_idx" ON "customers"("assignedOwnerId");

-- CreateIndex
CREATE INDEX "customers_assignedTerritoryId_idx" ON "customers"("assignedTerritoryId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "customer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_primaryChannelId_fkey" FOREIGN KEY ("primaryChannelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assignedTerritoryId_fkey" FOREIGN KEY ("assignedTerritoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_defaultOwnerRoleId_fkey" FOREIGN KEY ("defaultOwnerRoleId") REFERENCES "sales_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_defaultAssignmentQueueId_fkey" FOREIGN KEY ("defaultAssignmentQueueId") REFERENCES "assignment_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channel_customer_types" ADD CONSTRAINT "sales_channel_customer_types_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_channel_customer_types" ADD CONSTRAINT "sales_channel_customer_types_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "customer_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_queues" ADD CONSTRAINT "assignment_queues_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_queues" ADD CONSTRAINT "assignment_queues_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_queues" ADD CONSTRAINT "assignment_queues_escalationUserId_fkey" FOREIGN KEY ("escalationUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiry_status_transitions" ADD CONSTRAINT "sales_inquiry_status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "sales_inquiry_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiry_status_transitions" ADD CONSTRAINT "sales_inquiry_status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "sales_inquiry_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "sales_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_customerTypeId_fkey" FOREIGN KEY ("customerTypeId") REFERENCES "customer_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "sales_inquiry_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_assignedOwnerId_fkey" FOREIGN KEY ("assignedOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_assignmentQueueId_fkey" FOREIGN KEY ("assignmentQueueId") REFERENCES "assignment_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_submittedUserId_fkey" FOREIGN KEY ("submittedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_inquiry_details" ADD CONSTRAINT "institutional_inquiry_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_inquiry_details" ADD CONSTRAINT "corporate_inquiry_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_order_details" ADD CONSTRAINT "bulk_order_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_request_details" ADD CONSTRAINT "quotation_request_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_request_details" ADD CONSTRAINT "sample_request_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_application_details" ADD CONSTRAINT "dealer_application_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_application_details" ADD CONSTRAINT "dealer_application_details_applicationStatusId_fkey" FOREIGN KEY ("applicationStatusId") REFERENCES "sales_application_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_application_details" ADD CONSTRAINT "distributor_application_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_application_details" ADD CONSTRAINT "distributor_application_details_applicationStatusId_fkey" FOREIGN KEY ("applicationStatusId") REFERENCES "sales_application_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_inquiry_details" ADD CONSTRAINT "franchise_inquiry_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_inquiry_details" ADD CONSTRAINT "franchise_inquiry_details_applicationStatusId_fkey" FOREIGN KEY ("applicationStatusId") REFERENCES "sales_application_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_sales_details" ADD CONSTRAINT "contact_sales_details_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_timeline_events" ADD CONSTRAINT "sales_timeline_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_timeline_events" ADD CONSTRAINT "sales_timeline_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_timeline_events" ADD CONSTRAINT "sales_timeline_events_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_follow_up_tasks" ADD CONSTRAINT "sales_follow_up_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_follow_up_tasks" ADD CONSTRAINT "sales_follow_up_tasks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_follow_up_tasks" ADD CONSTRAINT "sales_follow_up_tasks_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiry_notes" ADD CONSTRAINT "sales_inquiry_notes_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "sales_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_inquiry_notes" ADD CONSTRAINT "sales_inquiry_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_classification_history" ADD CONSTRAINT "customer_classification_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_classification_history" ADD CONSTRAINT "customer_classification_history_fromTypeId_fkey" FOREIGN KEY ("fromTypeId") REFERENCES "customer_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_classification_history" ADD CONSTRAINT "customer_classification_history_toTypeId_fkey" FOREIGN KEY ("toTypeId") REFERENCES "customer_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_classification_history" ADD CONSTRAINT "customer_classification_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_logs" ADD COLUMN "salesInquiryId" TEXT;
CREATE INDEX "notification_logs_salesInquiryId_idx" ON "notification_logs"("salesInquiryId");
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_salesInquiryId_fkey" FOREIGN KEY ("salesInquiryId") REFERENCES "sales_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
