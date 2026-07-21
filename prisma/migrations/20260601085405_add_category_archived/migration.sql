-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "canDry" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentSlug" TEXT,
    CONSTRAINT "Category_parentSlug_fkey" FOREIGN KEY ("parentSlug") REFERENCES "Category" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("canDry", "createdAt", "label", "order", "parentSlug", "slug") SELECT "canDry", "createdAt", "label", "order", "parentSlug", "slug" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_parentSlug_idx" ON "Category"("parentSlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
