-- US-15 — UID du tag NFC associé à un article (nullable, unique).
-- SQLite autorise plusieurs NULL dans un index unique : les articles sans tag
-- ne se gênent pas.
ALTER TABLE "Equipment" ADD COLUMN "nfcUid" TEXT;
CREATE UNIQUE INDEX "Equipment_nfcUid_key" ON "Equipment"("nfcUid");
