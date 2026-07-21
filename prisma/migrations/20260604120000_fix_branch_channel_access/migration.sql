-- US-32 / US-C09 — correctif d'accès aux salons de branche.
-- Bug : les salons d'unité (bleus, verts, rouges, pios, compagnons) avaient été
-- seedés avec accessRoles='["CHEF"]'. Or `canAccessChannel` accorde l'accès dès
-- qu'UN rôle correspond → n'importe quel CHEF voyait TOUS les salons de branche,
-- pas seulement celui de son unité.
--
-- Correctif : un salon de branche doit être réservé à son unité (accessUnits).
-- L'accès du chef à son propre salon découle de son unité ; les jeunes de la
-- branche y accèdent de même. On vide donc accessRoles pour tout salon qui cible
-- une unité. Idempotent (dev + prod).
UPDATE "Channel"
SET "accessRoles" = '[]'
WHERE "accessUnits" IS NOT NULL
  AND "accessUnits" <> ''
  AND "accessUnits" <> '[]';
