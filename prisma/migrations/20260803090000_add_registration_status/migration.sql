-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE "EventRegistration" ADD COLUMN "comment" TEXT;
ALTER TABLE "EventRegistration" ADD COLUMN "withdrawalReason" TEXT;
