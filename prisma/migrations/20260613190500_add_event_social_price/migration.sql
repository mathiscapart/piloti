-- US-F05 — tarif « cas social » d'un événement + marquage par inscription.
ALTER TABLE "Event" ADD COLUMN "socialPriceCents" INTEGER;
ALTER TABLE "EventRegistration" ADD COLUMN "social" BOOLEAN NOT NULL DEFAULT false;
