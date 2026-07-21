# CLAUDE.md — Piloti

## 1. Projet

Application de gestion pour un groupe scout SGDF : inventaire matériel, prêts, incidents,
finances, planning, communication, suivi pédagogique, lieux de camp. Utilisateurs = chefs,
responsables, parents, jeunes — d'où un modèle de rôles fin et des exigences RGPD réelles
(mineurs, consentement parental, effacement). Instance unique auto-hébergée.

## 2. Stack

Next.js 16 (App Router, `output: 'standalone'`) · React 19 · TypeScript strict ·
Tailwind v4 (CSS-first) · shadcn/ui · Prisma 7 + SQLite (`better-sqlite3`) · better-auth ·
Zod · Resend (emails) · web-push (notifications) · Docker + Traefik + cloudflared en prod.
Gestionnaire de paquets : **pnpm**.

## 3. Structure

- `src/app/` — routes. Groupes : `(app)` protégé, `(auth)` login/register/setup, `(public)` pages légales, `api/`.
- `src/modules/<domaine>/` — logique métier : `queries.ts` (lecture), `*-actions.ts` (Server Actions), `types.ts` (Zod).
  Domaines : `admin`, `audience`, `camp`, `communication`, `family`, `finance`, `inventory`,
  `notifications`, `pedagogy`, `planning`.
- `src/lib/` — socle transverse : `auth.ts`, `permissions.ts`, `audit.ts`, `db.ts`, `enums.ts`, `anonymize.ts`.
- `src/components/ui/` — primitives shadcn (on possède le code, on les édite directement).
- `src/proxy.ts` — protection des routes. `prisma/` — schéma, migrations, seed. `traefik/` — reverse proxy prod.

## 4. Commandes (toutes vérifiées dans `package.json`)

`pnpm dev` (:3000) · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` ·
`pnpm db:migrate` / `db:seed` / `db:studio` / `db:reset` / `db:generate` · `pnpm icons:generate`.

**Il n'y a aucun runner de tests dans ce repo.** La vérification passe par `pnpm lint` +
`pnpm typecheck` + exécution réelle du parcours dans l'app.

## 5. Invariants non négociables

- **Toute mutation de données passe par `withAudit()`** (`src/lib/audit.ts`) : la mutation et
  l'`AuditLog` sont dans la **même transaction Prisma**. Jamais de mutation sans trace.
- **Toute Server Action / page sensible commence par `can(user, "…")`** (`src/lib/permissions.ts`,
  source unique de la matrice de rôles). Pas de contrôle d'accès ad hoc.
- **better-auth**, jamais NextAuth. **SQLite** en dev ET en prod.
- Code et identifiants en **anglais**, UI/messages utilisateur/commits/doc en **français**.
- **Aucun port exposé en prod** : tout entre par cloudflared → Traefik. Ne jamais ajouter de `ports:`
  dans `docker-compose.yml`.
- Design : palette et tokens SGDF uniquement (`globals.css`), Design System Notion « Style SGDF ».
- Aucun secret en clair : `.env` / `.env.production` ne sont pas commités.

## 6. Pièges connus

- **Next 16 : `middleware.ts` n'existe plus → `src/proxy.ts`.** Un `middleware.ts` ne serait jamais exécuté.
- **Tailwind v4 : pas de `tailwind.config.*`.** Les tokens vivent dans `src/app/globals.css` (`@theme inline`) ;
  les tokens shadcn (`--color-primary`…) sont des alias des tokens SGDF.
- **SQLite** : pas de `ON DELETE SET NULL` fiable, pas d'enum natif, `ALTER TABLE` limité. Les enums sont des
  constantes TS (`src/lib/enums.ts`) et la suppression d'un utilisateur est une **anonymisation** (`anonymize.ts`).
- Ajouter un domaine externe (carte, CDN, police) impose de mettre à jour la **CSP** de `traefik/config/middlewares.yml`,
  sinon l'échec n'apparaît qu'en prod.
- Le premier lancement passe par `/setup` (base vide détectée dans `proxy.ts`), pas par un seed.

## 7. Workflow

Décisions techniques structurantes → une entrée dans `DECISIONS.md` (Contexte / Choix / Conséquences),
on amende, on n'efface pas. Commits en **conventional commits, en français**, scope = domaine et
référence de user story quand elle existe (`feat(finances): US-F06 — …`). Travail sur branche
`feat/<sujet>`, fusion dans `main`. Pas de push/déploiement sans validation humaine explicite.
