-- US-F03 — cadence de relance configurable + modèle de message.
ALTER TABLE "Campaign" ADD COLUMN "reminderDaysJson" TEXT NOT NULL DEFAULT '[7,15,30]';
ALTER TABLE "Campaign" ADD COLUMN "reminderTemplate" TEXT;

ALTER TABLE "CampaignReminder" ADD COLUMN "dayOffset" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "CampaignReminder_campaignId_userId_key";
CREATE UNIQUE INDEX "CampaignReminder_campaignId_userId_dayOffset_key" ON "CampaignReminder"("campaignId", "userId", "dayOffset");
