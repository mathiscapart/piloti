-- US-32 — la SECRÉTAIRE accède aussi aux salons budget & matériel (en plus de
-- annonce, général, équipe-de-groupe déjà accordés par 20260604140000).
-- On réécrit la liste complète des rôles pour ces deux salons en y ajoutant
-- SECRETAIRE (idempotent : la cible finale est fixe).

UPDATE "Channel"
SET "accessRoles" = '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL"]'
WHERE "slug" IN ('materiel', 'budget');
