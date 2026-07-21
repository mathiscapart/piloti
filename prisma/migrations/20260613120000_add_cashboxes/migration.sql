-- US-F10 — caisses & grand livre.
CREATE TABLE "CashBox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cashBoxId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "transferGroupId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashTransaction_cashBoxId_fkey" FOREIGN KEY ("cashBoxId") REFERENCES "CashBox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CashTransaction_cashBoxId_idx" ON "CashTransaction"("cashBoxId");
