-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Task_done_idx" ON "Task"("done");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
