-- MUV Enterprise Architecture v3.0 — Phase 2 Part 3D, Stage 1 — Founder
-- Operating System. Additive only. Touches nothing under any finance_*
-- table (Part 3C is formally frozen) — hand-assembled from
-- `prisma migrate diff`'s output with the usual spurious DROP CONSTRAINT
-- statements against hand-written users(id) foreign keys on Part 3C
-- tables excluded (established pattern throughout this engagement), and
-- a purely cosmetic index-rename on finance_ledger_entries excluded too
-- (no functional effect, and Part 3C is frozen — nothing under it is
-- touched here, not even a rename).

CREATE TABLE "founder_alerts" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_notifications" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "sourceAlertId" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_widget_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "requiredPermission" TEXT,
    "defaultVisible" BOOLEAN NOT NULL DEFAULT true,
    "defaultOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_widget_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_widget_preferences" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_widget_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "founder_alerts_organizationKey_status_severity_idx" ON "founder_alerts"("organizationKey", "status", "severity");
CREATE INDEX "founder_alerts_organizationKey_alertType_status_idx" ON "founder_alerts"("organizationKey", "alertType", "status");
CREATE INDEX "founder_notifications_organizationKey_recipientId_readAt_idx" ON "founder_notifications"("organizationKey", "recipientId", "readAt");
CREATE INDEX "founder_notifications_organizationKey_recipientId_createdAt_idx" ON "founder_notifications"("organizationKey", "recipientId", "createdAt");
CREATE UNIQUE INDEX "founder_widget_definitions_code_key" ON "founder_widget_definitions"("code");
CREATE UNIQUE INDEX "founder_widget_preferences_organizationKey_userId_widgetId_key" ON "founder_widget_preferences"("organizationKey", "userId", "widgetId");

ALTER TABLE "founder_notifications" ADD CONSTRAINT "founder_notifications_sourceAlertId_fkey" FOREIGN KEY ("sourceAlertId") REFERENCES "founder_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "founder_widget_preferences" ADD CONSTRAINT "founder_widget_preferences_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "founder_widget_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trusted User references (same hand-written pattern as every prior Part —
-- Prisma's generator proposes DROPping these on unrelated diffs because it
-- doesn't know about them; they are added directly here instead of via a
-- Prisma-level relation, matching every finance_*/founder_* table's own
-- convention throughout this engagement).
ALTER TABLE "founder_alerts" ADD CONSTRAINT "founder_alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "founder_alerts" ADD CONSTRAINT "founder_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "founder_notifications" ADD CONSTRAINT "founder_notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "founder_widget_preferences" ADD CONSTRAINT "founder_widget_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
