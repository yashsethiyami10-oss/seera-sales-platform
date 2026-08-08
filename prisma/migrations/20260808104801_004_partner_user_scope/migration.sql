-- CreateTable
CREATE TABLE "seera_party_users" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seera_party_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seera_party_users_userId_active_effectiveFrom_effectiveTo_idx" ON "seera_party_users"("userId", "active", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "seera_party_users_partnerId_userId_effectiveFrom_key" ON "seera_party_users"("partnerId", "userId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "seera_party_users" ADD CONSTRAINT "seera_party_users_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "seera_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
