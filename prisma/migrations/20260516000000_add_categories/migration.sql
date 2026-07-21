-- CreateTable
CREATE TABLE "Category" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "canDry" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default categories (preserve existing equipment slugs)
INSERT INTO "Category" ("slug", "label", "canDry", "order") VALUES
    ('TENTE',   'Tente',   1, 0),
    ('MALLE',   'Malle',   0, 1),
    ('CUISINE', 'Cuisine', 0, 2),
    ('BIVOUAC', 'Bivouac', 0, 3),
    ('JEU',     'Jeu',     0, 4),
    ('AUTRE',   'Autre',   0, 5);
