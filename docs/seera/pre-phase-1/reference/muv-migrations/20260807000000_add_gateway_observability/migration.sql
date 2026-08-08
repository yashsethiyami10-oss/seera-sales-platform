-- CreateEnum
CREATE TYPE "GatewayEventSeverity" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "GatewayEventType" AS ENUM ('REQUEST', 'GATEWAY_LATENCY', 'PROVIDER_LATENCY', 'KNOWLEDGE_RETRIEVAL_LATENCY', 'COMMERCE_TOOL_USAGE', 'CUSTOMER_TOOL_USAGE', 'CONVERSATION_RUNTIME_USAGE', 'TOKEN_USAGE', 'PROVIDER_ERROR', 'TOOL_ERROR', 'TIMEOUT', 'CANCELLATION', 'RETRY', 'RATE_LIMIT', 'AUTHENTICATION_FAILURE', 'AUTHORIZATION_FAILURE', 'KNOWLEDGE_UNAVAILABLE', 'CONVERSATION_LIFECYCLE', 'HEALTH_CHECK');

-- CreateTable
CREATE TABLE "gateway_observability_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventType" "GatewayEventType" NOT NULL,
    "severity" "GatewayEventSeverity" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "durationMs" INTEGER,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_observability_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateway_observability_events_eventType_createdAt_idx" ON "gateway_observability_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "gateway_observability_events_requestId_idx" ON "gateway_observability_events"("requestId");

-- CreateIndex
CREATE INDEX "gateway_observability_events_severity_createdAt_idx" ON "gateway_observability_events"("severity", "createdAt");

