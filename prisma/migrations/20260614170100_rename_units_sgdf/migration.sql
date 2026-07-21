-- Renommage des unités vers les branches officielles SGDF.
-- Correspondance : BLEUS→SCOUTS, VERTS→COMPAGNONS, ROUGES→PIONNIERS,
-- PIOS→PIONNIERS, COMPAS→COMPAGNONS, VIOLETS→ADULTES.

-- Colonnes "unit"/"audience" (valeur simple).
UPDATE "User" SET "unit" = CASE "unit"
  WHEN 'BLEUS' THEN 'SCOUTS' WHEN 'VERTS' THEN 'COMPAGNONS'
  WHEN 'ROUGES' THEN 'PIONNIERS' WHEN 'PIOS' THEN 'PIONNIERS'
  WHEN 'COMPAS' THEN 'COMPAGNONS' WHEN 'VIOLETS' THEN 'ADULTES'
  ELSE "unit" END
WHERE "unit" IN ('BLEUS','VERTS','ROUGES','PIOS','COMPAS','VIOLETS');

UPDATE "Event" SET "unit" = CASE "unit"
  WHEN 'BLEUS' THEN 'SCOUTS' WHEN 'VERTS' THEN 'COMPAGNONS'
  WHEN 'ROUGES' THEN 'PIONNIERS' WHEN 'PIOS' THEN 'PIONNIERS'
  WHEN 'COMPAS' THEN 'COMPAGNONS' WHEN 'VIOLETS' THEN 'ADULTES'
  ELSE "unit" END
WHERE "unit" IN ('BLEUS','VERTS','ROUGES','PIOS','COMPAS','VIOLETS');

UPDATE "Campaign" SET "unit" = CASE "unit"
  WHEN 'BLEUS' THEN 'SCOUTS' WHEN 'VERTS' THEN 'COMPAGNONS'
  WHEN 'ROUGES' THEN 'PIONNIERS' WHEN 'PIOS' THEN 'PIONNIERS'
  WHEN 'COMPAS' THEN 'COMPAGNONS' WHEN 'VIOLETS' THEN 'ADULTES'
  ELSE "unit" END
WHERE "unit" IN ('BLEUS','VERTS','ROUGES','PIOS','COMPAS','VIOLETS');

UPDATE "ProgressionStep" SET "unit" = CASE "unit"
  WHEN 'BLEUS' THEN 'SCOUTS' WHEN 'VERTS' THEN 'COMPAGNONS'
  WHEN 'ROUGES' THEN 'PIONNIERS' WHEN 'PIOS' THEN 'PIONNIERS'
  WHEN 'COMPAS' THEN 'COMPAGNONS' WHEN 'VIOLETS' THEN 'ADULTES'
  ELSE "unit" END
WHERE "unit" IN ('BLEUS','VERTS','ROUGES','PIOS','COMPAS','VIOLETS');

UPDATE "Announcement" SET "audience" = CASE "audience"
  WHEN 'BLEUS' THEN 'SCOUTS' WHEN 'VERTS' THEN 'COMPAGNONS'
  WHEN 'ROUGES' THEN 'PIONNIERS' WHEN 'PIOS' THEN 'PIONNIERS'
  WHEN 'COMPAS' THEN 'COMPAGNONS' WHEN 'VIOLETS' THEN 'ADULTES'
  ELSE "audience" END
WHERE "audience" IN ('BLEUS','VERTS','ROUGES','PIOS','COMPAS','VIOLETS');

-- Colonnes JSON (tableaux d'unités) : remplacement des jetons entre guillemets.
UPDATE "Channel" SET "accessUnits" = replace(replace(replace(replace(replace(replace(
  "accessUnits", '"BLEUS"','"SCOUTS"'), '"VERTS"','"COMPAGNONS"'),
  '"ROUGES"','"PIONNIERS"'), '"PIOS"','"PIONNIERS"'),
  '"COMPAS"','"COMPAGNONS"'), '"VIOLETS"','"ADULTES"');

UPDATE "Channel" SET "excludeUnits" = replace(replace(replace(replace(replace(replace(
  "excludeUnits", '"BLEUS"','"SCOUTS"'), '"VERTS"','"COMPAGNONS"'),
  '"ROUGES"','"PIONNIERS"'), '"PIOS"','"PIONNIERS"'),
  '"COMPAS"','"COMPAGNONS"'), '"VIOLETS"','"ADULTES"');

UPDATE "Badge" SET "unitsJson" = replace(replace(replace(replace(replace(replace(
  "unitsJson", '"BLEUS"','"SCOUTS"'), '"VERTS"','"COMPAGNONS"'),
  '"ROUGES"','"PIONNIERS"'), '"PIOS"','"PIONNIERS"'),
  '"COMPAS"','"COMPAGNONS"'), '"VIOLETS"','"ADULTES"');
