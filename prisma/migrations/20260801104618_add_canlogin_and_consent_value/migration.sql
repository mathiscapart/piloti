-- AlterTable
ALTER TABLE "Consent" ADD COLUMN "value" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'CHEF',
    "roles" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "unit" TEXT,
    "phone" TEXT,
    "rejectedReason" TEXT,
    "requestedRole" TEXT,
    "calendarToken" TEXT,
    "profession" TEXT,
    "skills" TEXT,
    "availability" TEXT,
    "helpNotes" TEXT,
    "skillsConsent" BOOLEAN NOT NULL DEFAULT false,
    "canLogin" BOOLEAN NOT NULL DEFAULT true,
    "socialBracketId" TEXT,
    CONSTRAINT "User_socialBracketId_fkey" FOREIGN KEY ("socialBracketId") REFERENCES "SocialBracket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("availability", "birthDate", "calendarToken", "createdAt", "email", "emailVerified", "firstName", "helpNotes", "id", "image", "lastName", "name", "phone", "profession", "rejectedReason", "requestedRole", "role", "roles", "skills", "skillsConsent", "socialBracketId", "status", "unit", "updatedAt") SELECT "availability", "birthDate", "calendarToken", "createdAt", "email", "emailVerified", "firstName", "helpNotes", "id", "image", "lastName", "name", "phone", "profession", "rejectedReason", "requestedRole", "role", "roles", "skills", "skillsConsent", "socialBracketId", "status", "unit", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_socialBracketId_idx" ON "User"("socialBracketId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
