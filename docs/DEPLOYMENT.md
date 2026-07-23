# Déploiement — pull-based, sans runner

> **Règle RGPD non négociable (staging)** : le staging ne doit **jamais**
> contenir de données réelles (mineurs, finances, contacts). La base est
> vierge à chaque déploiement puis seedée avec des **données factices** via
> `pnpm db:seed` (service `seed` de `docker-compose.staging.yml`). N'importez
> jamais un export/dump de la base de production dans le volume
> `piloti-staging-data`.

## Vue d'ensemble

Pas de runner CI sur ce projet (voir D-018 dans `DECISIONS.md` — ça remplace
l'approche runner self-hosted initialement envisagée en D-017). Le déploiement
est **pull-based** : c'est l'hôte qui va chercher le code déjà fusionné,
jamais GitHub qui pousse une exécution vers l'hôte.

| Branche | Script | Compose ciblé | `COMPOSE_PROJECT_NAME` | Environnement |
|---|---|---|---|---|
| `develop` | `scripts/deploy.ps1 -Environment staging` | `docker-compose.staging.yml` | `piloti-staging` | staging |
| `main` | `scripts/deploy.ps1 -Environment prod` | `docker-compose.yml` | `piloti` | prod |

### Pourquoi c'est sûr sur un repo public

Le dépôt est public, et l'hôte de déploiement est le **PC personnel Windows**
du propriétaire — celui qui héberge déjà la prod (Docker Desktop) **et** des
données personnelles (gestionnaire de mots de passe, etc.). Un runner GitHub
Actions self-hosted sur un dépôt public exécuterait, par défaut, le code de
**n'importe quelle PR**, y compris depuis un fork — inacceptable sur cette
machine. Le modèle pull-based élimine ce risque à la racine : `scripts/deploy.ps1`
ne fait jamais qu'un `git fetch` + `git reset --hard origin/develop` (ou
`origin/main`) dans un répertoire dédié, c'est-à-dire qu'il ne déploie **que**
du code déjà **fusionné**. Sur un repo public, seul le propriétaire peut
pousser sur `develop`/`main` — une PR d'un fork ne peut ni les modifier ni
déclencher quoi que ce soit côté hôte tant qu'elle n'a pas été relue et
fusionnée par un humain. Aucun event GitHub ne déclenche quoi que ce soit :
c'est l'hôte, localement (à la main ou via une tâche planifiée), qui décide
quand aller chercher le code.

### Important — les anciens secrets/variables GitHub `STAGING_*` ne sont plus utilisés

Si des secrets/variables `STAGING_CLOUDFLARE_TUNNEL_TOKEN`,
`STAGING_BETTER_AUTH_SECRET`, `STAGING_DOMAIN`, etc. ont été créés dans
**Settings → Secrets and variables → Actions** du dépôt pour une tentative
précédente basée sur un runner (D-017), **ils ne sont plus lus par rien** —
il n'y a plus de workflow qui les consomme. Les mêmes valeurs vivent
désormais dans un fichier **`.env.staging` local sur l'hôte** (§4). Il n'y a
plus besoin de les maintenir côté GitHub ; les laisser en place ne pose pas
de risque de sécurité en soi (ce sont des secrets GitHub normalement
protégés), mais ils sont inertes — à supprimer si vous voulez nettoyer, ou à
laisser, au choix.

Ce document couvre les étapes **manuelles**, hors dépôt (répertoires de
déploiement, tunnels Cloudflare, fichiers `.env.*`, tâche planifiée). Le
reste (`docker-compose.staging.yml`, `docker-compose.yml`, `scripts/deploy.ps1`)
est versionné et se lit directement dans le repo.

## 1. Répertoires de déploiement dédiés

`scripts/deploy.ps1` ne travaille **jamais** dans le répertoire de dev du
propriétaire (celui où ce README est lu) : il utilise un répertoire dédié par
environnement, racine configurable via `$env:PILOTI_DEPLOY_ROOT` (défaut :
`%USERPROFILE%\piloti-deploy`), avec un sous-dossier par environnement
(`\staging`, `\prod`).

1. Choisir l'emplacement (le défaut convient dans la plupart des cas) et,
   si besoin, le fixer durablement pour l'utilisateur/la tâche planifiée :
   ```powershell
   setx PILOTI_DEPLOY_ROOT "C:\piloti-deploy"
   ```
2. Le premier appel de `scripts/deploy.ps1` clone automatiquement le dépôt
   dans `<root>\<environment>` s'il n'existe pas encore (`git clone` sur
   l'URL publique du dépôt). Pas d'étape manuelle de clonage requise, mais
   rien n'empêche de le faire soi-même à l'avance.
3. **Important** : le nom de projet Docker Compose de la prod est fixé en dur
   à `piloti` dans le script (voir commentaire dans `scripts/deploy.ps1`),
   quel que soit le nom du dossier de déploiement — ça garantit que le premier
   déploiement pull-based réutilise les **mêmes volumes** (`piloti_piloti-data`,
   `piloti_piloti-uploads`) que la stack prod déjà en service aujourd'hui,
   plutôt que d'en créer de nouveaux, vides, à côté.

## 2. Tunnel Cloudflare dédié au staging

Le tunnel de prod (`CLOUDFLARE_TUNNEL_TOKEN`) ne doit **jamais** être réutilisé
pour le staging — il faut un second tunnel, entièrement indépendant. (La prod
dispose déjà de son tunnel ; cette étape ne concerne que le staging.)

1. Dashboard Cloudflare → **Zero Trust → Networks → Tunnels → Create a
   tunnel** (type *Cloudflared*). Nommer explicitement, par ex. `piloti-staging`.
2. Copier le **token** généré → il servira de valeur à `STAGING_CLOUDFLARE_TUNNEL_TOKEN`
   dans `.env.staging` (voir §4). Ne jamais le committer.
3. Dans la configuration du tunnel (« Public Hostname ») :
   - Sous-domaine : le domaine staging choisi (ex. `staging.mon-groupe.fr`).
   - Service : `HTTP://traefik:80` (nom du service Traefik de la stack
     staging, résolu via le réseau Docker `tunnel` de
     `docker-compose.staging.yml`).
4. **Enregistrement DNS** : Cloudflare crée normalement le CNAME
   automatiquement lors de la création du « Public Hostname ». Vérifier dans
   **DNS → Records** que l'entrée pointe bien vers `<tunnel-id>.cfargotunnel.com`
   et que le proxy Cloudflare (nuage orange) est actif.

## 3. Politique Cloudflare Access (Zero Trust) — staging

Le sous-domaine staging doit être inaccessible à quiconque n'est pas le
propriétaire — c'est cette politique qui remplace toute authentification
applicative supplémentaire côté staging.

1. Dashboard Cloudflare → **Zero Trust → Access → Applications → Add an
   application** (type *Self-hosted*).
2. Domaine de l'application : le sous-domaine staging (celui du §2).
3. Politique d'accès : règle unique `Include` → `Emails` → l'adresse email du
   propriétaire uniquement.
4. Durée de session courte (ex. 24h) — le staging n'a pas besoin de sessions
   longues, l'accès est révocable à tout moment depuis ce même écran (retirer
   l'email de la politique coupe l'accès immédiatement, sans toucher au repo
   ni au tunnel).
5. Vérifier que l'authentification Cloudflare Access se déclenche bien avant
   d'atteindre l'application (test dans un navigateur en navigation privée).

La prod n'a volontairement pas de politique Access équivalente : elle doit
rester accessible aux utilisateurs réels (chefs, parents, jeunes).

## 4. Fichiers d'environnement locaux

Aucun secret dans `scripts/deploy.ps1` ni dans les fichiers compose : les
valeurs viennent de fichiers `.env.staging` / `.env.production`, **locaux à
chaque répertoire de déploiement**, jamais commités (couverts par le motif
`.env*` du `.gitignore` du dépôt).

### `<root>\staging\.env.staging`

Noms de variables imposés par `docker-compose.staging.yml` (préfixe `STAGING_`) :

| Variable | Contenu |
|---|---|
| `STAGING_CLOUDFLARE_TUNNEL_TOKEN` | Token du tunnel Cloudflare staging (§2) |
| `STAGING_BETTER_AUTH_SECRET` | Secret dédié au staging, **différent** de celui de prod. Générer avec `openssl rand -hex 32` |
| `STAGING_BETTER_AUTH_URL` | URL publique complète du staging (ex. `https://staging.mon-groupe.fr`) |
| `STAGING_DOMAIN` | Sous-domaine staging, utilisé par le label Traefik `Host(...)` |
| `STAGING_RESEND_API_KEY` / `STAGING_RESEND_FROM_EMAIL` | Optionnels. Si vides, le flux « mot de passe oublié » est désactivé en staging |
| `STAGING_VAPID_PUBLIC_KEY` / `STAGING_VAPID_PRIVATE_KEY` / `STAGING_VAPID_SUBJECT` | Optionnels. Générer avec `npx web-push generate-vapid-keys`, des clés dédiées au staging |

**Ne jamais** réutiliser une valeur de production pour l'une de ces
variables — l'isolation staging/prod (RGPD, sécurité) en dépend directement.

### `<root>\prod\.env.production`

Noms de variables imposés par `docker-compose.yml` (sans préfixe — c'est le
même fichier que celui déjà utilisé aujourd'hui pour lancer la prod
manuellement) :

| Variable | Contenu |
|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | Token du tunnel Cloudflare de prod (existant, inchangé) |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Existants, inchangés |
| `TRAEFIK_DOMAIN` | Domaine public de prod, existant, inchangé |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Optionnels, existants |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optionnels, existants |

Si la prod tourne déjà avec un fichier `.env` à un autre emplacement, copier
son contenu vers `<root>\prod\.env.production` lors de la première mise en
place — c'est ce fichier que `scripts/deploy.ps1 -Environment prod` utilisera
désormais.

## 5. Utilisation manuelle

Après un merge sur `develop` (staging) ou `main` (prod), depuis n'importe où :

```powershell
# Staging, après merge sur develop
powershell -File scripts/deploy.ps1 -Environment staging

# Prod, après merge sur main
powershell -File scripts/deploy.ps1 -Environment prod
```

Le script est idempotent : le relancer sans nouveau commit ne casse rien (le
`git reset --hard` ne change rien, et `docker compose build`/`up -d` ne
recréent les conteneurs que si l'image a effectivement changé).

## 6. Automatisation — tâche planifiée Windows (poll)

Pour ne pas dépendre d'un lancement manuel après chaque merge, enregistrer une
tâche planifiée qui relance le script à intervalle régulier. Comme le script
est idempotent, un poll sans changement de branche ne produit aucun effet
observable — le déploiement n'a lieu « pour de vrai » que quand `develop`/`main`
a effectivement avancé depuis le dernier passage.

**Important** : exécuter la tâche dans la session de l'utilisateur propriétaire
(pas `SYSTEM`) — Docker Desktop sur Windows expose le pipe nommé Docker au
contexte de l'utilisateur connecté (ou aux membres du groupe `docker-users`),
pas à `SYSTEM` par défaut.

### Option A — `schtasks` (ligne de commande)

```powershell
schtasks /Create /TN "Piloti Deploy Staging" ^
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\piloti-deploy\staging\scripts\deploy.ps1\" -Environment staging" ^
  /SC MINUTE /MO 5 /RU "%USERDOMAIN%\%USERNAME%" /RL LIMITED /F

schtasks /Create /TN "Piloti Deploy Prod" ^
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\piloti-deploy\prod\scripts\deploy.ps1\" -Environment prod" ^
  /SC MINUTE /MO 15 /RU "%USERDOMAIN%\%USERNAME%" /RL LIMITED /F
```

(`/RU` invite à saisir le mot de passe de session au moment de la création si
la tâche doit tourner même hors session ouverte ; sinon ajouter
`/IT` pour ne l'exécuter que si l'utilisateur est connecté.)

Notez que la cible pointe vers le script **dans le répertoire de déploiement**
(`C:\piloti-deploy\staging\scripts\deploy.ps1`), pas dans le dépôt de dev : il
se met à jour tout seul à chaque déploiement (`git reset --hard` le ramène au
contenu de `develop`/`main`).

### Option B — `Register-ScheduledTask` (PowerShell)

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\piloti-deploy\staging\scripts\deploy.ps1" -Environment staging'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
Register-ScheduledTask -TaskName "Piloti Deploy Staging" -Action $action -Trigger $trigger `
    -Description "Poll develop et redéploie le staging Piloti si la branche a avancé."
```

Adapter (`-Environment prod`, chemin `\prod\`, intervalle plus long, ex. 15
minutes) pour la tâche prod.

## 7. Vérifications après mise en place

### Staging

- `docker compose -f docker-compose.staging.yml config -q` passe sans erreur
  dans `<root>\staging` (avec `.env.staging` rempli).
- Après le premier déploiement : `docker ps` sur l'hôte doit montrer des
  conteneurs **distincts** de ceux de la prod (préfixe `piloti-staging-*`),
  et `docker volume ls` doit montrer `piloti-staging-data` /
  `piloti-staging-uploads` séparément de `piloti_piloti-data` /
  `piloti_piloti-uploads`.
- Naviguer vers le sous-domaine staging doit d'abord présenter l'écran
  Cloudflare Access (email du propriétaire), puis rediriger vers `/setup`
  (base fraîchement seedée — voir D-010 dans `DECISIONS.md`) ou directement
  vers l'app si le seed crée déjà un compte de test.

### Prod

- `docker volume ls` doit continuer de montrer les **mêmes** volumes
  (`piloti_piloti-data`, `piloti_piloti-uploads`) qu'avant la mise en place de
  ce répertoire de déploiement dédié — sinon `COMPOSE_PROJECT_NAME` n'est pas
  celui attendu (§1).
- Après un merge sur `main` et un déploiement (manuel ou via la tâche
  planifiée), `docker compose -f docker-compose.yml ps` dans `<root>\prod`
  doit montrer les conteneurs prod à jour (nouvelle image, healthcheck `app`
  passant).
- En cas d'échec du déploiement, la stack précédente reste en place tant que
  `docker compose up -d` n'a pas réussi (Compose ne coupe pas un service sain
  pour le remplacer par un service qui échoue à démarrer) — vérifier malgré
  tout manuellement après tout échec.

## Check-list récapitulative

### Staging

- [ ] Second tunnel Cloudflare créé (`piloti-staging`) + Public Hostname + DNS vérifié
- [ ] Politique Cloudflare Access créée, restreinte à l'email du propriétaire
- [ ] `<root>\staging\.env.staging` créé avec toutes les variables `STAGING_*` requises
- [ ] Premier déploiement manuel vérifié (`scripts/deploy.ps1 -Environment staging`) : conteneurs/volumes strictement distincts de la prod, accès uniquement via Cloudflare Access
- [ ] Tâche planifiée « Piloti Deploy Staging » enregistrée (optionnel, si automatisation souhaitée)

### Prod

- [ ] `<root>\prod\.env.production` créé (repris du `.env` de prod existant)
- [ ] Premier déploiement manuel vérifié (`scripts/deploy.ps1 -Environment prod`) : mêmes volumes que la prod déjà en service, healthcheck `app` passant
- [ ] Tâche planifiée « Piloti Deploy Prod » enregistrée (optionnel, si automatisation souhaitée)

### Nettoyage (si applicable)

- [ ] Anciens secrets/variables GitHub `STAGING_*` (créés pour le modèle runner, D-017) supprimés ou laissés inertes, au choix
