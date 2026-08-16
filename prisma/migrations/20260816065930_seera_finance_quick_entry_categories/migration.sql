-- AlterTable
ALTER TABLE "seera_expense_categories" ADD COLUMN     "parentGroup" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "receiptPolicy" TEXT NOT NULL DEFAULT 'OPTIONAL',
ADD COLUMN     "requiresParty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "seera_expenses" ADD COLUMN     "entryType" TEXT NOT NULL DEFAULT 'EXPENSE';

-- CreateIndex
CREATE INDEX "seera_expense_categories_parentGroup_idx" ON "seera_expense_categories"("parentGroup");

-- CreateIndex
CREATE INDEX "seera_expenses_categoryId_date_idx" ON "seera_expenses"("categoryId", "date");

-- CreateIndex
CREATE INDEX "seera_expenses_entryType_date_idx" ON "seera_expenses"("entryType", "date");
