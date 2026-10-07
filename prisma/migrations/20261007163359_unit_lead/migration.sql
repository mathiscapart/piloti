-- CreateTable
CREATE TABLE "UnitLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UnitLead_unit_idx" ON "UnitLead"("unit");

-- CreateIndex
CREATE UNIQUE INDEX "UnitLead_userId_unit_key" ON "UnitLead"("userId", "unit");

-- #128 — reprise des chefs actuels : jusqu'ici le périmètre d'un CHEF était
-- son unité d'appartenance (`User.unit`). Chaque compte qui porte CHEF dans
-- `roles` et une unité reçoit `UnitLead(userId, unit)` : il garde exactement
-- les mêmes droits. Les comptes anonymisés (DELETED) sont exclus (RGPD, cf.
-- anonymize.ts).
--
-- Base vierge (P3018) : `User` est vide, les deux requêtes n'insèrent rien.
-- `roles` illisible : le CASE évite que `json_each` fasse échouer la migration
-- (donc le démarrage de la prod) ; ce compte n'a de toute façon aucun droit
-- (`effectiveRoles` est fail-closed).
-- Idempotent : `OR IGNORE` sur des ids dérivés du compte, comme D-038.
-- Traçabilité : une ligne d'audit par compte repris, sans acteur humain
-- (`userId` = le compte lui-même).

INSERT OR IGNORE INTO "AuditLog" ("id", "action", "userId", "metadata", "createdAt")
SELECT
    'mig128_' || u."id",
    'USER_LEAD_UNITS_CHANGED',
    u."id",
    json_object('targetUserId', u."id", 'units', json_array(u."unit"), 'migration', '20261007163359_unit_lead'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "User" u
WHERE u."unit" IS NOT NULL
  AND u."status" != 'DELETED'
  AND CASE WHEN json_valid(u."roles")
        THEN EXISTS (SELECT 1 FROM json_each(u."roles") r WHERE r."value" = 'CHEF')
        ELSE 0 END;

INSERT OR IGNORE INTO "UnitLead" ("id", "userId", "unit", "createdAt")
SELECT
    'mig128_' || u."id",
    u."id",
    u."unit",
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM "User" u
WHERE u."unit" IS NOT NULL
  AND u."status" != 'DELETED'
  AND CASE WHEN json_valid(u."roles")
        THEN EXISTS (SELECT 1 FROM json_each(u."roles") r WHERE r."value" = 'CHEF')
        ELSE 0 END;
