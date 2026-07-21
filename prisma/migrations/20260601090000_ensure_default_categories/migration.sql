-- US-31 — garantit la présence des catégories par défaut (idempotent).
-- « Autre » est le réceptacle par défaut non supprimable : on le réinsère s'il
-- a été supprimé par l'ancienne logique de suppression. INSERT OR IGNORE ne
-- touche pas les catégories déjà présentes (conflit de clé primaire ignoré).
INSERT OR IGNORE INTO "Category" ("slug", "label", "canDry", "order", "archived") VALUES
    ('TENTE',   'Tente',   1, 0, 0),
    ('MALLE',   'Malle',   0, 1, 0),
    ('CUISINE', 'Cuisine', 0, 2, 0),
    ('BIVOUAC', 'Bivouac', 0, 3, 0),
    ('JEU',     'Jeu',     0, 4, 0),
    ('AUTRE',   'Autre',   0, 5, 0);
