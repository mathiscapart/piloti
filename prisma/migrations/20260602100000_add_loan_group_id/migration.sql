-- US-32 — prêt groupé : groupId partagé entre les lignes d'un même emprunt.
-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Loan_groupId_idx" ON "Loan"("groupId");
