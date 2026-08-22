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

---

## D-017 — CD : staging et prod déployés automatiquement, sur le même hôte via runner self-hosted

> **Approche remplacée par D-018.** Cette entrée est conservée telle quelle pour l'historique (le repo a bien été public depuis le début — le risque n'a été correctement mesuré qu'après coup) ; c'est D-018 qui décrit le modèle réellement en place.

**Contexte** : le projet n'a qu'une CI (D-016), aucun déploiement automatisé. Le besoin est double : (1) un environnement de **staging** pour valider `develop` avant merge sur `main`, sans jamais exposer de données réelles (mineurs, finances) — exigence RGPD non négociable ; (2) déployer automatiquement `main` en **prod** une fois la CI verte, sans casser l'architecture « zéro port entrant » (Internet → Cloudflare → cloudflared → Traefik → app) qui interdit tout accès SSH entrant à l'hôte.

**Choix** :
- **Isolation staging/prod** : `docker-compose.staging.yml` est une stack Compose parallèle sur le même hôte que la prod, avec projet Compose distinct (`COMPOSE_PROJECT_NAME=piloti-staging`), volumes nommés explicitement (`piloti-staging-data`, `piloti-staging-uploads`, différents de `piloti-data`/`piloti-uploads`), réseaux et labels Traefik référençant le réseau du projet staging (`piloti-staging_internal`, jamais `piloti_internal`). Aucune ressource Docker n'est partagée avec `docker-compose.yml` (prod), qui n'est pas modifié.
- **Données factices en staging** : le volume est vierge à chaque déploiement (pas de restauration depuis la prod). Un service one-shot `seed` (basé sur l'image `migrate`, mêmes dépendances : `tsx`, Prisma) enchaîne `migrate → seed → app` via `depends_on: condition: service_completed_successfully`, et lance `pnpm db:seed` (données factices) — jamais un export de prod.
- **Accès restreint au staging** : Cloudflare Access (Zero Trust) restreint le sous-domaine staging à l'email du propriétaire, posé au niveau du dashboard Cloudflare (hors dépôt, documenté dans `docs/DEPLOYMENT.md`). Le tunnel Cloudflare du staging est **distinct** de celui de la prod (token séparé).
- **Déclenchement du déploiement** : `deploy-staging.yml` (`develop` → staging) et `deploy-prod.yml` (`main` → prod) utilisent tous deux `workflow_run` sur le workflow `CI`, filtré sur `types: [completed]` + `conclusion == 'success'` + la branche concernée — jamais de déploiement d'une branche dont la CI a échoué. Pour la prod, le vrai garde-fou reste la protection de branche sur `main` (relecture + merge humain) : le pipeline ne fait que rejouer un état déjà validé par un humain.
- **Runner self-hosted, pas de port SSH** : les deux workflows tournent sur un runner GitHub Actions self-hosted installé sur l'hôte (connexion sortante vers GitHub, symétrique à `cloudflared` vers Cloudflare) — cohérent avec l'interdiction de tout port entrant. Un seul runner physique porte les deux labels `piloti-staging` et `piloti-prod` (en plus de `self-hosted`) : ce n'est pas une isolation technique (même machine), mais ça rend explicite, à la lecture de chaque workflow, quel environnement est ciblé, et transforme une éventuelle erreur de copier-coller entre les deux fichiers en échec explicite (« aucun runner disponible ») plutôt qu'en déploiement silencieux au mauvais endroit.
- **Secrets** : le staging introduit ses propres secrets/variables GitHub (`STAGING_*`, jamais réutilisés depuis la prod) ; `deploy-prod.yml` n'en ajoute aucun — il relance `docker compose -f docker-compose.yml up -d`, qui continue de lire le `.env` de prod déjà en place sur l'hôte, exactement comme un lancement manuel aujourd'hui.

**Conséquences** : `develop` et `main` ont chacun un pipeline de déploiement continu symétrique, sans jamais partager de conteneur/réseau/volume/secret entre staging et prod. Les étapes hors dépôt (création du second tunnel Cloudflare, politique Access, installation du runner avec ses deux labels, secrets/variables GitHub) sont manuelles et documentées dans `docs/DEPLOYMENT.md` — ce choix ne peut pas être validé de bout en bout depuis le repo seul, seule la syntaxe (`docker compose config`, `actionlint`) l'a été. Le runner self-hosted a, par construction, un accès complet à l'hôte de prod (Docker socket, `.env` en clair) : sa compromission équivaut à un accès root à la prod, à protéger avec la même rigueur qu'un accès SSH root (cf. `docs/DEPLOYMENT.md`).

---

## D-018 — CD sans runner : déploiement pull-based côté hôte (remplace D-017)

**Contexte** : le dépôt est et reste **public**, et l'hôte visé par D-017 pour porter le runner self-hosted est le **PC personnel Windows** du propriétaire — celui qui héberge déjà la prod (Docker Desktop) **et** des données personnelles (gestionnaire de mots de passe, etc.), pas une machine dédiée. Un runner GitHub Actions self-hosted enregistré sur un dépôt public exécute, par défaut, les workflows déclenchés par **n'importe quelle PR**, y compris depuis un fork — GitHub le documente explicitement comme dangereux sur repo public : un contributeur malveillant peut ouvrir une PR dont le workflow exécute du code arbitraire sur le runner, donc sur ce PC personnel. D-017 mentionnait bien le risque (« traiter sa compromission avec la même rigueur qu'un accès SSH root ») mais sous-estimait sa probabilité réelle compte tenu de la visibilité publique du dépôt et de la nature mixte (perso + prod) de la machine : ce n'est pas un risque théorique à isoler, c'est une machine à ne jamais exposer à du code non fusionné.

**Choix** : remplacer les deux workflows `deploy-staging.yml` / `deploy-prod.yml` (déclenchés par GitHub Actions, donc capables in fine de tourner sur du code de fork) par un modèle **pull-based** : c'est l'hôte qui va chercher le code, jamais GitHub qui pousse de l'exécution vers l'hôte.
- **`scripts/deploy.ps1 -Environment staging|prod`** : dans un répertoire de déploiement **dédié par environnement** (jamais le répertoire de dev du propriétaire — configurable via `$env:PILOTI_DEPLOY_ROOT`), fait `git fetch` puis `git reset --hard origin/develop` (staging) ou `origin/main` (prod), puis `docker compose build` + `up -d` avec le fichier compose et le `COMPOSE_PROJECT_NAME` de l'environnement (`piloti-staging` / `piloti`), puis `docker image prune -f`. Aucun secret dans le script : les valeurs viennent de `.env.staging` / `.env.production`, fichiers locaux à l'hôte, jamais commités.
- **Pourquoi c'est sûr sur un repo public** : le script ne déploie jamais autre chose que ce qui a été **fusionné** sur `develop` ou `main`. Sur un repo public, seul le propriétaire a les droits de push sur ces deux branches — une PR d'un fork ne peut ni les modifier ni déclencher quoi que ce soit côté hôte tant qu'elle n'a pas été relue et fusionnée par un humain. Le seul point d'exécution reste `git fetch` + `git reset --hard` déclenché *localement*, jamais par un event GitHub externe.
- **Deux modes d'usage**, tous deux documentés dans `docs/DEPLOYMENT.md` : manuel (`scripts/deploy.ps1 -Environment staging` lancé à la main après un merge) et automatique (tâche planifiée Windows qui relance le script à intervalle régulier — le script étant idempotent, un poll sans changement de branche ne fait rien d'observable).
- **Secrets/variables GitHub `STAGING_*`** créés pour l'ancien modèle (D-017) : **abandonnés**, ils ne sont plus lus par rien. Les mêmes valeurs vivent désormais dans `.env.staging` en local sur l'hôte (le contenu de `docker-compose.staging.yml`, conservé tel quel, référence toujours des variables `STAGING_*` — mais désormais lues depuis ce fichier local via `--env-file`, plus depuis GitHub Actions).
- Le runner self-hosted et son installation (D-017 §3) ne sont plus nécessaires et ne doivent **pas** être mis en place.

**Conséquences** : plus aucun code déclenché par GitHub Actions ne s'exécute sur le PC personnel du propriétaire — l'exposition d'un repo public devient sans incidence sur cette machine. La contrepartie est la perte du déclenchement instantané post-merge : en mode automatique, le délai de déploiement dépend de l'intervalle de la tâche planifiée (poll), pas d'un webhook. `docker-compose.staging.yml` n'a pas été modifié par ce changement (repris tel quel depuis PR #7) : il reste valide, seul son mode de déclenchement change. Si l'hôte de prod change un jour pour une machine dédiée (plus de données perso dessus), un retour à un modèle runner self-hosted redeviendrait raisonnable — décision à reprendre explicitement le cas échéant, pas à réintroduire tacitement.

---

## D-019 — Correctif P3018 : suppression des migrations redondantes avec le squash `init` (complète D-015/D-016)

**Contexte** : la « découverte annexe » de D-016 est confirmée et creusée. `prisma migrate deploy` sur une base **vierge** échoue en P3018 dès `20260516000000_add_categories` (« table `Category` already exists ») car `20260514210509_init` a été **régénérée depuis le schéma courant** (D-015) : elle contient déjà, dans leur forme finale, toutes les tables/colonnes/index que les migrations suivantes recréent ou modifient. Le rejeu confirme que le problème dépasse largement `Category` : `20260601093203_add_category_behaviors` échoue aussi (« duplicate column name: `returnWeightKg` » sur `Loan`), et par construction chacune des **49 migrations** entre `20260516000000_add_categories` et `20260614170800_rename_unit_channels` (inclus) est intégralement redondante avec `init` — leur effet cumulé y est déjà baked-in. Seule `20260716120000_add_consent_and_birthdate`, postérieure au squash, apporte un delta réel (`birthDate` sur `User`, table `Consent`).
Inspection en lecture seule de `_prisma_migrations` en prod (volume `piloti_piloti-data`) : les 50 migrations jusqu'à `20260614170800_rename_unit_channels` sont marquées `finished_at` non nul, appliquées par **baseline** (`prisma migrate resolve --applied`, D-015) en deux salves de timestamps quasi-identiques (~16 ms d'écart), donc jamais réellement exécutées sur cette base — seul leur checksum est enregistré. `20260716120000_add_consent_and_birthdate` n'est **pas encore appliquée** en prod (dernier `migrate` du service a tourné avant son introduction). Vérification : le checksum enregistré en prod pour `20260516000000_add_categories` (`8af48330…`) correspond exactement au SHA-256 du **blob git** du fichier (fin de ligne LF) — pas du fichier tel que checké out localement sur Windows (`core.autocrlf=true` le convertit en CRLF, ce qui change le hash local sans changer le blob commité). Toute édition du contenu de ce fichier, quelle qu'elle soit, change donc son checksum côté prod et ferait échouer le prochain `migrate deploy` du service `migrate` au boot (P3006 « migration modified after it was applied »), qui bloquerait le démarrage de l'app.

**Choix** : ne **jamais éditer** le contenu des 49 migrations déjà appliquées (donc déjà checksummées en prod) — **les supprimer purement et simplement** du dépôt (`prisma/migrations/20260516000000_add_categories` → `prisma/migrations/20260614170800_rename_unit_channels`), en conservant `20260514210509_init` et `20260716120000_add_consent_and_birthdate` inchangées. C'est le mécanisme de squash « à la main » documenté par Prisma : `prisma migrate deploy` ne valide le checksum que des migrations **encore présentes sur disque** ; une ligne de `_prisma_migrations` dont le dossier a disparu n'est ni revalidée ni signalée en erreur. Vérifié empiriquement (pas supposé) :
- Rejeu complet sur base SQLite vierge (`prisma migrate deploy`) : succès, seules `init` puis `add_consent_and_birthdate` s'appliquent ; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` confirme zéro divergence avec le schéma courant.
- Réplique de l'état prod exact (mêmes 50 lignes `_prisma_migrations`, mêmes checksums, extraites en lecture seule du volume prod, tables reconstruites via `db push` sur le schéma juste avant `add_consent_and_birthdate`) : `prisma migrate deploy` avec les 49 dossiers absents applique seulement la migration manquante, **sans aucune erreur de checksum**.

**Conséquences** : le rejeu depuis zéro (nouvel environnement, CI, restauration) fonctionne sans intervention manuelle. **Aucune action requise sur la prod actuelle** — le prochain boot du service `migrate` appliquera normalement `20260716120000_add_consent_and_birthdate` (déjà en attente avant ce correctif) puis se retrouvera à jour ; les 49 lignes historiques de `_prisma_migrations` restent inertes et ne sont jamais revalidées. `prisma/migrations/CLAUDE.md` reste valide tel quel (« ne jamais éditer une migration déjà commitée » — ce correctif la respecte : il supprime, il n'édite pas). Toute nouvelle divergence future entre `init` et un point de squash ultérieur devra suivre le même principe : squash = régénération d'`init` + suppression des migrations absorbées, jamais édition d'une migration déjà appliquée quelque part.

---

## D-021 — Correctif régression post-D-019 : les données par défaut supprimées avec les 49 migrations n'étaient pas dans `init`

**Contexte** : D-019 a supprimé 49 migrations en constatant qu'elles étaient **redondantes côté schéma** avec `20260514210509_init` (régénérée depuis le schéma courant, D-015). Mais plusieurs de ces migrations portaient aussi des **données par défaut** (`INSERT OR IGNORE`) — catégories d'inventaire (US-31), salons/catégories de salons de communication (US-C09) et leur matrice d'accès par rôle (US-32) — qu'`init`, migration de schéma pure, ne recrée pas. Conséquence vérifiée sur un environnement staging neuf : `Channel`=0, `Category`=0 — aucun salon, aucune catégorie de matériel, et l'application n'offre aucune action pour en créer depuis l'interface. Toute nouvelle base (staging, CI, futur déploiement) était donc inutilisable en pratique, bien que D-019 ait résolu le blocage `migrate deploy` (P3018) qu'elle visait.

**Choix** : nouvelle migration `20260723212606_restore_default_data`, ne contenant que des `INSERT OR IGNORE` (aucun changement de schéma, vérifié par `prisma migrate diff --from-migrations --to-schema --exit-code` = 0). Son contenu n'est pas la simple concaténation des `INSERT` d'origine (qui auraient ensuite été reconfigurés puis renommés par les migrations suivantes, elles aussi supprimées) mais l'**état final cumulé** que produisait tout cet historique — reconstitué en lisant le SQL des migrations supprimées dans l'historique git (`05c149c~1`) *et* confirmé en inspectant la prod en lecture seule (`sqlite3 -readonly` sur le volume `piloti_piloti-data`) : les salons n'étant créés que par migration, la prod contient exactement le set par défaut, ce qui a servi de source de vérité pour les salons/catégories de salons (accès par rôle, slugs renommés vers les branches SGDF, salons doublons archivés lors de la fusion couleur→branche). Pour les catégories d'inventaire, seul le set de `20260601090000_ensure_default_categories` (TENTE/MALLE/CUISINE/BIVOUAC/JEU/AUTRE) a été repris — la prod en a depuis deux de plus, ajoutées manuellement via l'admin, qui ne sont pas des valeurs par défaut et ne doivent pas être dupliquées ailleurs.

**Conséquences** : une base vierge (`prisma migrate deploy`) obtient désormais 6 catégories, 2 catégories de salons et 10 salons (dont 2 archivés, doublons historiques de la fusion couleur→branche) — identique à l'état réel de la prod. Aucun impact sur la prod : `INSERT OR IGNORE` sur des lignes déjà présentes (vérifié en rejouant le SQL deux fois de suite sur une même base, sans doublon ni erreur). Reste un résidu assumé : les deux salons archivés (`verts`, `rouges`), doublons vides créés par la fusion couleur→branche (D-019 historique), sont recréés tels quels sur une base neuve plutôt qu'omis — cohérent avec le principe « reproduire l'état final réel », mais sans utilité fonctionnelle nouvelle (ils restent archivés, invisibles des listes actives).
## D-020 — SAFE-02 : `Report` polymorphe (`targetType`/`targetId`) + masquage plutôt que suppression

**Contexte** : `Message` (salon) et `DirectMessage` (privé) n'ont aucun parent commun dans le schéma — deux tables distinctes, deux flux de lecture (`queries.ts` / `dm-queries.ts`) sans hiérarchie partagée. Le signalement de contenu doit pourtant fonctionner identiquement sur les deux. Ajouter deux modèles de signalement dupliqués (un par type de message) aurait doublé la logique de permission/notification pour un gain nul.

**Choix** : un modèle `Report` unique, polymorphe par convention (`targetType` ∈ `CHANNEL_MESSAGE | DIRECT_MESSAGE` + `targetId`, sans FK Prisma vers la cible — les deux requêtes de résolution du contenu visé se font manuellement dans `moderation-queries.ts`). La modération **masque** (`hiddenAt`/`hiddenById` sur `Message` et `DirectMessage`) plutôt que de supprimer : le contenu disparaît des lectures normales (filtré `hiddenAt: null` dans `queries.ts`/`dm-queries.ts`/`actions.ts`) mais reste consultable dans la file de modération, cohérent avec l'invariant « pas de mutation sans trace » (`withAudit`) et avec le choix déjà fait pour la suppression de compte (RGPD-04 : anonymisation, pas de `DELETE`).

**Conséquences** : toute nouvelle catégorie de contenu signalable (ex. futur commentaire, sondage) s'ajoute à `REPORT_TARGET_TYPES` (`src/lib/enums.ts`) et à la résolution polymorphe de `moderation-queries.ts`, sans nouveau modèle. Le masquage n'est pas réversible dans cette version (pas d'action « démasquer ») — un arbitrage laissé à l'humain si le besoin apparaît. `moderation.view` (CHEF + RESPONSABLE_GROUPE, lecture) et `moderation.review` (CHEF, traitement) suivent le même principe « lecture RG / mutation CHEF » que le reste de la matrice (US-32).

---

## D-022 — Quotient familial masqué côté UI (code et schéma conservés)

**Contexte** : le groupe ne souhaite pas, pour l'instant, exposer ni collecter le quotient familial (donnée de revenu, sensible) via Piloti. La fonctionnalité existante — tranches (`SocialBracket`, coefficient en pour-mille), `User.socialBracketId`, pondération dans `computeTiers`/`tiers.ts`, `brackets.ts`, `budget.ts` — reste correcte et potentiellement utile si la décision est revue plus tard ; le sujet est une question d'usage/exposition, pas de qualité du code.

**Choix** : masquage **présentation uniquement**, rien touché côté schéma Prisma, migrations, Server Actions (`bracket-actions.ts`) ni logique de calcul (`tiers.ts`, `brackets.ts`, `budget.ts`, `campaigns.ts`, `campaign-scheduler.ts`) :
- Entrée de nav « Tranches QF » retirée de `nav-items.ts`.
- `/finances/tranches` (page) redirige désormais inconditionnellement vers `/finances/cotisations` ; `BracketsAdmin.tsx` reste en place mais n'est plus importé nulle part (dead code assumé).
- Fiche membre (`membres/[id]/page.tsx`) : le sélecteur de tranche (`BracketSelect.tsx`, conservé mais plus importé) et sa récupération (`listBrackets`) retirés du rendu.
- Budget d'événement : le lien/texte explicatif vers `/finances/tranches` retiré de `BudgetManager.tsx` ; le badge de tranche par inscrit retiré de `EventPaymentRow.tsx` (la prop `bracketName` reste dans l'interface, simplement non rendue).
- Non touché dans cette première passe : les tarifs différenciés « 2e enfant » / « cas social » des campagnes de cotisation (`CampaignForm.tsx`, `RecordPaymentRow.tsx`) — mécanisme distinct (taille de fratrie / décision ponctuelle du trésorier), qui ne collecte ni n'affiche de donnée de revenu ; cf. amendement ci-dessous, la décision a ensuite été étendue à ces tarifs.

**Conséquences** : toute tranche déjà assignée en base continue d'être appliquée silencieusement par `computeTiers`/`budget.ts` (aucune régression de calcul), mais plus personne ne peut en créer, modifier ou assigner une nouvelle depuis l'UI. Si la décision est un jour inversée, il suffit de réintroduire les imports/rendus retirés (rien à reconstruire côté schéma ou logique).

**Amendement — tarifs différenciés « 2e enfant » / « cas social » également masqués** : le responsable a étendu la décision aux tarifs différenciés des campagnes de cotisation, considérés eux aussi comme des données sensibles à ne pas exposer côté UI pour l'instant, même s'ils ne portent pas sur le revenu. Masquage présentation uniquement, même principe que ci-dessus, rien touché côté schéma, Server Actions (`campaign-actions.ts` : `createCampaign`, `toggleSocialCase`) ni calcul (`tiers.ts`, `campaigns.ts`, `campaign-scheduler.ts`) :
- `CampaignForm.tsx` : champs de saisie « Tarif 2e enfant (€) » / « Tarif cas social (€) » et le texte explicatif associé retirés ; `createCampaign` tolère déjà leur absence dans le `FormData` (`secondChild`/`social` optionnels, retombent sur `null`), aucune modification côté action.
- `RecordPaymentRow.tsx` : badges « 2e enfant » / « Cas social » et bouton « Marquer/Retirer cas social » (`toggleSocialCase`) retirés du rendu ; la prop `tier` reste dans l'interface (`PaymentRowVM`), simplement non rendue, même logique que `bracketName` plus haut.
- `cotisations/[id]/page.tsx` : ligne récapitulative des tarifs (`secondChildCents`/`socialCents`) retirée.
- `/finances/tranches` passe de la redirection à un vrai **404** (`notFound()`) — décision du responsable, la page ne doit plus laisser deviner qu'une fonctionnalité de tarification différenciée par revenu existe encore.

**Conséquences (amendement)** : tout tarif 2e enfant / cas social déjà configuré en base continue d'être appliqué silencieusement par `computeTiers` (aucune régression de calcul), mais plus personne ne peut en saisir, modifier ou (dé)marquer un cas social depuis l'UI. `toggleSocialCase` reste exporté par `campaign-actions.ts` (dead code assumé côté UI, cf. `bracket-actions.ts`) au cas où la décision serait inversée. `/finances/tranches` en URL directe renvoie désormais 404 au lieu de rediriger.

---

## D-023 — SAFE-01 : le verrou de profil incomplet vit dans le proxy, et la date de naissance n'est plus réécrivable

**Contexte** : la date de naissance est le pivot de la protection des mineurs — `dm-policy.ts` en dérive l'autorisation d'échanger en messagerie privée. Trois failles subsistaient après la première passe SAFE-01, toutes reproduites en local sur une base seedée :

1. **Le verrou de profil incomplet ne bloquait pas.** Il vivait dans le layout de `(app)` uniquement. En **navigation client** entre deux routes partageant ce layout, Next ne le réexécute pas (rendu partiel) : son `redirect()` ne part jamais. Mesuré — un compte sans date de naissance obtenait `/stock` en **200** via une requête RSC, là où le chargement direct renvoyait bien `307`.
2. **`completeBirthDate` était un écrasement inconditionnel.** Nommée « complétion », elle ne vérifiait pas que le champ était vide : n'importe quel compte pouvait rejouer le formulaire pour se redéclarer majeur. L'écran `/completer-profil` restait par ailleurs atteignable une fois la date posée, affichant « Votre date de naissance n'a pas été renseignée » (faux) avec son formulaire de réécriture.
3. **`birthDateSchema` n'exigeait que « après 1900 » et « pas dans le futur ».** Le sens dangereux est le haut : `1900-01-01` suffisait à un jeune pour se déclarer centenaire — donc majeur — et débloquer la messagerie privée dès l'inscription. Une saisie à quelques mois passait tout aussi bien.

**Choix** :
- Le verrou passe dans **`src/proxy.ts`**, qui voit chaque requête, fetchs RSC compris. Il lit `birthDate` depuis la session better-auth (aucun `cookieCache` configuré, donc valeur fraîche, sans requête DB supplémentaire).
- **L'écran `/completer-profil` est supprimé, pas réparé.** En le corrigeant, on s'est aperçu qu'il n'avait plus de population : les **quatre** chemins de création d'un `User` imposent tous la date de naissance (`register`, `setup`, `createChildAccount`, `seed`). Un compte ACTIVE sans date ne pouvait venir que d'une base antérieure à la migration `20260716120000_add_consent_and_birthdate` — or rien n'est encore en production. C'était donc une rampe de migration sans migrant : le seul chemin *self-service* d'écriture sur le champ le plus sensible de l'app, maintenu pour personne. Deux des trois failles ci-dessus vivaient dedans. Supprimer l'écran supprime la surface, et rejoint la règle d'âge du 2026-08-08 : la date d'un mineur est **attestée par un tiers**, jamais déclarée par l'intéressé.
- En conséquence, `birthDate` manquant devient une **anomalie de données**, traitée comme un compte non-ACTIVE : le proxy refuse la session et balaie le cookie ; `signInAction` renvoie un message explicite (« contacte un responsable ») plutôt qu'une boucle de connexion silencieuse. Le layout de `(app)` et le transport `x-pathname` qui n'existaient que pour cet écran disparaissent avec lui.
- Nouveau chemin de correction : **`setUserBirthDate`** (`modules/admin/actions.ts`), calqué sur `setUserUnit` — `ensureCan("user.manage")` + `assertCanManageTarget` (une secrétaire ne corrige pas un ADMIN/RG) + `withAudit` sous l'action `USER_BIRTHDATE_CHANGED`, dont les métadonnées conservent l'ancienne **et** la nouvelle valeur, sans quoi la trace ne dirait pas ce qui a changé. Monté dans `/admin/utilisateurs/[id]/modifier`, à côté de `UnitEditor`.
- Bornes de plausibilité `MIN_PLAUSIBLE_AGE = 5` (marge sous les Farfadets, 6 ans) et `MAX_PLAUSIBLE_AGE = 110`, appliquées partout puisque tous les chemins d'écriture partagent `birthDateSchema`. Les deux contrôles deviennent des `refine`, évalués à la validation : le `.max(new Date())` précédent figeait « maintenant » au chargement du module et dérivait sur un serveur au long cours.
- `prisma/seed.ts` renseigne désormais une date pour les quatre comptes de démo. Ce n'est pas cosmétique : sans elle, le verrou désormais étanche refuse **tous** les comptes seedés, et l'app devient inutilisable en développement.

**Conséquences** : la date de naissance est posée à la création du compte et n'est modifiable que par un administrateur, avec trace nominative. Il n'existe plus aucun chemin self-service, ni pour l'écrire ni pour la corriger. En contrepartie, une faute de frappe à l'inscription **exige l'intervention d'un administrateur** — c'est le prix assumé de la protection des mineurs, et la raison pour laquelle l'éditeur admin est livré dans le même lot plutôt que renvoyé à plus tard. Deuxième contrepartie, assumée elle aussi : un compte dont la date disparaîtrait (anomalie, script, restauration partielle) est **verrouillé dehors** au lieu d'être invité à se dépanner lui-même ; c'est le comportement voulu sur un champ qui gouverne la protection des mineurs. Vérifié en local : `RSC=200` sans le verrou proxy contre `RSC=307` avec, et une session forgée directement via l'API better-auth pour un compte sans date est refusée sur toutes les pages, cookie balayé.

**Note de portée** : la règle d'âge sous-jacente (attestation parentale *sous 15 ans*, comptes de moins de 15 ans connectables) a été remise en cause le 2026-08-08 — aucun compte connectable sous 15 ans, attestation parentale pour *tout* mineur. Le présent correctif reste valable tel quel, mais ses seuils (`PARENTAL_CONSENT_AGE`, l'auto-attestation du formulaire d'inscription) sont appelés à changer. `MIN_PLAUSIBLE_AGE = 5` reste correct : les fiches de membres existent dès 6 ans, seule la *connexion* est fermée sous 15 ans.

---

## D-024 — Périmètre d'unité : un CHEF est chef de SA branche, pas du groupe

**Contexte** : `can()` n'évaluait que les **rôles**. La branche (`User.unit`) n'y intervenait qu'une fois, pour un cas anecdotique (un JEUNE Pios/Compas peut créer un prêt). Conséquence : un `CHEF` était de facto chef du groupe entier — il pouvait valider une étape, attribuer un badge, lire et écrire les **notes de suivi sensibles** (US-S07) d'un jeune d'une autre branche, et pointer les présences d'une unité qui n'est pas la sienne. Le tableau de bord des présences était pire : l'unité venait de `?unit=` sans aucun contrôle, et le repli `UNITS[0]` ouvrait la première branche à n'importe quel chef. Seule la modération (SAFE-02, `canModerateReport`) bornait réellement par unité, mais la règle était restée locale à son module.

**Choix** :
- **Une primitive, pas une colonne de matrice** : `inUnitScope(user, targetUnit)` dans `src/lib/permissions.ts`, appelée **en plus** de `can()`. Le rôle donne le droit, l'unité en donne l'étendue. ADMIN (superutilisateur) et RESPONSABLE_GROUPE (vue groupe) ne sont pas bornés. `canModerateReport` en devient un cas d'usage (`canModerate(user) && inUnitScope(...)`), corps identique, ses 20 tests inchangés.
- **Fail-closed des deux côtés** : un CHEF sans `unit` n'encadre aucune branche, et une ressource sans unité n'appartient à personne. Le cas inverse — une ressource « de groupe », ex. un événement `unit === null` ouvert à tout l'encadrement — se traite **au site d'appel** (`unit === null || inUnitScope(...)`) : la primitive ne devine pas la sémantique du `null`, qui diffère selon la table.
- **Périmètre volontairement restreint à l'écriture pédagogique et au pointage** (arbitrage du responsable). La **lecture** reste ouverte à tout l'encadrement — `pedago.view`, annuaire, calendrier — parce qu'un groupe scout fonctionne en entraide : préparer un camp inter-branches ou remplacer un chef absent ne doit pas demander un admin. Le planning (`event.manage`) n'est **pas** borné pour la même raison ; c'est un choix, pas un oubli.
- `scopedUnits(user, catalog)` (pendant de `assignableRoles`) dérive la liste des branches accessibles pour filtrer une requête ou un sélecteur, afin qu'aucune page n'ait à tester un rôle en dur — liste complète = non borné, liste vide = aucun périmètre.
- **Sur une action multi-jeunes (`awardBadge`), refus en bloc** dès qu'un jeune sort du périmètre, jamais de filtrage silencieux : sinon l'`AuditLog` dirait « badge attribué » sur un sous-ensemble sans que le chef sache qui a été écarté.
- **`User.unit` reste un champ unique** (arbitrage du responsable) : pas de `unitsJson` multi-branches. Un chef couvrant deux branches se traite par un rôle non borné, pas par le modèle.

**Conséquences** : un chef ne peut plus écrire dans le suivi pédagogique d'un jeune hors de sa branche, ni pointer/consulter le bilan de présences d'une autre unité. Contrepartie directe du choix « `unit` unique » : **tout compte CHEF dont `unit` est `null` ou `ADULTES` perd l'écriture pédagogique**, sans recours autre qu'un administrateur qui renseigne sa branche — à vérifier en base **avant** tout déploiement. Le périmètre s'arrête là où l'arbitrage l'a posé : un chef peut toujours modifier et **supprimer** un événement d'une autre branche (`event.manage` non borné) ; si l'usage montre que c'est de trop, l'extension consiste à ajouter le même couple `can()` + `inUnitScope()` dans `planning/actions.ts`, sans rien changer à la primitive.

**Amendement — le périmètre est étendu aux événements et à leur budget.** Mis en service, l'arbitrage initial (« pédagogie + pointage seulement ») s'est révélé intenable : un chef pouvait toujours modifier, **supprimer** et budgéter les événements des autres branches, ce qui est plus lourd de conséquences que d'écrire une note. Le périmètre couvre désormais toute action portant sur un événement — `createEvent` (branche cible), `updateEvent` (branche actuelle **et** branche cible, sans quoi il suffisait de changer le champ pour transférer l'événement), `deleteEvent`, `setAttendance`, et les cinq actions de `budget-actions.ts` y compris `addEventTicket`.

Ce déplacement a imposé un raffinement de la primitive. `inUnitScope` n'exemptait qu'ADMIN et RG, ce qui suffisait tant que les actions bornées n'appartenaient qu'au CHEF. Or `budget.manage` est partagé avec le **TRÉSORIER**, et `expense.create` avec le responsable matériel, la secrétaire, le RG : les borner aurait cassé la trésorerie, ces rôles n'ayant pas de `unit`. D'où **`canActOnUnit(user, action, targetUnit)`** : on ne borne que si le droit ne vient QUE de rôles rattachés à une branche (`UNIT_BOUND_ROLES = {CHEF}`). Un compte CHEF **et** TRÉSORIER gère donc tous les budgets, tout en restant borné sur `event.manage`, réservé aux chefs. La sémantique « `unit === null` = événement de groupe, ouvert à tous » est nommée une fois dans `modules/planning/event-scope.ts` (`canActOnEvent`, `refuseIfEventOutOfScope`), partagé par le planning et la finance, plutôt que recopiée à chaque garde.

**Ce qui reste délibérément non borné** : toutes les **lectures** (fiche d'événement, liste des réponses, consultation d'un budget, progression d'un jeune) — un groupe scout fonctionne en entraide, et masquer l'information gênerait sans rien protéger. Les **tâches** (`task.manage`) ne le sont pas non plus, faute de branche dans le modèle `Task` : elles sont group-wide par construction. Le suivi pédagogique conserve son garde dédié (`requirePedagoScope`), équivalent ici puisque `pedago.manage` n'appartient qu'au CHEF.

**Conséquences (amendement)** : le formulaire d'événement ne propose plus que les branches du chef, plus « Tout le groupe » ; les boutons Modifier / Supprimer / Pointer disparaissent hors périmètre, la fiche restant lisible. Le risque de régression s'est déplacé sur les rôles transverses : si un jour un rôle rattaché à une branche autre que CHEF apparaît, c'est `UNIT_BOUND_ROLES` qu'il faut mettre à jour — et rien d'autre.

**Amendement — fermeture des chemins de contournement (audit de sécurité).** L'audit du diff a montré que le périmètre était correct là où il était posé, mais contournable par des actions sœurs écrivant sur la même ressource :
- `createExpense` (`finance/actions.ts`) acceptait un `eventId` arbitraire du `FormData` sans contrôle : une note de frais en `PENDING` compte immédiatement dans le budget réel de l'événement (`getEventBudget` agrège tout ce qui n'est pas `REJECTED`), ce qui vidait de sa substance le garde posé sur `addEventTicket`. Le rattachement hors périmètre est désormais **refusé**, et non silencieusement ramené à `null` : retomber sur `null` ferait croire au déclarant que sa dépense est imputée au camp.
- `linkEventToPlace` (`camp/place-actions.ts`) met à jour `Event.campPlaceId` avec le seul `can("event.manage")` — second chemin de modification d'un événement d'une autre branche, borné comme `updateEvent`.
- Le **référentiel d'étapes** (`pedagogy/referential-actions.ts` : `createStep`, `updateStep`, `moveStep`, `archiveStep`) n'était pas borné alors que `ProgressionStep.unit` porte la branche. L'archivage était le plus dommageable : `listSteps` filtre sur `archived: false`, l'étape disparaît de la progression des jeunes concernés et laisse les `StepValidation` déjà posées orphelines. Les **badges** restent volontairement transverses (`Badge.unitsJson`, `[]` = toutes branches).

Non borné après examen : le rattachement d'un **prêt** à un événement (`loan-actions.ts`) et le champ `eventId` d'un **avis de lieu** (`place-actions.ts`) — aucun des deux ne modifie l'événement, le matériel est une ressource de groupe, et `loan.create` appartient aussi au responsable matériel, rôle transverse.

`prisma/seed-branches.ts` refuse désormais de s'exécuter si `NODE_ENV === "production"` : contrairement à `seed.ts` dont le `deleteMany` initial le cantonne de lui-même au développement, il est additif et se serait exécuté sans signal sur une base de production, y créant des comptes ACTIVE dont les mots de passe sont en clair dans un dépôt public.

---

## D-025 — On ne s'inscrit qu'aux événements qui nous concernent

**Contexte** : `rsvpEvent` (US-P04) ne regardait **jamais** `Event.unit`. Ses seuls contrôles étaient : réponse valide, cible = soi ou un enfant rattaché, événement existant, inscriptions ouvertes, date limite non dépassée. N'importe quel compte actif pouvait donc s'inscrire à n'importe quel événement ouvert — un Louveteau de 8 ans au week-end Pionniers. Ce n'était pas une régression : le comportement existait depuis l'origine de l'US.

L'incohérence est devenue visible avec US-P05, qui ajoute le chemin encadré `addRegistration` : celui-ci vérifie `(!event.unit || target.unit === event.unit)`. Un chef ne pouvait donc pas inscrire un jeune hors branche, alors que ce même jeune le pouvait tout seul — **le libre-service était plus permissif que le chemin encadré**.

**Choix** :
- Une règle **pure et sans dépendance**, `isConcernedByEvent(eventUnit, targetUnit)` dans `modules/planning/audience.ts`, partagée par la Server Action (qui refuse) et par la fiche événement (qui n'affiche pas le contrôle). L'écran ne propose jamais une inscription que le serveur rejettera. Testée : c'est de la logique pure, donc dans le périmètre Vitest du projet, contrairement à la règle `WITHDRAWN` qui reste enfouie dans `rsvpEvent`.
- C'est la branche de la **personne inscrite** qui compte, pas celle de qui remplit le formulaire : un parent n'a pas de branche, c'est son **enfant** qui doit être concerné. `enfantsConcernes` filtre donc la liste « Inscrire mes enfants ».
- **Une exception, pour l'encadrant et pour lui seul** : un chef peut s'inscrire à l'événement d'une autre branche. Un chef vient volontiers prêter main-forte sur la sortie d'une autre unité, et il ne pollue pas la feuille de pointage, qui ne liste que les jeunes de l'unité. L'exemption ne vaut **pas** pour un enfant : personne, chef compris, n'inscrit un jeune hors de sa branche.
- Un événement de groupe (`unit === null`) concerne tout le monde, comme partout ailleurs (cf. D-024).

**Conséquences** : un jeune et son parent ne voient plus qu'un message de lecture seule sur les événements des autres branches. Les inscriptions hors branche **déjà en base** ne sont pas nettoyées par ce correctif — il empêche les nouvelles, pas les anciennes. Limite de vérification assumée : le masquage des contrôles a été exercé dans l'application avec trois comptes réels (jeune, parent, chef), mais le refus **serveur** face à un appel forgé n'a pas été reproduit — une Server Action se déclenche par un POST signé difficile à forger hors navigateur. Ce qui est démontré, c'est la fonction pure et son branchement relu.

---

## D-026 — US-CM-04 : plus aucune auto-inscription sous 15 ans

**Contexte** : le formulaire d'inscription demandait une attestation de responsable légal en dessous de 15 ans — mais **c'est l'enfant lui-même qui cochait la case**. Un jeune de 10 ans obtenait donc un compte connectable en s'auto-attestant, et tout le mécanisme de consentement RGPD-02 se contournait d'un clic. Contrairement à l'intuition, aucune règle automatique ne l'en empêchait : `canLogin` a pour défaut `true`, et le seul endroit du code qui le passe à `false` est `createChildAccount`, l'écran admin « Nouveau jeune » (US-CM-01). Un compte né de l'inscription publique était connectable quel que soit l'âge.

**Choix** :
- `MIN_LOGIN_AGE = 15` et `canSelfRegister()` dans `src/lib/legal/age.ts`, source unique déjà partagée par la Server Action et le formulaire. Fail-closed sur date inconnue : la règle ne se contourne pas en vidant le champ.
- Le refus est **sec** et vient **avant** le contrôle de consentement parental, qui est court-circuité. Afficher en plus « il manque l'autorisation parentale » laisserait croire qu'une case cochée débloquerait l'inscription, alors qu'aucune case ne le peut. Le message oriente vers la seule voie possible : « demande à un parent ou à un chef de créer ta fiche ».
- `PARENTAL_CONSENT_AGE` passe de **15 à 18 ans** (amendement RGPD-02 du 2026-08-08) : tout mineur inscrit requiert désormais l'autorisation d'un responsable légal, là où les 15-17 ans n'avaient plus rien à fournir. Numériquement égal à `MAJORITY_AGE`, mais conceptuellement distinct — l'un est une règle de consentement, l'autre la minorité légale — d'où deux constantes maintenues.
- Côté formulaire, le refus s'affiche **dès la saisie de la date** et désactive le bouton, plutôt que de laisser remplir dix champs pour un rejet final.

**Portée volontairement réduite** : la fiche US-CM-04 exige aussi que les 15-17 ans passent par une **invitation** plutôt que par l'auto-inscription. Ce critère dépend d'US-CM-05 (mécanisme d'invitation), qui n'existe pas : l'appliquer maintenant enfermerait dehors tous les 15-17 ans sans fiche. Ce lot livre donc le sous-ensemble déployable — refus sous 15 ans, consentement étendu à 18 — qui ferme la non-conformité **sans bloquer personne**. La fermeture de l'auto-inscription des 15-17 ans viendra avec US-CM-05. Rappel de la fiche : ce lot doit être déployé **avant** US-CM-06, sinon un compte révoqué pourrait se recréer entre les deux déploiements.

**Vérification** : pour la première fois de cette série, le refus **serveur** a été exercé sur un **appel forgé**, en reconstituant l'encodage natif d'une Server Action Next (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`, extraits du HTML rendu). Un POST direct, interface entièrement contournée, pour un enfant de 10 ans avec **toutes les cases parentales cochées**, reçoit le refus d'âge et ne crée aucun compte (vérifié en base). Un jeune de 16 ans sans autorisation reçoit le refus de consentement — et non le refus d'âge. Ce mode de vérification lève la limite signalée en D-024 et D-025, où seul le masquage des contrôles avait pu être démontré.

---

## D-027 — OSS-01 : licence AGPL-3.0-or-later, copyright personnel

**Contexte** : le dépôt n'avait aucun fichier `LICENSE`. En droit d'auteur, l'absence de licence ne signifie pas « libre » mais **« tous droits réservés »** : aucun autre groupe ne pouvait légalement déployer ni forker Piloti, y compris avec un dépôt public. Bloquant pour l'objectif OSS. La question n'était donc pas *s'il fallait* une licence, mais laquelle — et le choix dépend d'une caractéristique du produit : Piloti est une **application web que des tiers vont héberger**, pas une bibliothèque qu'ils vont importer.

**Choix** : **AGPL-3.0-or-later**, texte verbatim de la FSF dans `LICENSE`, copyright au nom de Mathis Capart.
- **Pourquoi pas MIT** : un prestataire pourrait héberger Piloti en SaaS pour des groupes scouts, garder ses améliorations fermées, et laisser le projet d'origine à maintenir seul. MIT l'autorise explicitement.
- **Pourquoi pas GPL-3.0** : la GPL déclenche ses obligations à la **distribution du binaire**. Héberger un service ne distribue rien — c'est le « SaaS loophole », et il rend la GPL inopérante pour une application web. L'article 13 de l'AGPL le ferme en déclenchant l'obligation dès que des utilisateurs **interagissent avec le logiciel à distance**.
- **Pourquoi pas EUPL-1.2** : candidat sérieux (copyleft réseau, version française juridiquement valide, recommandée par la DINUM), mais mal connue des contributeurs et de l'outillage, pour un bénéfice — la compatibilité institutionnelle — qui n'existera que si la SGDF nationale s'intéresse un jour au projet. L'EUPL étant explicitement compatible avec l'AGPL, commencer par l'AGPL ne ferme pas cette porte.
- **`-or-later` plutôt que `-only`** : bénéficie automatiquement d'une éventuelle AGPL-4.0 sans avoir à recontacter les contributeurs. Recommandation de la FSF.
- **Copyright personnel** plutôt qu'associatif : tant qu'aucune contribution externe n'est fusionnée, l'auteur unique peut relicencier. Le mettre au nom du groupe imposerait un accord formel de l'association pour toute évolution.
- **Compatibilité des dépendances vérifiée** avant le choix : 21 MIT, 4 Apache-2.0, 2 BSD-2-Clause, 1 ISC, 1 MPL-2.0 (`web-push`). Le seul copyleft du lot, MPL-2.0, liste explicitement l'AGPL-3.0 comme *Secondary License* (§3.3). Aucun blocage.
- `LICENSE` reste **strictement verbatim** : le texte interdit lui-même sa modification, et la détection automatique de GitHub compare au texte canonique. Le copyright vit donc dans le `README`, `package.json` et `src/lib/legal/license.ts`, pas dans `LICENSE`.

**Conséquences** :
- **L'article 13 est une obligation de code, pas de fichier.** L'accès au code source de la version déployée doit être offert aux utilisateurs du service. Trois points d'exposition : `AppFooter` (monté dans `(app)/layout.tsx`, donc présent sur **toute** page authentifiée), le footer du groupe `(public)` pour les visiteurs non connectés, et une section dédiée des mentions légales. Une entrée dans le `UserMenu` a été implémentée puis **écartée** : « Code source » détonne dans un menu de compte personnel, et le footer couvre déjà chaque page — la redondance ne rachetait pas l'incohérence sémantique. Le lien est visible **pour tous les rôles, sans condition de permission** : c'est une obligation, pas une fonctionnalité.
- **`AppFooter` corrige au passage un manque antérieur** : un utilisateur connecté n'avait **aucun chemin** vers `/mentions-legales`, `/cgu` ou `/confidentialite`. Ces pages n'étaient liées que depuis le formulaire d'inscription et le footer du groupe `(public)`, inaccessible une fois dans l'app. Le footer porte donc les trois liens légaux en plus du lien source. Contrainte de layout : le `pb-20 md:pb-0` qui dégageait la `BottomNav` (`fixed`, hors flux) a été déplacé de `<main>` vers le conteneur, sans quoi le footer passait sous la barre de navigation mobile.
- `src/lib/legal/license.ts` centralise `SOURCE_URL` et les métadonnées. **Un déploiement qui modifie Piloti doit y pointer son propre dépôt** : le §13 exige l'accès au code *réellement exécuté*, pas à celui d'amont. Un fork qui laisse l'URL d'origine est en violation sans le savoir.
- **La relicence se ferme au premier merge d'une PR externe** sans CLA. Ce n'est pas un problème, mais c'est une porte qui se referme silencieusement — à décider avant, pas après.
- **La licence ne couvre pas les marques.** L'AGPL porte sur le droit d'auteur du code ; « Scouts et Guides de France », « SGDF » et les éléments visuels de l'association nationale restent des marques protégées. Un fork peut réutiliser le code, pas se présenter comme un outil officiel SGDF. Mentionné dans le `README` et les mentions légales.
- `LEGAL_VERSION` passe à `2026-08-22` : le contenu des mentions légales change, et la convention de `src/lib/legal/versions.ts` l'impose. `PRIVACY_VERSION` et `TERMS_VERSION` sont **inchangées** — elles sont figées dans les enregistrements `Consent`, les bumper redemanderait un consentement à tous les utilisateurs sans raison.
- `package.json` déclare `"license": "AGPL-3.0-or-later"`. `"private": true` est **conservé** : ce champ empêche un `npm publish` accidentel et n'a aucun rapport avec l'ouverture du code.
