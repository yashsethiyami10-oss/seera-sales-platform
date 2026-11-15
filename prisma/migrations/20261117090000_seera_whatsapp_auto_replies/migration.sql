-- WhatsApp Hub auto-replies (additive only).
CREATE TABLE IF NOT EXISTS "seera_wa_auto_replies" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RULE',
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "replyText" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "buttons" TEXT[],
    "alertTeam" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 2,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seera_wa_auto_replies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "seera_wa_auto_replies_kind_active_priority_idx" ON "seera_wa_auto_replies"("kind", "active", "priority");
