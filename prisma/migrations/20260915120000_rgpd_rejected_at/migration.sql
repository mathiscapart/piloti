-- AlterTable
ALTER TABLE "User" ADD COLUMN "rejectedAt" DATETIME;

-- Backfill : les comptes déjà refusés démarrent leur délai de conservation
-- à leur dernière modification (date de refus la plus proche disponible).
UPDATE "User" SET "rejectedAt" = "updatedAt" WHERE "status" = 'REJECTED' AND "rejectedAt" IS NULL;
