-- US-F04/F05 — budget d'événement & encaissement des inscriptions.
ALTER TABLE "Event" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "EventRegistration" ADD COLUMN "paidCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "plannedCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BudgetLine_eventId_category_key" ON "BudgetLine"("eventId", "category");
CREATE INDEX "BudgetLine_eventId_idx" ON "BudgetLine"("eventId");
