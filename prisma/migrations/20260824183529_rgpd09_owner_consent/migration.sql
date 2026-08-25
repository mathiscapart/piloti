-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CampPlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "region" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "capacity" INTEGER,
    "equipmentJson" TEXT NOT NULL DEFAULT '[]',
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "ownerEmail" TEXT,
    "ownerConsentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ownerConsentToken" TEXT,
    "ownerConsentRequestedAt" DATETIME,
    "ownerConsentDecidedAt" DATETIME,
    "notes" TEXT,
    "photosJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CampPlace" ("address", "archived", "capacity", "createdAt", "createdById", "equipmentJson", "id", "latitude", "longitude", "name", "notes", "ownerEmail", "ownerName", "ownerPhone", "photosJson", "region", "updatedAt") SELECT "address", "archived", "capacity", "createdAt", "createdById", "equipmentJson", "id", "latitude", "longitude", "name", "notes", "ownerEmail", "ownerName", "ownerPhone", "photosJson", "region", "updatedAt" FROM "CampPlace";
DROP TABLE "CampPlace";
ALTER TABLE "new_CampPlace" RENAME TO "CampPlace";
CREATE UNIQUE INDEX "CampPlace_ownerConsentToken_key" ON "CampPlace"("ownerConsentToken");
CREATE INDEX "CampPlace_archived_idx" ON "CampPlace"("archived");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
