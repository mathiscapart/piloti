-- US-F01 — tarifs différenciés & échelonnement.
ALTER TABLE "Campaign" ADD COLUMN "secondChildCents" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "socialCents" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "installments" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "CampaignSocialCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignSocialCase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignSocialCase_campaignId_userId_key" ON "CampaignSocialCase"("campaignId", "userId");
CREATE INDEX "CampaignSocialCase_campaignId_idx" ON "CampaignSocialCase"("campaignId");
