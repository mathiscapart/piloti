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
    "eventId" TEXT,
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
    CONSTRAINT "Loan_dryingContactId_fkey" FOREIGN KEY ("dryingContactId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Loan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Loan" ("borrowerId", "createdAt", "dryingContactId", "dryingLocation", "dryingPersonName", "equipmentId", "eventName", "expectedReturn", "groupId", "id", "notes", "quantity", "returnWeightKg", "returnedAt", "returnedById", "startDate", "status", "updatedAt") SELECT "borrowerId", "createdAt", "dryingContactId", "dryingLocation", "dryingPersonName", "equipmentId", "eventName", "expectedReturn", "groupId", "id", "notes", "quantity", "returnWeightKg", "returnedAt", "returnedById", "startDate", "status", "updatedAt" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
CREATE INDEX "Loan_status_idx" ON "Loan"("status");
CREATE INDEX "Loan_equipmentId_idx" ON "Loan"("equipmentId");
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");
CREATE INDEX "Loan_eventId_idx" ON "Loan"("eventId");
CREATE INDEX "Loan_expectedReturn_idx" ON "Loan"("expectedReturn");
CREATE INDEX "Loan_groupId_idx" ON "Loan"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
