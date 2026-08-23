-- AlterTable
ALTER TABLE "seera_expenses" ADD COLUMN     "territoryId" TEXT;

-- CreateIndex
CREATE INDEX "seera_expenses_territoryId_date_idx" ON "seera_expenses"("territoryId", "date");
