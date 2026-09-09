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

`pnpm dev` (:3000) · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test` ·
`pnpm db:migrate` / `db:seed` / `db:studio` / `db:reset` / `db:generate` · `pnpm icons:generate`.

**Vitest** (`pnpm test`, `pnpm test:watch`) couvre la logique pure : `src/lib/` (âge, permissions…)
et les modules de calcul de `src/modules/*` (montants, tarifs…). Les Server Actions, les
composants React et les accès Prisma **ne sont pas testés** unitairement.

### Boucle de vérification obligatoire

| Couche | Preuve exigée avant de dire « fini » |
|---|---|
| `src/lib/`, calculs de `src/modules/*` | **TDD** : test Vitest rouge écrit **avant** le code, puis vert. |
| Server Actions, composants, Prisma | `pnpm lint` + `pnpm typecheck`, **puis** parcours réel exécuté et observé — skill `webapp-testing` ou MCP `playwright`. |

Ports et réseaux à viser (le principe hôte/conteneur est dans le CLAUDE.md global) :

| Ce qui tourne | Depuis l'hôte | Depuis le conteneur MCP |
|---|---|---|
| `pnpm dev` | `localhost:3000` | `host.docker.internal:3000` |
| `docker-compose.dev.yml` | `localhost:4000` (publie `4000:3000`, le 3000 hôte est exclu par Windows) | `host.docker.internal:4000` |
| stack prod locale | `https://piloti.mathiscapart.xyz` — aucun port publié | `--network piloti_internal` puis `http://piloti-app-1:3000` |

Le nom de service est `app` : depuis un navigateur c'est **inutilisable**, `app`
est un TLD préchargé HSTS et Chromium force le HTTPS (`ERR_SSL_PROTOCOL_ERROR`).
Viser le nom de conteneur `piloti-app-1`. `curl` et `fetch` ne sont pas concernés.

Un `pnpm typecheck` vert ne prouve rien sur le comportement. Aucune Server Action
n'est « finie » sans qu'un parcours l'ait traversée pour de vrai.

**Next 16, Prisma 7, Tailwind v4 sont plus récents que mes données d'entraînement** :
avant d'écrire contre une de leurs API, lis `node_modules/next/dist/docs/` ou
interroge `context7`. Ne devine jamais une signature.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
