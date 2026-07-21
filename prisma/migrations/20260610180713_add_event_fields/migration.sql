-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "unit" TEXT,
    "location" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("createdAt", "endDate", "id", "name", "startDate", "type", "unit") SELECT "createdAt", "endDate", "id", "name", "startDate", "type", "unit" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_startDate_idx" ON "Event"("startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
