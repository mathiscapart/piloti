-- US-16 — lien de traçabilité entre un sondage et le prêt qui l'a déclenché.
-- AlterTable
ALTER TABLE "Poll" ADD COLUMN "loanGroupId" TEXT;
