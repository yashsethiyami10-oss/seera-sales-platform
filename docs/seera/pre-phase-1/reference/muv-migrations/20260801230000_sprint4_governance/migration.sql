-- MUV AI Engineering Execution — Sprint 4: Governance.
-- Purely additive — two new tables, no existing table touched.

-- CreateTable
CREATE TABLE "approval_authorities" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "principalId" TEXT NOT NULL,
    "maxApprovalLevel" TEXT NOT NULL,
    "scopeDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "delegatedById" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_authorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hard_maker_checker_categories" (
    "id" TEXT NOT NULL,
    "organizationKey" TEXT NOT NULL DEFAULT 'MUV',
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hard_maker_checker_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_authorities_organizationKey_principalId_maxApprova_idx" ON "approval_authorities"("organizationKey", "principalId", "maxApprovalLevel");

-- CreateIndex
CREATE UNIQUE INDEX "hard_maker_checker_categories_organizationKey_category_key" ON "hard_maker_checker_categories"("organizationKey", "category");

-- AddForeignKey
ALTER TABLE "approval_authorities" ADD CONSTRAINT "approval_authorities_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_authorities" ADD CONSTRAINT "approval_authorities_delegatedById_fkey" FOREIGN KEY ("delegatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_authorities" ADD CONSTRAINT "approval_authorities_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
