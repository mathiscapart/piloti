-- US-C06 — sondages dans les salons.

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Poll_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Poll_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Poll_channelId_idx" ON "Poll"("channelId");
CREATE UNIQUE INDEX "PollVote_pollId_userId_optionId_key" ON "PollVote"("pollId", "userId", "optionId");
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");
