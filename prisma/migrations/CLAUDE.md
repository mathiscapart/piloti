Migrations versionnées (git) et appliquées en prod au boot par le service `migrate`.

- Ne jamais éditer ni renommer une migration déjà commitée : on en crée une nouvelle.
- SQLite : `ALTER TABLE` limité, pas d'enum, FK peu strictes — Prisma recrée la table (perte de données possible), relire le SQL généré.
- Certaines migrations contiennent des `INSERT`/`UPDATE` de données (catégories, canaux, rôles) : elles doivent rester idempotentes.
- Base pré-existante sans `_prisma_migrations` → baseline via `prisma migrate resolve --applied …` avant tout `migrate deploy` (cf. D-015 dans `DECISIONS.md`).
- Après un squash d'init, une migration absorbée se **supprime**, jamais ne s'édite ; la CI rejoue tout l'historique sur base vierge pour l'attraper si ce n'est pas le cas.
