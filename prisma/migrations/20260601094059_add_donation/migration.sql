-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" TEXT NOT NULL DEFAULT 'BON',
    "dropoffDate" DATETIME,
    "donorName" TEXT,
    "donorId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectedReason" TEXT,
    "createdEquipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Donation_status_idx" ON "Donation"("status");

-- CreateIndex
CREATE INDEX "Donation_createdAt_idx" ON "Donation"("createdAt");
