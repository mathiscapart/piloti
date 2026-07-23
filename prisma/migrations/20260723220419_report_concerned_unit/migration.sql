-- AlterTable
ALTER TABLE "Report" ADD COLUMN "concernedUnit" TEXT;

-- CreateIndex
CREATE INDEX "Report_concernedUnit_idx" ON "Report"("concernedUnit");
