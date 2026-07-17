-- AlterTable
ALTER TABLE "User" ADD COLUMN "birthDate" DATETIME;

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "termsVersion" TEXT,
    "guardianName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Consent_userId_idx" ON "Consent"("userId");

