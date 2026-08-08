-- DropForeignKey
ALTER TABLE "customer_intelligence_profiles" DROP CONSTRAINT "customer_intelligence_profiles_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_intelligence_profiles" DROP CONSTRAINT "customer_intelligence_profiles_primarySegmentId_fkey";

-- DropForeignKey
ALTER TABLE "customer_intelligence_snapshots" DROP CONSTRAINT "customer_intelligence_snapshots_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_referredCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_referrerCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_referrals" DROP CONSTRAINT "customer_referrals_statusId_fkey";

-- DropForeignKey
ALTER TABLE "customer_segment_assignments" DROP CONSTRAINT "customer_segment_assignments_assignedById_fkey";

-- DropForeignKey
ALTER TABLE "customer_segment_assignments" DROP CONSTRAINT "customer_segment_assignments_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_segment_assignments" DROP CONSTRAINT "customer_segment_assignments_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "executive_reports" DROP CONSTRAINT "executive_reports_templateId_fkey";

-- DropForeignKey
ALTER TABLE "loyalty_profiles" DROP CONSTRAINT "loyalty_profiles_customerId_fkey";

-- DropForeignKey
ALTER TABLE "loyalty_profiles" DROP CONSTRAINT "loyalty_profiles_membershipLevelId_fkey";

-- DropForeignKey
ALTER TABLE "loyalty_snapshots" DROP CONSTRAINT "loyalty_snapshots_customerId_fkey";

-- DropForeignKey
ALTER TABLE "membership_history" DROP CONSTRAINT "membership_history_customerId_fkey";

-- DropForeignKey
ALTER TABLE "membership_history" DROP CONSTRAINT "membership_history_newLevelId_fkey";

-- DropForeignKey
ALTER TABLE "referral_history" DROP CONSTRAINT "referral_history_referralId_fkey";

-- DropForeignKey
ALTER TABLE "reward_ledger_entries" DROP CONSTRAINT "reward_ledger_entries_customerId_fkey";

-- DropForeignKey
ALTER TABLE "reward_ledger_entries" DROP CONSTRAINT "reward_ledger_entries_transactionTypeId_fkey";

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "conversationType" TEXT NOT NULL DEFAULT 'GENERAL',
    "language" TEXT NOT NULL DEFAULT 'en',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featureFlags" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "role" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "references" JSONB NOT NULL DEFAULT '[]',
    "toolCalls" JSONB NOT NULL DEFAULT '[]',
    "workflowId" TEXT,
    "responseMetadata" JSONB NOT NULL DEFAULT '{}',
    "modelMetadata" JSONB NOT NULL DEFAULT '{}',
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_sessions" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_records" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT,
    "visibilityScope" TEXT NOT NULL DEFAULT 'INTERNAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceType" TEXT NOT NULL,
    "sourceReference" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "effectiveAt" TIMESTAMP(3),
    "reviewAt" TIMESTAMP(3),
    "retentionPolicy" TEXT,
    "content" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_knowledge_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requiredPermission" TEXT,
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "executionType" TEXT NOT NULL DEFAULT 'SYNC',
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "retryPolicy" JSONB NOT NULL DEFAULT '{}',
    "auditCategory" TEXT NOT NULL,
    "featureFlag" TEXT,
    "dataScope" TEXT NOT NULL DEFAULT 'CALLER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tool_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "organizationScope" TEXT NOT NULL DEFAULT 'MUV',
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedIntents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knowledgeCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promptCode" TEXT,
    "modelPolicy" JSONB NOT NULL DEFAULT '{}',
    "workflowTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maximumSteps" INTEGER NOT NULL DEFAULT 10,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "retryPolicy" JSONB NOT NULL DEFAULT '{}',
    "featureFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflow_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedAgents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maximumSteps" INTEGER NOT NULL DEFAULT 10,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "retryPolicy" JSONB NOT NULL DEFAULT '{}',
    "approvalPolicy" JSONB NOT NULL DEFAULT '{}',
    "featureFlag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflows" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conversationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "requestedById" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maximumRetries" INTEGER NOT NULL DEFAULT 2,
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "promptVersion" INTEGER,
    "modelMetadata" JSONB NOT NULL DEFAULT '{}',
    "referencedRecords" JSONB NOT NULL DEFAULT '[]',
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflow_steps" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "assignedAgentCode" TEXT,
    "toolCode" TEXT,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "validationResult" JSONB,
    "approvalRequirement" JSONB,
    "dependencies" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workflow_checkpoints" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "stateHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_workflow_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_action_requests" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conversationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedByAgent" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetRecordId" TEXT,
    "targetVersion" TEXT,
    "inputPayload" JSONB NOT NULL,
    "previewPayload" JSONB NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "approvalPolicy" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_action_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_approval_decisions" (
    "id" TEXT NOT NULL,
    "actionRequestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "workflowId" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "referencedRecords" JSONB NOT NULL,
    "businessRules" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "organizationScope" TEXT NOT NULL DEFAULT 'MUV',
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedAgents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableIntents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableWorkflows" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedProviders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safetyRules" JSONB NOT NULL DEFAULT '{}',
    "outputFormat" JSONB NOT NULL DEFAULT '{}',
    "template" TEXT NOT NULL,
    "featureFlag" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maximumContext" INTEGER NOT NULL DEFAULT 0,
    "streamingSupport" BOOLEAN NOT NULL DEFAULT false,
    "toolCallingSupport" BOOLEAN NOT NULL DEFAULT false,
    "structuredOutput" BOOLEAN NOT NULL DEFAULT false,
    "dataPolicy" JSONB NOT NULL DEFAULT '{}',
    "rateLimits" JSONB NOT NULL DEFAULT '{}',
    "costPolicy" JSONB NOT NULL DEFAULT '{}',
    "fallbackPriority" INTEGER,
    "featureFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maximumTokens" INTEGER NOT NULL,
    "defaultTemperature" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "defaultTopP" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "responseFormat" JSONB NOT NULL DEFAULT '{}',
    "reasoningMode" TEXT,
    "featureFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_invocations" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conversationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptCode" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "routingPolicy" JSONB NOT NULL,
    "fallbackDecision" JSONB,
    "promptSize" INTEGER NOT NULL,
    "contextSize" INTEGER NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(15,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "ai_model_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_validation_results" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "conversationId" TEXT,
    "workflowId" TEXT,
    "invocationId" TEXT,
    "validationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_memory" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "ownerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "memoryType" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "retentionPolicy" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "content" JSONB NOT NULL,
    "references" JSONB NOT NULL DEFAULT '[]',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "consentReference" TEXT,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifacts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "ownerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "workflowId" TEXT,
    "artifactType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_security_events" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_incidents" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "incidentNumber" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "affectedComponents" TEXT[],
    "impactSummary" TEXT NOT NULL,
    "rootCause" TEXT,
    "mitigation" TEXT,
    "ownerId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_telemetry" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "userId" TEXT,
    "roleName" TEXT,
    "conversationId" TEXT,
    "workflowId" TEXT,
    "agentCode" TEXT,
    "toolCode" TEXT,
    "providerCode" TEXT,
    "modelCode" TEXT,
    "metricType" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configuration" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_organizationKey_ownerId_status_updatedAt_idx" ON "ai_conversations"("organizationKey", "ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_conversations_organizationKey_pinned_lastActivityAt_idx" ON "ai_conversations"("organizationKey", "pinned", "lastActivityAt");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_messages_correlationId_idx" ON "ai_messages"("correlationId");

-- CreateIndex
CREATE INDEX "ai_sessions_organizationKey_userId_status_expiresAt_idx" ON "ai_sessions"("organizationKey", "userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ai_sessions_conversationId_idx" ON "ai_sessions"("conversationId");

-- CreateIndex
CREATE INDEX "ai_knowledge_records_organizationKey_status_category_update_idx" ON "ai_knowledge_records"("organizationKey", "status", "category", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_knowledge_records_organizationKey_title_version_key" ON "ai_knowledge_records"("organizationKey", "title", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_tool_definitions_code_key" ON "ai_tool_definitions"("code");

-- CreateIndex
CREATE INDEX "ai_tool_definitions_status_category_idx" ON "ai_tool_definitions"("status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_definitions_code_key" ON "ai_agent_definitions"("code");

-- CreateIndex
CREATE INDEX "ai_agent_definitions_status_organizationScope_idx" ON "ai_agent_definitions"("status", "organizationScope");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workflow_definitions_code_key" ON "ai_workflow_definitions"("code");

-- CreateIndex
CREATE INDEX "ai_workflow_definitions_status_idx" ON "ai_workflow_definitions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workflows_idempotencyKey_key" ON "ai_workflows"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_workflows_organizationKey_status_createdAt_idx" ON "ai_workflows"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_workflows_conversationId_createdAt_idx" ON "ai_workflows"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_workflows_correlationId_idx" ON "ai_workflows"("correlationId");

-- CreateIndex
CREATE INDEX "ai_workflow_steps_workflowId_status_idx" ON "ai_workflow_steps"("workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workflow_steps_workflowId_stepNumber_key" ON "ai_workflow_steps"("workflowId", "stepNumber");

-- CreateIndex
CREATE INDEX "ai_workflow_checkpoints_workflowId_createdAt_idx" ON "ai_workflow_checkpoints"("workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workflow_checkpoints_workflowId_stepNumber_key" ON "ai_workflow_checkpoints"("workflowId", "stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ai_action_requests_idempotencyKey_key" ON "ai_action_requests"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_action_requests_organizationKey_status_riskLevel_created_idx" ON "ai_action_requests"("organizationKey", "status", "riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "ai_action_requests_workflowId_idx" ON "ai_action_requests"("workflowId");

-- CreateIndex
CREATE INDEX "ai_approval_decisions_actionRequestId_createdAt_idx" ON "ai_approval_decisions"("actionRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_recommendations_organizationKey_status_createdAt_idx" ON "ai_recommendations"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_recommendations_workflowId_idx" ON "ai_recommendations"("workflowId");

-- CreateIndex
CREATE INDEX "ai_prompt_templates_status_category_language_idx" ON "ai_prompt_templates"("status", "category", "language");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_templates_code_version_key" ON "ai_prompt_templates"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_code_key" ON "ai_providers"("code");

-- CreateIndex
CREATE INDEX "ai_providers_status_priority_idx" ON "ai_providers"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_definitions_code_key" ON "ai_model_definitions"("code");

-- CreateIndex
CREATE INDEX "ai_model_definitions_providerId_status_idx" ON "ai_model_definitions"("providerId", "status");

-- CreateIndex
CREATE INDEX "ai_model_invocations_organizationKey_providerId_modelId_sta_idx" ON "ai_model_invocations"("organizationKey", "providerId", "modelId", "startedAt");

-- CreateIndex
CREATE INDEX "ai_model_invocations_correlationId_idx" ON "ai_model_invocations"("correlationId");

-- CreateIndex
CREATE INDEX "ai_validation_results_organizationKey_status_createdAt_idx" ON "ai_validation_results"("organizationKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_validation_results_invocationId_idx" ON "ai_validation_results"("invocationId");

-- CreateIndex
CREATE INDEX "ai_memory_organizationKey_ownerId_status_updatedAt_idx" ON "ai_memory"("organizationKey", "ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_memory_conversationId_memoryType_idx" ON "ai_memory"("conversationId", "memoryType");

-- CreateIndex
CREATE INDEX "ai_artifacts_organizationKey_artifactType_createdAt_idx" ON "ai_artifacts"("organizationKey", "artifactType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_artifacts_ownerId_title_version_key" ON "ai_artifacts"("ownerId", "title", "version");

-- CreateIndex
CREATE INDEX "ai_security_events_organizationKey_severity_eventType_creat_idx" ON "ai_security_events"("organizationKey", "severity", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ai_security_events_correlationId_idx" ON "ai_security_events"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_incidents_incidentNumber_key" ON "ai_incidents"("incidentNumber");

-- CreateIndex
CREATE INDEX "ai_incidents_organizationKey_status_severity_detectedAt_idx" ON "ai_incidents"("organizationKey", "status", "severity", "detectedAt");

-- CreateIndex
CREATE INDEX "ai_telemetry_organizationKey_metricType_createdAt_idx" ON "ai_telemetry"("organizationKey", "metricType", "createdAt");

-- CreateIndex
CREATE INDEX "ai_telemetry_userId_createdAt_idx" ON "ai_telemetry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_telemetry_correlationId_idx" ON "ai_telemetry"("correlationId");

-- CreateIndex
CREATE INDEX "ai_configuration_category_active_idx" ON "ai_configuration"("category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configuration_organizationKey_key_key" ON "ai_configuration"("organizationKey", "key");

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_workflows" ADD CONSTRAINT "ai_workflows_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_workflows" ADD CONSTRAINT "ai_workflows_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ai_workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_steps" ADD CONSTRAINT "ai_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_checkpoints" ADD CONSTRAINT "ai_workflow_checkpoints_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_action_requests" ADD CONSTRAINT "ai_action_requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_action_requests" ADD CONSTRAINT "ai_action_requests_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_approval_decisions" ADD CONSTRAINT "ai_approval_decisions_actionRequestId_fkey" FOREIGN KEY ("actionRequestId") REFERENCES "ai_action_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ai_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_definitions" ADD CONSTRAINT "ai_model_definitions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_invocations" ADD CONSTRAINT "ai_model_invocations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_invocations" ADD CONSTRAINT "ai_model_invocations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_model_invocations" ADD CONSTRAINT "ai_model_invocations_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ai_model_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_validation_results" ADD CONSTRAINT "ai_validation_results_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "ai_model_invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE "ai_incident_number_seq";
CREATE OR REPLACE FUNCTION ai_assign_incident_number() RETURNS trigger AS $$
BEGIN
  IF NEW."incidentNumber" IS NULL OR NEW."incidentNumber" = '' THEN
    NEW."incidentNumber" := 'AI-INC-' || LPAD(nextval('ai_incident_number_seq')::text, 8, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ai_incident_number_trigger" BEFORE INSERT ON "ai_incidents" FOR EACH ROW EXECUTE FUNCTION ai_assign_incident_number();

CREATE OR REPLACE FUNCTION ai_reject_immutable_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Governed AI historical records are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ai_messages_immutable" BEFORE UPDATE OR DELETE ON "ai_messages" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();
CREATE TRIGGER "ai_workflow_checkpoints_immutable" BEFORE UPDATE OR DELETE ON "ai_workflow_checkpoints" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();
CREATE TRIGGER "ai_approval_decisions_immutable" BEFORE UPDATE OR DELETE ON "ai_approval_decisions" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();
CREATE TRIGGER "ai_model_invocations_immutable" BEFORE DELETE ON "ai_model_invocations" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();
CREATE TRIGGER "ai_validation_results_immutable" BEFORE UPDATE OR DELETE ON "ai_validation_results" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();
CREATE TRIGGER "ai_artifacts_immutable" BEFORE UPDATE OR DELETE ON "ai_artifacts" FOR EACH ROW EXECUTE FUNCTION ai_reject_immutable_mutation();

CREATE OR REPLACE FUNCTION ai_protect_published_prompt() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN RAISE EXCEPTION 'Published prompt versions are immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "ai_published_prompts_immutable" BEFORE UPDATE OR DELETE ON "ai_prompt_templates" FOR EACH ROW EXECUTE FUNCTION ai_protect_published_prompt();
