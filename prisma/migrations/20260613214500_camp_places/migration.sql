-- US-L (V6) — lieux de camp : fiches partagées + avis.
CREATE TABLE "CampPlace" (
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
    "notes" TEXT,
    "photosJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "CampPlace_archived_idx" ON "CampPlace"("archived");

CREATE TABLE "CampPlaceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "authorId" TEXT,
    "eventId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampPlaceReview_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "CampPlace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CampPlaceReview_placeId_idx" ON "CampPlaceReview"("placeId");

ALTER TABLE "Event" ADD COLUMN "campPlaceId" TEXT
    REFERENCES "CampPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Event_campPlaceId_idx" ON "Event"("campPlaceId");
