-- D-019 — restaure les données par défaut perdues lors du squash des migrations
-- redondantes avec `20260514210509_init` : celle-ci ne contient que le schéma,
-- pas les `INSERT`/`UPDATE` de données que portaient les 49 migrations
-- supprimées (catégories d'inventaire US-31, salons de communication US-C09,
-- matrice d'accès US-32). Résultat : toute base créée depuis le squash
-- démarrait sans aucun salon ni catégorie.
--
-- Contenu = l'état FINAL cumulé que produisait cet historique (pas les étapes
-- intermédiaires), vérifié en lecture seule sur la prod : les salons n'y sont
-- créés que par migration, donc la prod contient exactement le set par défaut.
-- Idempotent (`INSERT OR IGNORE`) : sans aucun effet sur la prod, qui a déjà
-- ces lignes.

-- US-31 — catégories d'inventaire par défaut.
INSERT OR IGNORE INTO "Category" ("slug", "label", "canDry", "order", "archived") VALUES
    ('TENTE',   'Tente',   1, 0, 0),
    ('MALLE',   'Malle',   0, 1, 0),
    ('CUISINE', 'Cuisine', 0, 2, 0),
    ('BIVOUAC', 'Bivouac', 0, 3, 0),
    ('JEU',     'Jeu',     0, 4, 0),
    ('AUTRE',   'Autre',   0, 5, 0);

-- US-C09 — catégories de salons par défaut.
INSERT OR IGNORE INTO "ChannelCategory" ("id", "name", "order") VALUES
  ('chcat_commun', 'Commun', 0),
  ('chcat_unites', 'Unités', 1);

-- US-C09 / US-32 — salons par défaut, dans leur configuration finale (slugs et
-- noms de branches SGDF, matrice d'accès par rôle) telle que reconstituée par
-- l'historique des migrations supprimées puis vérifiée en prod.
INSERT OR IGNORE INTO "Channel"
  ("id", "categoryId", "name", "slug", "description", "order", "archived", "accessRoles", "accessUnits")
VALUES
  ('ch_annonces', 'chcat_commun', 'annonces',             'annonces',         'Annonces du groupe',           0, 0, '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL","PARENT"]', '[]'),
  ('ch_general',  'chcat_commun', 'général',              'general',          'Discussion générale',          1, 0, '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL","PARENT"]', '[]'),
  ('ch_materiel', 'chcat_commun', 'matériel',             'materiel',         'Logistique & matériel',        2, 0, '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL"]',           '[]'),
  ('ch_equipe',   'chcat_commun', 'équipe-de-groupe',     'equipe-de-groupe', 'Réservé à l''équipe de groupe', 3, 0, '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL"]',           '[]'),
  ('ch_budget',   'chcat_commun', 'budget',               'budget',           'Trésorerie',                    4, 0, '["RESPONSABLE_GROUPE","CHEF","RESPONSABLE_MATERIEL","TRESORIER","SECRETAIRE","MEMBRE_LOCAL"]',           '[]'),
  ('ch_bleus',    'chcat_unites', 'scouts-guides',        'scouts-guides',    'Fil des Bleus',                 0, 0, '[]', '["SCOUTS"]'),
  ('ch_verts',    'chcat_unites', 'verts',                'verts',            'Fil des Verts',                 1, 1, '[]', '["COMPAGNONS"]'),
  ('ch_rouges',   'chcat_unites', 'rouges',               'rouges',           'Fil des Rouges',                2, 1, '[]', '["PIONNIERS"]'),
  ('ch_pios',     'chcat_unites', 'pionniers-caravelles', 'pionniers',        'Fil des Pios',                  3, 0, '[]', '["PIONNIERS"]'),
  ('ch_compas',   'chcat_unites', 'compagnons',           'compagnons',       'Fil des Compagnons',            4, 0, '[]', '["COMPAGNONS"]');
