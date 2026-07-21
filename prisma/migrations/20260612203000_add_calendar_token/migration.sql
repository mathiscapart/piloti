-- US-P02 — jeton d'abonnement iCal (URL sans cookie).
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");
