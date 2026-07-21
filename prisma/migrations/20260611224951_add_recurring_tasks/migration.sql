-- CreateTable
CREATE TABLE "TaskSignup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSignup_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskSignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" DATETIME,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "recurrenceEvery" INTEGER NOT NULL DEFAULT 1,
    "groupTask" BOOLEAN NOT NULL DEFAULT false,
    "minRequired" INTEGER NOT NULL DEFAULT 0,
    "nextGenerated" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" DATETIME,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "createdAt", "createdById", "done", "doneAt", "dueDate", "id", "title", "updatedAt") SELECT "assigneeId", "createdAt", "createdById", "done", "doneAt", "dueDate", "id", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_done_idx" ON "Task"("done");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskSignup_taskId_idx" ON "TaskSignup"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSignup_taskId_userId_key" ON "TaskSignup"("taskId", "userId");
