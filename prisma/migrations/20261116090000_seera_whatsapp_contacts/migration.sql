-- Seera WhatsApp Hub: manually added contact numbers (name, shop, city, state, group) that
-- campaigns can send to alongside retailers / partners. Additive and idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "seera_wa_contacts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "businessName" TEXT,
    "city" TEXT,
    "state" TEXT,
    "groupName" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seera_wa_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seera_wa_contacts_phone_key" ON "seera_wa_contacts"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seera_wa_contacts_groupName_idx" ON "seera_wa_contacts"("groupName");
