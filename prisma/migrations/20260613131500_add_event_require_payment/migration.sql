-- US-F05 — inscription provisoire tant que non payée (option par événement).
ALTER TABLE "Event" ADD COLUMN "requirePayment" BOOLEAN NOT NULL DEFAULT false;
