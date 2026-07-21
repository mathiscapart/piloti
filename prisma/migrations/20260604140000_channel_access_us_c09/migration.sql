-- US-C09 — alignement complet de la matrice d'accès aux salons sur la spec US-32.
-- Modèle : accès accordé si rôle ∈ accessRoles OU unité ∈ accessUnits (ADMIN bypass
-- dans le code). On définit des listes de rôles EXPLICITES par salon transverse
-- (plus robuste que dépendre de unit=VIOLETS, non garanti sur les comptes).
--
-- Décisions sur les zones « à préciser » de la spec :
--   • RESPONSABLE_MATERIEL : les 5 salons transverses (spec explicite).
--   • SECRETAIRE : annonce, général, équipe-de-groupe (périmètre Communication +
--     équipe de groupe) ; pas budget ni matériel.
--   • JEUNE (SCOUT) : uniquement le salon de sa branche (via accessUnits).
--   • PARENT : annonce + général seulement.

-- annonces & général : tout le monde sauf le JEUNE (qui n'a que son salon de branche).
UPDATE "Channel"
SET "accessRoles" = '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL","PARENT"]'
WHERE "slug" IN ('annonces', 'general');

-- matériel & budget : encadrants + logistique/finance (ni SECRETAIRE, ni PARENT, ni JEUNE).
UPDATE "Channel"
SET "accessRoles" = '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","MEMBRE_LOCAL"]'
WHERE "slug" IN ('materiel', 'budget');

-- équipe-de-groupe : encadrants + équipe de groupe (dont SECRETAIRE) ; ni PARENT, ni JEUNE.
UPDATE "Channel"
SET "accessRoles" = '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL"]'
WHERE "slug" = 'equipe-de-groupe';

-- salons de branche : réservés à leur unité uniquement (accessUnits) — pas d'accès par rôle.
UPDATE "Channel"
SET "accessRoles" = '[]'
WHERE "accessUnits" IS NOT NULL
  AND "accessUnits" <> ''
  AND "accessUnits" <> '[]';
