-- US-C09 — salons par défaut (idempotent, dev + prod). IDs fixes pour INSERT OR
-- IGNORE. Accès : [] = ouvert à tous ; sinon rôle ∈ accessRoles OU unité ∈ accessUnits.

INSERT OR IGNORE INTO "ChannelCategory" ("id", "name", "order") VALUES
  ('chcat_commun', 'Commun', 0),
  ('chcat_unites', 'Unités', 1);

INSERT OR IGNORE INTO "Channel"
  ("id", "categoryId", "name", "slug", "description", "order", "accessRoles", "accessUnits")
VALUES
  ('ch_annonces',  'chcat_commun', 'annonces',         'annonces',         'Annonces du groupe', 0, '[]', '[]'),
  ('ch_general',   'chcat_commun', 'général',           'general',          'Discussion générale', 1, '[]', '[]'),
  ('ch_materiel',  'chcat_commun', 'matériel',          'materiel',         'Logistique & matériel', 2, '[]', '[]'),
  ('ch_equipe',    'chcat_commun', 'équipe-de-groupe',  'equipe-de-groupe', 'Réservé à l''équipe de groupe', 3, '["CHEF","RESPONSABLE_GROUPE"]', '[]'),
  ('ch_budget',    'chcat_commun', 'budget',            'budget',           'Trésorerie', 4, '["CHEF","TRESORIER"]', '[]'),
  ('ch_bleus',     'chcat_unites', 'bleus',             'bleus',            'Fil des Bleus', 0, '["CHEF"]', '["BLEUS"]'),
  ('ch_verts',     'chcat_unites', 'verts',             'verts',            'Fil des Verts', 1, '["CHEF"]', '["VERTS"]'),
  ('ch_rouges',    'chcat_unites', 'rouges',            'rouges',           'Fil des Rouges', 2, '["CHEF"]', '["ROUGES"]'),
  ('ch_pios',      'chcat_unites', 'pios',              'pios',             'Fil des Pios', 3, '["CHEF"]', '["PIOS"]'),
  ('ch_compas',    'chcat_unites', 'compagnons',        'compagnons',       'Fil des Compagnons', 4, '["CHEF"]', '["COMPAS"]');
