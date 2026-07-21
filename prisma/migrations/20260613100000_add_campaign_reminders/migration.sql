-- US-F03 — relances de cotisation & exemptions (échelonnement convenu).
CREATE TABLE "CampaignReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignReminder_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignReminder_campaignId_userId_key" ON "CampaignReminder"("campaignId", "userId");
CREATE INDEX "CampaignReminder_campaignId_idx" ON "CampaignReminder"("campaignId");

CREATE TABLE "CampaignExemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignExemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CampaignExemption_campaignId_userId_key" ON "CampaignExemption"("campaignId", "userId");
CREATE INDEX "CampaignExemption_campaignId_idx" ON "CampaignExemption"("campaignId");
