-- US-F — tranches de quotient familial (tarification solidaire SGDF).
CREATE TABLE "SocialBracket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "coefficientPermille" INTEGER NOT NULL DEFAULT 1000,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SocialBracket_archived_idx" ON "SocialBracket"("archived");

ALTER TABLE "User" ADD COLUMN "socialBracketId" TEXT
    REFERENCES "SocialBracket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_socialBracketId_idx" ON "User"("socialBracketId");
