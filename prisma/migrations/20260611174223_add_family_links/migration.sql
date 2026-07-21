-- CreateTable
CREATE TABLE "FamilyLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FamilyLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FamilyLink_parentId_idx" ON "FamilyLink"("parentId");

-- CreateIndex
CREATE INDEX "FamilyLink_childId_idx" ON "FamilyLink"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyLink_parentId_childId_key" ON "FamilyLink"("parentId", "childId");
