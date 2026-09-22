-- #150 — remplit la copie (#92) des signalements antérieurs dont le message
-- existe encore, au format de `reportMessage` ({ body, authorId }), pour que
-- l'exclusion de l'auteur (#91) survive à une suppression ultérieure.
-- `backfilled` : le texte est celui du jour de la migration, pas forcément
-- celui qui a été signalé (la page le dit). Idempotent : ne touche que les
-- lignes sans copie.
UPDATE "Report"
SET "targetSnapshot" = (
  SELECT json_object('body', m."body", 'authorId', m."authorId", 'backfilled', json('true'))
  FROM "Message" m
  WHERE m."id" = "Report"."targetId"
)
WHERE "targetSnapshot" IS NULL
  AND "targetType" = 'CHANNEL_MESSAGE'
  AND EXISTS (SELECT 1 FROM "Message" m WHERE m."id" = "Report"."targetId");

UPDATE "Report"
SET "targetSnapshot" = (
  SELECT json_object('body', d."body", 'authorId', d."senderId", 'backfilled', json('true'))
  FROM "DirectMessage" d
  WHERE d."id" = "Report"."targetId"
)
WHERE "targetSnapshot" IS NULL
  AND "targetType" = 'DIRECT_MESSAGE'
  AND EXISTS (SELECT 1 FROM "DirectMessage" d WHERE d."id" = "Report"."targetId");
