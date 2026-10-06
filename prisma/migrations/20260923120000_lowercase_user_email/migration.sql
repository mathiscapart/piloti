-- #149 — met en minuscules les emails déjà enregistrés avec une majuscule.
-- better-auth cherche toujours `email.toLowerCase()` et SQLite compare en
-- tenant compte de la casse : ces comptes étaient introuvables à la connexion
-- et au « mot de passe oublié ». Depuis #149, `updateUserAccount` normalise la
-- saisie ; cette migration rattrape les données existantes (D-038).
--
-- Collision : si un autre compte porte déjà la même adresse à la casse près,
-- aucun des deux n'est modifié (l'index unique ferait échouer la migration,
-- donc le démarrage de la prod). Ils restent à fusionner ou corriger à la main :
--   SELECT lower(email), count(*) FROM "User" GROUP BY lower(email) HAVING count(*) > 1;
--
-- Traçabilité : une ligne d'audit par compte modifié, écrite AVANT la mise à
-- jour (même filtre). Pas d'acteur humain : `userId` est le compte lui-même.
-- L'adresse n'est pas copiée dans `metadata` (RGPD, cf. anonymize.ts).
-- Idempotent : une fois les emails en minuscules, les deux requêtes ne
-- sélectionnent plus rien. Prisma n'ouvre pas de transaction sur SQLite : si
-- l'UPDATE échoue après l'INSERT, `OR IGNORE` permet de rejouer la migration
-- (après `migrate resolve --rolled-back`) sans heurter l'id déjà inséré.

INSERT OR IGNORE INTO "AuditLog" ("id", "action", "userId", "metadata", "createdAt")
SELECT
    'mig149_' || u."id",
    'USER_EMAIL_LOWERCASED',
    u."id",
    json_object('targetUserId', u."id", 'migration', '20260923120000_lowercase_user_email'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "User" u
WHERE u."email" != lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "User" o WHERE o."id" != u."id" AND lower(o."email") = lower(u."email")
  );

UPDATE "User"
SET "email" = lower("email"),
    "updatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE "email" != lower("email")
  AND NOT EXISTS (
    SELECT 1 FROM "User" o WHERE o."id" != "User"."id" AND lower(o."email") = lower("User"."email")
  );
