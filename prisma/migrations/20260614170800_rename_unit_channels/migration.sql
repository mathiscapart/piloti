-- Renomme les salons d'unité vers les branches SGDF et archive les doublons
-- vides créés par la fusion couleur→branche. Basé sur les slugs (no-op ailleurs).

-- Scouts-Guides (ex « bleus », salon actif avec messages).
UPDATE "Channel" SET "name" = 'scouts-guides', "slug" = 'scouts-guides'
WHERE "slug" = 'bleus';

-- Pionniers-Caravelles (ex « pios ») ; le doublon vide « rouges » est archivé.
UPDATE "Channel" SET "name" = 'pionniers-caravelles', "slug" = 'pionniers'
WHERE "slug" = 'pios';
UPDATE "Channel" SET "archived" = true WHERE "slug" = 'rouges';

-- Compagnons : le salon « compagnons » existe déjà ; doublon vide « verts » archivé.
UPDATE "Channel" SET "archived" = true WHERE "slug" = 'verts';
