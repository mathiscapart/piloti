-- US-26 — profil parent enrichi (annuaire des compétences).
-- AlterTable
ALTER TABLE "User" ADD COLUMN "profession" TEXT;
ALTER TABLE "User" ADD COLUMN "skills" TEXT;
ALTER TABLE "User" ADD COLUMN "availability" TEXT;
ALTER TABLE "User" ADD COLUMN "helpNotes" TEXT;
ALTER TABLE "User" ADD COLUMN "skillsConsent" BOOLEAN NOT NULL DEFAULT false;
