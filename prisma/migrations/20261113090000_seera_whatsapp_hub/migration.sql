-- Seera WhatsApp Hub: templates synced from Meta, campaigns (one-time or repeating), the
-- message queue/ledger, inbox, opt-outs and global send settings. Additive and idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_templates" (
    "id" TEXT NOT NULL,
    "metaId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT,
    "headerFormat" TEXT,
    "bodyText" TEXT,
    "variableNames" TEXT[],
    "components" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_wa_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "audience" JSONB NOT NULL,
    "variableMap" JSONB NOT NULL,
    "headerMediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "repeatEveryDays" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunSummary" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_wa_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_messages" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "campaignId" TEXT,
    "runNumber" INTEGER NOT NULL DEFAULT 0,
    "templateName" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT,
    "partyType" TEXT,
    "partyId" TEXT,
    "recipientName" TEXT,
    "phone" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "headerMediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_inbox_messages" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "waMessageId" TEXT,
    "phone" TEXT NOT NULL,
    "profileName" TEXT,
    "partyType" TEXT,
    "partyId" TEXT,
    "partyName" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "raw" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_wa_inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_opt_outs" (
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_wa_opt_outs_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_settings" (
    "id" TEXT NOT NULL,
    "sendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietStartMinute" INTEGER NOT NULL DEFAULT 1260,
    "quietEndMinute" INTEGER NOT NULL DEFAULT 540,
    "marketingGapDays" INTEGER NOT NULL DEFAULT 2,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_wa_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seera_wa_templates_name_language_key" ON "seera_wa_templates"("name", "language");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_campaigns_status_nextRunAt_idx" ON "seera_wa_campaigns"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seera_wa_messages_idempotencyKey_key" ON "seera_wa_messages"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seera_wa_messages_providerMessageId_key" ON "seera_wa_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_messages_status_scheduledFor_idx" ON "seera_wa_messages"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_messages_campaignId_runNumber_idx" ON "seera_wa_messages"("campaignId", "runNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_messages_phone_sentAt_idx" ON "seera_wa_messages"("phone", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seera_wa_inbox_messages_waMessageId_key" ON "seera_wa_inbox_messages"("waMessageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_inbox_messages_phone_createdAt_idx" ON "seera_wa_inbox_messages"("phone", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_inbox_messages_direction_isRead_createdAt_idx" ON "seera_wa_inbox_messages"("direction", "isRead", "createdAt");
