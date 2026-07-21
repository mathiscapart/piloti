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

## D-011 — Soft-delete des utilisateurs (préservation FK) → RGPD-04 : anonymisation complète

**Contexte** : Prisma + SQLite n'ont pas de `ON DELETE SET NULL` automatique sur les relations `AuditLog.user`, `Loan.borrower`, `Incident.reporter`. Un hard-delete violerait les contraintes FK et détruirait l'historique.

**Choix** : "suppression" = passage du statut à `DELETED` + anonymisation complète de la PII portée par `User` (email → `deleted+<id>@piloti.invalid`, `name`/`firstName`/`lastName` → valeurs génériques, `phone`/`birthDate`/`image`/`rejectedReason`/`calendarToken`/`profession`/`skills`/`availability`/`helpNotes` → `null`, `skillsConsent` → `false`), ainsi que des snapshots de nom qui subsistaient ailleurs : `Loan.dryingPersonName` (contact de séchage, `dryingContactId=userId`) et `Donation.donorName` (don soumis, `donorId=userId`) sont réécrits à `"Compte supprimé"`. `User.socialBracketId` (tranche sociale, FK vers `SocialBracket`) n'est volontairement PAS réinitialisé : ce n'est pas une donnée identifiante une fois le compte anonymisé, et elle peut rester utile pour des statistiques agrégées. Les sessions et comptes (mots de passe) sont supprimés pour empêcher toute connexion. Les données liées (prêts, incidents, audit) restent intactes — seul le lien vers une personne identifiable disparaît. Logique portée par `src/lib/anonymize.ts` (`anonymizeUserInTx`), appelée dans la même transaction que l'`AuditLog` (RGPD-04).

**Conséquences** : l'historique d'audit reste cohérent, sans PII résiduelle (la metadata de l'`AuditLog` `USER_DELETED` ne contient plus que `targetUserId` + `mode`). L'utilisateur ne peut plus se connecter. L'email est libéré pour ré-inscription. L'interface admin filtre les comptes `DELETED` de la liste principale. L'effacement reste réservé à l'admin (V1 — pas de self-service).

**Suivi possible (hors périmètre V1)** : les notes pédagogiques concernant un jeune effacé (`PedagogicalNote.content` et données pédagogiques sans FK vers `User`) ne sont pas nettoyées par cette anonymisation. De même, `Equipment.notes` peut contenir un texte libre recopiant le nom du donateur à la validation d'un don (« Don de X ») — on ne tente pas de nettoyer ce texte libre de façon fuzzy ; résidu connu, non traité en V1.

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

---

## D-014 — Consentement RGPD : table `Consent` append-only + contenu légal versionné en code

**Contexte** : RGPD-01 (pages légales) et RGPD-02 (consentement à l'inscription) exigent une preuve durable du consentement donné (qui, quand, quelle version des textes), y compris pour l'attestation d'un responsable légal quand l'inscrit est mineur de moins de 15 ans. Un simple booléen sur `User` ne suffit pas : il serait écrasable et ne garderait pas l'historique des versions acceptées.

**Choix** : table `Consent` (append-only, jamais modifiée ni supprimée hors cascade de suppression du compte) — un enregistrement par inscription, avec `type` (SELF | PARENTAL), `privacyVersion`/`termsVersion` (figées au moment de l'acceptation), `guardianName` pour le cas mineur, `ipAddress`/`userAgent`. Les versions des textes légaux (`PRIVACY_VERSION`, `TERMS_VERSION`, `LEGAL_VERSION`) vivent en code dans `src/lib/legal/versions.ts`, pas en base : le contenu légal évolue avec le code, pas via une interface d'admin. L'écriture du `Consent` + l'`AuditLog` (`USER_REGISTERED`) se fait dans une seule transaction (`withAudit`) ; si elle échoue après la création du compte par better-auth, le compte tout juste créé est immédiatement supprimé (hard-delete) — jamais de compte sans preuve de consentement.

**Conséquences** : pas de ré-consentement rétroactif des comptes existants lors d'une évolution mineure des textes (hors périmètre V1). Le contenu réel des pages légales (dénomination du groupe, adresse, contact, hébergeur) contient des placeholders `[À COMPLÉTER : …]` à remplir avant mise en production.

**RGPD-04 (effacement)** : à l'anonymisation d'un compte, `Consent.guardianName`/`ipAddress`/`userAgent` sont scrubés (`null`) — ces champs identifient une personne (le responsable légal, l'adresse IP) et n'ont plus de raison d'être conservés une fois le compte effacé. `type`/`privacyVersion`/`termsVersion`/`acceptedAt` restent intacts : c'est la preuve du consentement donné, qui doit survivre à l'effacement de son titulaire.

---

## D-015 — OSS-02 : migrations Prisma versionnées, procédure de baseline

**Contexte** : `prisma/migrations/` était ignoré par git (généré en dev via `db push`/`migrate dev` sans être commité). Pour un projet open-source, l'historique des migrations doit être versionné et reproductible. La migration `20260514210509_init` a été régénérée depuis le schéma courant (elle n'a pas été construite incrémentalement au fil de l'historique réel du projet) : elle contient donc déjà toutes les tables telles qu'elles existent aujourd'hui.

**Choix** : `prisma/migrations/` est désormais suivi par git (retrait de la ligne correspondante dans `.gitignore`). `pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` confirme qu'il n'y a aucune divergence entre les migrations versionnées et le schéma courant.

**Conséquences** : sur une base **vierge**, `prisma migrate deploy` s'applique normalement. Sur un environnement **existant** créé avant ce commit (via `db push`, donc sans table `_prisma_migrations`), un `migrate deploy` échouera avec « table already exists » puisque les tables sont déjà là. Il faut d'abord **baseliner** cet environnement avant le premier déploiement versionné :
```
pnpm prisma migrate resolve --applied 20260514210509_init
pnpm prisma migrate resolve --applied 20260716120000_add_consent_and_birthdate
pnpm prisma migrate deploy
```
Cette étape de baseline n'est à faire qu'une seule fois, sur les environnements pré-existant à ce commit (typiquement la prod actuelle si elle est déjà en service).

---

## D-016 — CI GitHub Actions : deux jobs (qualité / sécurité), outils OSS sans jeton payant

**Contexte** : le dépôt n'avait aucune CI. Le dépôt est très probablement privé, ce qui exclut d'office tout ce qui suppose GitHub Advanced Security (CodeQL, upload SARIF vers code-scanning) ou une licence payante (`gitleaks-action` exige une licence sur dépôt privé — la licence porte sur l'action GitHub elle-même, pas sur le binaire `gitleaks`, qui reste MIT). Il n'y a pas de runner de tests dans ce repo (pas de script `test`).

**Choix** : `.github/workflows/ci.yml`, deux jobs sur `push`/`pull_request`, `concurrency` (annule les runs obsolètes d'une même branche/PR) et `permissions: contents: read` au niveau du workflow.
- **`quality`** : `pnpm install --frozen-lockfile` → `prisma generate` → `pnpm lint` → `pnpm typecheck` → `pnpm build`. Le build a besoin d'un `DATABASE_URL` résolvable (`prisma.config.ts` appelle `env("DATABASE_URL")` dès le chargement de la config, y compris pour `prisma generate`) et d'un `BETTER_AUTH_SECRET` (fail-fast volontaire dans `src/lib/auth.ts`) — deux valeurs placeholder inertes suffisent : le build ne requête jamais réellement la base (aucune page ne fait de fetch DB au build, tout est SSR à la demande).
- **`security`** : détection de secrets (`gitleaks` v8.30.1, image Docker officielle invoquée directement — pas `gitleaks/gitleaks-action`, gatée par une licence sur dépôt privé), audit de dépendances (`pnpm audit`), SAST (`semgrep` v1.170.0, rulesets publics `p/security-audit` + `p/typescript` + `p/react`, `--metrics=off`, image Docker officielle — `semgrep-action`, le wrapper GitHub Marketplace historique, est archivé/déprécié depuis 2024).
- Toutes les actions/images sont pinnées sur un tag de version précis (`actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6`, `zricethezav/gitleaks:v8.30.1`, `semgrep/semgrep:1.170.0`), jamais sur une branche mouvante.
- Politique bloquant/avertissant sur l'audit de dépendances : **bloquant uniquement à partir de `critical`**. À la rédaction, `pnpm audit` remonte 18 vulnérabilités (2 low / 11 moderate / 5 high) toutes dans des dépendances transitives d'outillage de build (chaîne ESLint, `@prisma/dev` embarqué par `prisma`), sans correctif amont et sans exposition en production — bloquer la CI dessus la rendrait rouge en permanence pour un risque non actionnable. Un second step `--audit-level=moderate` en `continue-on-error: true` garde ces entrées visibles dans les logs sans casser le pipeline.
- SAST bloquant dès le départ (`--error`) : le scan de référence ne remonte aucun finding sur les 394 fichiers suivis par git, donc pas de dette à absorber avant d'activer le blocage.

**Conséquences** : un push/une PR qui casse le lint, le typecheck, le build, qui introduit un secret commité, une vulnérabilité `critical`, ou un finding SAST fera échouer la CI. Les vulnérabilités moderate/high déjà connues restent visibles sans bloquer tant qu'aucun correctif amont n'existe — à repasser en bloquant dès qu'un correctif est disponible pour les entrées listées ci-dessus. `pnpm-workspace.yaml` (`allowBuilds`) limite déjà les scripts d'installation exécutables lors du `pnpm install` en CI, indépendamment de ce choix.

**Découverte annexe (hors périmètre de ce choix)** : en testant `prisma migrate deploy` sur une base neuve pour vérifier ce que le job `quality` devait réellement fournir, la migration `20260516000000_add_categories` échoue (`P3018`, table `Category` déjà créée par `20260514210509_init`) — un environnement vierge ne peut pas appliquer l'historique de migrations tel quel aujourd'hui. Sans rapport avec la CI elle-même (le build ne dépend pas de `migrate deploy`), mais à corriger dans `prisma/migrations` — hors périmètre de cette entrée.
