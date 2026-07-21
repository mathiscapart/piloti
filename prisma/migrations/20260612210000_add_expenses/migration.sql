-- US-F06/F07 — notes de frais.
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "eventId" TEXT,
    "note" TEXT,
    "receiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "reimbursedAt" DATETIME,
    "reimbursementMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_declarantId_fkey" FOREIGN KEY ("declarantId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_declarantId_idx" ON "Expense"("declarantId");
