-- US-F01/F02 — campagnes de cotisation & paiements.
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "unit" TEXT,
    "deadline" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Campaign_unit_idx" ON "Campaign"("unit");

CREATE TABLE "CampaignPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPayment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignPayment_campaignId_idx" ON "CampaignPayment"("campaignId");
CREATE INDEX "CampaignPayment_userId_idx" ON "CampaignPayment"("userId");
