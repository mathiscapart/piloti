# DECISIONS

Choix techniques autonomes du projet Piloti. Une décision = un paragraphe (Contexte / Choix / Conséquences). Toute évolution remplace ou amende l'entrée existante — on n'efface pas le passé, on documente le changement.

---

## D-001 — Layout `src/app/` plutôt que `app/` à la racine

**Contexte** : le scaffold `create-next-app` posait `app/` à la racine. Le prompt et la plupart des projets Next.js de cette taille placent les routes sous `src/`.

**Choix** : déplacer `app/ → src/app/` via `git mv` (historique préservé), aligner l'alias `tsconfig.json` `@/* → ./src/*`.

**Conséquences** : tous les imports applicatifs passent par `@/…`. La racine reste réservée à la config (next.config.ts, eslint.config.mjs, prisma/, traefik/, etc.).

---

## D-002 — Tailwind v4 CSS-first, pas de `tailwind.config.ts`

**Contexte** : Tailwind v4 supporte une configuration entièrement CSS via `@theme`. Le plan évoquait un `tailwind.config.ts` par habitude v3.

**Choix** : aucun fichier de config TypeScript. Les tokens (couleurs SGDF, fontes, ombres, rayons) sont définis dans `src/app/globals.css` dans un bloc `@theme inline`. Les variantes utilisables sont générées par Tailwind à partir des `--color-…` / `--font-…` exposés.

**Conséquences** : un seul fichier à modifier pour le design system. Pas de duplication TS↔CSS. Les utilitaires `bg-forest`, `text-earth`, `bg-primary` (shadcn) fonctionnent en parallèle parce que les tokens shadcn sont aliasés sur les tokens SGDF.

---

## D-003 — shadcn/ui en primitive, customisé pour SGDF

**Contexte** : le prompt laisse libre le choix de la lib UI. shadcn/ui = composants Radix owned-in-repo, skinnable, accessibles.

**Choix** : `pnpm dlx shadcn@latest add` pour scaffolder Button/Card/Input/Label/Badge/Dialog/Sheet/Tabs/Select/Checkbox/Textarea/Avatar/DropdownMenu. Le `<Toaster/>` vient directement de `sonner` (importé dans `layout.tsx`) plutôt que via le wrapper shadcn — pas de raison d'ajouter une couche.

**Conséquences** : on possède le code des composants ; les mises à jour shadcn ne cassent rien. Le Button est customisé `rounded-full` + `font-bold` conforme à la spec SGDF, avec une variante `info` (`bg-sky`). Toute future modification d'un composant primitif se fait en éditant `src/components/ui/…` directement.

---

## D-004 — Mapping shadcn ↔ SGDF dans `@theme`

**Contexte** : shadcn utilise des tokens sémantiques (`--color-primary`, `--color-background`, `--color-destructive`, etc.). Les nôtres sont nommés (`forest`, `sand`, `brick`).

**Choix** : dans `globals.css`, `--color-primary` etc. sont définis comme alias des tokens SGDF (`var(--color-forest)`). Les composants shadcn héritent automatiquement de la palette sans modification.

**Conséquences** : un changement de palette se fait uniquement sur les tokens SGDF (`--color-forest`) — tout shadcn suit. Si une future refonte demande des composants hors-SGDF, on override localement.

---

## D-005 — Next.js 16 `proxy.ts` au lieu de `middleware.ts`

**Contexte** : Next.js 16 a renommé `middleware.ts` en `proxy.ts` (changement breaking documenté). Le prompt initial mentionnait `middleware.ts`.

**Choix** : la protection de routes se fera dans `src/proxy.ts` (Phase 2).

**Conséquences** : tout exemple/référence en ligne mentionnant `middleware.ts` doit être adapté. Documenté ici et dans `CLAUDE.md` pour éviter qu'un futur Claude propose un `middleware.ts` qui ne sera jamais exécuté en Next 16.

---

## D-006 — `next.config.ts` en mode `standalone`

**Contexte** : le runner Docker doit être minimal et indépendant de `node_modules`.

**Choix** : `output: 'standalone'` activé dès Phase 0. La build copie l'auto-extracteur dans `.next/standalone/` ; Phase 9 (Dockerfile) s'en sert pour produire un runner léger.

**Conséquences** : `pnpm build` génère `.next/standalone/server.js`. Une démarche dev locale n'est pas affectée (`pnpm dev` reste inchangé).

---

## D-007 — Polices : Nunito (UI) + JetBrains Mono (code)

**Contexte** : le Design System SGDF impose Nunito (sans) et JetBrains Mono (mono).

**Choix** : `next/font/google` charge Nunito avec les poids 400-900 (variable `--font-nunito`) et JetBrains Mono (variable `--font-jetbrains-mono`). Ces variables sont posées sur `<html>` puis liées à `--font-sans` / `--font-mono` dans `@theme`.

**Conséquences** : aucune dépendance externe / CDN à runtime, les polices sont servies depuis `/_next/static`. Utilitaires `font-sans` / `font-mono` standards.

---

## D-008 — Catégories de matériel dynamiques (DB) plutôt qu'enum fixe

**Contexte** : un enum TypeScript pour les catégories aurait obligé une migration Prisma + redéploiement pour chaque nouvelle catégorie. Les groupes scouts ajoutent régulièrement du matériel atypique.

**Choix** : les catégories sont stockées en table `Category` (DB), gérées depuis l'interface admin → Catégories. Le champ `equipment.category` est une string libre liée à `Category.slug`.

**Conséquences** : un admin peut créer/renommer des catégories sans toucher au code. Prisma ne valide pas l'appartenance via FK (SQLite) — la validation se fait au niveau Server Action. Les catégories d'origine sont insérées via `db:seed` et via l'interface admin.

---

## D-009 — Politique de mot de passe partagée via `password-policy.ts`

**Contexte** : plusieurs points d'entrée nécessitent la même politique (inscription, reset de mdp, changement admin). Dupliquer les règles Zod risquait de les faire diverger.

**Choix** : `src/lib/password-policy.ts` exporte `passwordSchema` (Zod, 12 car. min + majuscule + minuscule + chiffre) et `PASSWORD_HINT` (texte affiché à l'utilisateur). Toutes les actions qui valident un mot de passe importent ce module.

**Conséquences** : une seule modification pour changer la politique globale. Le validateur `better-auth` (`minPasswordLength: 12`) est aligné manuellement — il n'utilise pas le schéma Zod mais applique la même limite.

---

## D-010 — Premier lancement via `/setup` (pattern n8n)

**Contexte** : forcer un `pnpm db:seed` au premier lancement en prod est une mauvaise expérience (nécessite accès shell). L'alternative "comptes prédéfinis dans la migration" est un risque de sécurité.

**Choix** : à la détection d'une base vide (`db.user.count() === 0`) dans `src/proxy.ts`, toute navigation redirige vers `/setup`. Cette page propose un formulaire de création du premier compte admin. Une fois soumis, le proxy retrouve des utilisateurs et `/setup` devient inaccessible.

**Conséquences** : le workflow de production est : `docker compose up -d` → ouvrir l'URL → remplir le formulaire de setup. Aucun accès shell requis. La détection n'est faite que sur les requêtes non-authentifiées pour ne pas coûter une requête DB sur chaque appel protégé.

---

## D-011 — Soft-delete des utilisateurs (préservation FK)

**Contexte** : Prisma + SQLite n'ont pas de `ON DELETE SET NULL` automatique sur les relations `AuditLog.user`, `Loan.borrower`, `Incident.reporter`. Un hard-delete violerait les contraintes FK et détruirait l'historique.

**Choix** : "suppression" = passage du statut à `DELETED` + anonymisation de l'email (`deleted+<id>@piloti.invalid`). Les sessions et comptes (mots de passe) sont supprimés pour empêcher toute connexion. Les données liées (prêts, incidents, audit) restent intactes.

**Conséquences** : l'historique d'audit reste cohérent. L'utilisateur ne peut plus se connecter. L'email est libéré pour ré-inscription. L'interface admin filtre les comptes `DELETED` de la liste principale.

---

## D-012 — `auth.handler` synthétique pour `forgetPassword`

**Contexte** : `auth.api.forgetPassword` n'est pas exposé comme méthode typée dans better-auth v1.6 (seul `resetPassword` l'est). Un appel HTTP direct `fetch("http://localhost:3000/api/auth/forget-password")` est impossible dans Docker car le réseau `internal: true` interdit l'egress Internet/loopback.

**Choix** : dans `src/app/(auth)/forgot-password/actions.ts`, on construit une `Request` synthétique et on l'injecte directement dans `auth.handler(req)`. Pas de réseau, pas de port, juste un appel in-process.

**Conséquences** : fonctionne quel que soit le contexte réseau (dev local, Docker isolé, prod). Si better-auth expose `forgetPassword` dans une version future, on peut migrer vers `auth.api.forgetPassword` sans changer la logique.

---

## D-013 — Resend pour les emails transactionnels

**Contexte** : l'envoi d'emails de reset de mot de passe nécessite un service SMTP ou API. SMTP en prod (Cloudflare tunnel, réseau `internal: true`) n'est pas trivial. Resend offre une API REST simple, un plan gratuit généreux (3 000 emails/mois), et un SDK npm.

**Choix** : `resend` ajouté aux dépendances. Le client `new Resend(key)` est instancié de façon paresseuse (à l'intérieur du callback `sendResetPassword`) pour éviter une erreur à `next build` quand la clé n'est pas disponible.

**Conséquences** : si `RESEND_API_KEY` est absent, le lancement de l'app ne plante pas — seul le flux "mot de passe oublié" renvoie une erreur. En production, la clé est injectée dans `.env.production` (jamais commitée).
