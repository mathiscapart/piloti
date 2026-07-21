-- CreateTable
CREATE TABLE "ChannelMute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelMute_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChannelMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "equipmentId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATETIME NOT NULL,
    "expectedReturn" DATETIME NOT NULL,
    "returnedAt" DATETIME,
    "returnedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIF',
    "eventName" TEXT,
    "dryingLocation" TEXT,
    "dryingContactId" TEXT,
    "dryingPersonName" TEXT,
    "returnWeightKg" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Loan_dryingContactId_fkey" FOREIGN KEY ("dryingContactId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Loan" ("borrowerId", "createdAt", "dryingContactId", "dryingLocation", "dryingPersonName", "equipmentId", "eventName", "expectedReturn", "groupId", "id", "notes", "quantity", "returnWeightKg", "returnedAt", "returnedById", "startDate", "status", "updatedAt") SELECT "borrowerId", "createdAt", "dryingContactId", "dryingLocation", "dryingPersonName", "equipmentId", "eventName", "expectedReturn", "groupId", "id", "notes", "quantity", "returnWeightKg", "returnedAt", "returnedById", "startDate", "status", "updatedAt" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
CREATE INDEX "Loan_status_idx" ON "Loan"("status");
CREATE INDEX "Loan_equipmentId_idx" ON "Loan"("equipmentId");
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");
CREATE INDEX "Loan_expectedReturn_idx" ON "Loan"("expectedReturn");
CREATE INDEX "Loan_groupId_idx" ON "Loan"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChannelMute_userId_idx" ON "ChannelMute"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMute_channelId_userId_key" ON "ChannelMute"("channelId", "userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
