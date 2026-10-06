-- AlterTable
ALTER TABLE "CampaignPayment" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "CampaignPayment" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "CampaignPayment" ADD COLUMN "cancelReason" TEXT;
