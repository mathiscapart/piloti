-- US-29 — rôles fonctionnels additionnels (multi-rôles) sur le compte.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "roles" TEXT NOT NULL DEFAULT '[]';
