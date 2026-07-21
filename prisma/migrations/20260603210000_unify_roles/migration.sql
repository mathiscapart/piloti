-- US-32 — rôles unifiés : `roles` (JSON) devient l'unique source de rôles.
-- On y intègre l'ancien rôle principal `role` pour ne perdre aucun droit.
-- (Les doublons éventuels sont sans effet sur can(). `role` reste comme miroir.)
UPDATE "User"
SET "roles" = json_insert(
  CASE WHEN "roles" IS NULL OR "roles" = '' THEN '[]' ELSE "roles" END,
  '$[#]', "role"
)
WHERE "role" IS NOT NULL;
