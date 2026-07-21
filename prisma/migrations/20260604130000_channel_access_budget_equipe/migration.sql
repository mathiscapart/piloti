-- US-32 / US-C09 — ajustement des accès aux salons transverses :
--   • le TRÉSORIER accède au salon « équipe-de-groupe ».
--   • le RESPONSABLE_GROUPE accède au salon « budget ».
-- On fixe les accessRoles attendus par slug (idempotent, dev + prod).
UPDATE "Channel"
SET "accessRoles" = '["CHEF","RESPONSABLE_GROUPE","TRESORIER"]'
WHERE "slug" = 'equipe-de-groupe';

UPDATE "Channel"
SET "accessRoles" = '["CHEF","TRESORIER","RESPONSABLE_GROUPE"]'
WHERE "slug" = 'budget';
