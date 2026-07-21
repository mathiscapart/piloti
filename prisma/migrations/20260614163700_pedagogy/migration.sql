-- V7 — Suivi pédagogique (US-S01…S10).
CREATE TABLE "ProgressionStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unit" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "ProgressionStep_unit_archived_idx" ON "ProgressionStep"("unit", "archived");

CREATE TABLE "Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "unitsJson" TEXT NOT NULL DEFAULT '[]',
    "criteria" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Badge_archived_idx" ON "Badge"("archived");

CREATE TABLE "StepValidation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stepId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposedById" TEXT,
    "confirmedById" TEXT,
    "proposedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "StepValidation_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProgressionStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StepValidation_stepId_userId_key" ON "StepValidation"("stepId", "userId");
CREATE INDEX "StepValidation_userId_idx" ON "StepValidation"("userId");

CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "badgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "awardedById" TEXT,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BadgeAward_badgeId_userId_key" ON "BadgeAward"("badgeId", "userId");
CREATE INDEX "BadgeAward_userId_idx" ON "BadgeAward"("userId");

CREATE TABLE "PedagogicalGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATETIME,
    "stepId" TEXT,
    "badgeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "achievedAt" DATETIME,
    CONSTRAINT "PedagogicalGoal_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProgressionStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PedagogicalGoal_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PedagogicalGoal_userId_idx" ON "PedagogicalGoal"("userId");

CREATE TABLE "PedagogicalNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PedagogicalNote_userId_idx" ON "PedagogicalNote"("userId");
