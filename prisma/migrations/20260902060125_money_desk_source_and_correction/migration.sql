-- CreateEnum
CREATE TYPE "MoneyDeskSource" AS ENUM ('FOUNDER_PORTAL', 'ACCOUNTS_PORTAL', 'MANAGER_PORTAL', 'OTHER_OPERATOR', 'SYSTEM');

-- AlterTable
ALTER TABLE "seera_money_desk_transactions" ADD COLUMN     "correctionOfId" TEXT,
ADD COLUMN     "source" "MoneyDeskSource" NOT NULL DEFAULT 'OTHER_OPERATOR';

-- CreateIndex
CREATE INDEX "seera_money_desk_transactions_correctionOfId_idx" ON "seera_money_desk_transactions"("correctionOfId");
