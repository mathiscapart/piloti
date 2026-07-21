-- US-23 — contact de séchage rattaché à un compte (référence User).
-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "dryingContactId" TEXT;

-- CreateIndex
CREATE INDEX "Loan_dryingContactId_idx" ON "Loan"("dryingContactId");
