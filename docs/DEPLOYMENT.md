# Déploiement continu — staging et prod

> **Règle RGPD non négociable (staging)** : le staging ne doit **jamais**
> contenir de données réelles (mineurs, finances, contacts). La base est
> vierge à chaque déploiement puis seedée avec des **données factices** via
> `pnpm db:seed` (service `seed` de `docker-compose.staging.yml`). N'importez
> jamais un export/dump de la base de production dans le volume
> `piloti-staging-data`.

## Vue d'ensemble

Deux workflows de déploiement continu, symétriques par construction :

| Branche | CI de référence | Workflow de déploiement | Compose ciblé | Environnement |
|---|---|---|---|---|
| `develop` | `CI` vert sur `develop` | `.github/workflows/deploy-staging.yml` | `docker-compose.staging.yml` | staging |
| `main` | `CI` vert sur `main` | `.github/workflows/deploy-prod.yml` | `docker-compose.yml` | prod |

Les deux tournent sur le **même hôte physique**, qui héberge déjà la prod, et
sur le **même runner GitHub Actions self-hosted** (voir §3) — mais dans des
stacks Docker Compose **totalement isolées** l'une de l'autre : projets
Compose distincts, réseaux distincts, volumes distincts. Aucun des deux
workflows ne modifie les fichiers `docker-compose.yml` / `docker-compose.staging.yml`
au moment du déploiement : ils se contentent de `build` + `up -d` sur le
fichier correspondant, déjà versionné dans le repo.

Le vrai garde-fou de la prod n'est **pas** ce pipeline mais la **protection de
branche sur `main`** (relecture obligatoire + merge humain avant que le code
n'atteigne `main`, donc avant que `CI` ne tourne dessus, donc avant que
`deploy-prod.yml` ne se déclenche). Le pipeline ne fait que rejouer
automatiquement, sur l'hôte, un état déjà validé par un humain. Le runner
self-hosted qui exécute `deploy-prod.yml` a accès à l'hôte de production et
à ses secrets réels (`.env` de `docker-compose.yml`) — traiter sa compromission
avec la même rigueur qu'un accès SSH root à la prod.

Ce document couvre uniquement les étapes **manuelles**, hors dépôt (dashboard
Cloudflare, installation du runner, secrets GitHub). Le reste (compose,
workflows) est versionné et se lit directement dans le repo.

## 1. Tunnel Cloudflare dédié au staging

Le tunnel de prod (`CLOUDFLARE_TUNNEL_TOKEN`) ne doit **jamais** être réutilisé
pour le staging — il faut un second tunnel, entièrement indépendant. (La prod
dispose déjà de son tunnel ; cette étape ne concerne que le staging.)

1. Dashboard Cloudflare → **Zero Trust → Networks → Tunnels → Create a
   tunnel** (type *Cloudflared*). Nommer explicitement, par ex. `piloti-staging`.
2. Copier le **token** généré → il servira de valeur au secret GitHub
   `STAGING_CLOUDFLARE_TUNNEL_TOKEN` (voir §4). Ne jamais le committer.
3. Dans la configuration du tunnel (« Public Hostname ») :
   - Sous-domaine : le domaine staging choisi (ex. `staging.mon-groupe.fr`).
   - Service : `HTTP://traefik:80` (nom du service Traefik de la stack
     staging, résolu via le réseau Docker `tunnel` de
     `docker-compose.staging.yml`).
4. **Enregistrement DNS** : Cloudflare crée normalement le CNAME
   automatiquement lors de la création du « Public Hostname ». Vérifier dans
   **DNS → Records** que l'entrée pointe bien vers `<tunnel-id>.cfargotunnel.com`
   et que le proxy Cloudflare (nuage orange) est actif.

## 2. Politique Cloudflare Access (Zero Trust) — staging

Le sous-domaine staging doit être inaccessible à quiconque n'est pas le
propriétaire — c'est cette politique qui remplace toute authentification
applicative supplémentaire côté staging.

1. Dashboard Cloudflare → **Zero Trust → Access → Applications → Add an
   application** (type *Self-hosted*).
2. Domaine de l'application : le sous-domaine staging (celui du §1).
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

## 3. Runner self-hosted GitHub Actions (staging + prod)

Les deux workflows (`deploy-staging.yml`, `deploy-prod.yml`) ciblent
`runs-on: [self-hosted, <label>]` : il faut un runner GitHub Actions installé
**sur l'hôte** qui porte déjà la prod. Ce choix est cohérent avec
l'architecture « zéro port entrant » du projet : le runner établit une
connexion **sortante** vers GitHub (comme `cloudflared` le fait déjà vers
l'edge Cloudflare) — aucun port SSH n'a besoin d'être ouvert pour permettre à
GitHub de déclencher un déploiement.

Un **seul runner physique** suffit (même hôte, même machine pour staging et
prod) : il est enregistré avec **les deux labels** `piloti-staging` **et**
`piloti-prod`, en plus de `self-hosted`. Ce n'est pas une isolation technique
(un seul runner exécute forcément les deux types de job, l'un après l'autre)
— l'isolation réelle est assurée par les stacks Compose distinctes (§ Vue
d'ensemble). Le double label sert à :
- rendre explicite, à la seule lecture d'un fichier de workflow, quel
  environnement il cible (`deploy-staging.yml` → `piloti-staging`,
  `deploy-prod.yml` → `piloti-prod`) ;
- éviter qu'un copier-coller erroné entre les deux workflows fasse tourner un
  job sur un `runs-on` qui semble correct alors qu'il vise le mauvais
  environnement (une faute de frappe sur le label produirait une erreur
  explicite « aucun runner disponible », plutôt qu'un déploiement silencieux
  au mauvais endroit).

Installation :

1. Dépôt GitHub → **Settings → Actions → Runners → New self-hosted runner**.
2. Suivre les instructions d'installation fournies par GitHub sur l'hôte
   (télécharger `actions-runner`, `config.sh`/`config.cmd` avec le token
   fourni par l'écran d'installation).
3. À l'étape des labels, ajouter **les deux labels** `piloti-staging` et
   `piloti-prod` (en plus de `self-hosted`, ajouté automatiquement) :
   ```
   ./config.sh --url https://github.com/<org>/<repo> --token <TOKEN> --labels piloti-staging,piloti-prod
   ```
4. Installer le runner comme service persistant (`./svc.sh install && ./svc.sh start`
   sur Linux, ou l'équivalent Windows) pour qu'il survive à un redémarrage de
   l'hôte.
5. Vérifier que Docker et `docker compose` (plugin v2+) sont accessibles à
   l'utilisateur qui exécute le runner, et que cet utilisateur a accès au
   `.env` de prod déjà en place à côté de `docker-compose.yml` sur l'hôte
   (le workflow `deploy-prod.yml` ne fournit aucune variable d'environnement :
   il s'appuie sur ce `.env` existant, exactement comme un `docker compose up -d`
   lancé manuellement aujourd'hui).

**Sensibilité** : ce runner, une fois installé, a un accès complet à l'hôte de
prod (Docker socket, `.env` de prod en clair sur le disque). Le protéger comme
un accès SSH root : pas de job déclenché sur ce runner par une PR externe
non fusionnée (les deux workflows ne réagissent qu'à un `workflow_run` déclenché
*après* la CI sur des branches protégées, jamais sur une PR), machine à jour,
accès physique/SSH à l'hôte restreint au propriétaire.

## 4. Secrets et variables GitHub à créer (staging uniquement)

La prod n'ajoute **aucun** secret/variable GitHub : `deploy-prod.yml` ne fait
que relancer `docker compose -f docker-compose.yml up -d`, qui lit le `.env`
déjà présent sur l'hôte (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`CLOUDFLARE_TUNNEL_TOKEN`, `TRAEFIK_DOMAIN`, etc. — inchangés par ce
changement). Seul le staging introduit de nouveaux secrets/variables, car sa
stack tourne avec des identifiants dédiés.

Dépôt GitHub → **Settings → Secrets and variables → Actions**. Séparer les
valeurs sensibles (**Secrets**) des valeurs non sensibles (**Variables**),
conformément à l'usage dans `deploy-staging.yml`.

### Secrets (`Secrets → Actions`)

| Nom | Contenu |
|---|---|
| `STAGING_CLOUDFLARE_TUNNEL_TOKEN` | Token du tunnel Cloudflare staging (§1) |
| `STAGING_BETTER_AUTH_SECRET` | Secret dédié au staging, **différent** de celui de prod. Générer avec `openssl rand -hex 32` |
| `STAGING_RESEND_API_KEY` | Optionnel. Si vide, le flux « mot de passe oublié » est désactivé en staging (comportement identique à un `.env` local incomplet) |
| `STAGING_VAPID_PUBLIC_KEY` / `STAGING_VAPID_PRIVATE_KEY` | Optionnels. Générer avec `npx web-push generate-vapid-keys`, des clés dédiées au staging |

### Variables (`Variables → Actions`, non sensibles)

| Nom | Contenu |
|---|---|
| `STAGING_DOMAIN` | Sous-domaine staging (ex. `staging.mon-groupe.fr`), utilisé par le label Traefik `Host(...)` |
| `STAGING_BETTER_AUTH_URL` | URL publique complète du staging (ex. `https://staging.mon-groupe.fr`) |
| `STAGING_RESEND_FROM_EMAIL` | Adresse d'expédition si Resend est activé en staging |
| `STAGING_VAPID_SUBJECT` | `mailto:...` si le push est activé en staging |

**Ne jamais** réutiliser une valeur de production pour l'un de ces
secrets/variables — l'isolation staging/prod (RGPD, sécurité) en dépend
directement.

## 5. Vérifications après mise en place

### Staging

- `docker compose -f docker-compose.staging.yml config -q` passe sans erreur
  (déjà validé côté repo, à revalider sur l'hôte avec les vraies valeurs).
- Après le premier déploiement automatique : `docker ps` sur l'hôte doit
  montrer des conteneurs **distincts** de ceux de la prod (préfixe
  `piloti-staging-*`), et `docker volume ls` doit montrer `piloti-staging-data`
  / `piloti-staging-uploads` séparément de `piloti_piloti-data` / `piloti_piloti-uploads`.
- Naviguer vers le sous-domaine staging doit d'abord présenter l'écran
  Cloudflare Access (email du propriétaire), puis rediriger vers `/setup`
  (base fraîchement seedée — voir D-010 dans `DECISIONS.md`) ou directement
  vers l'app si le seed crée déjà un compte de test.

### Prod

- Un merge sur `main` déclenche `CI`, puis (si vert) `deploy-prod.yml` sur le
  runner self-hosted.
- Vérifier dans l'onglet **Actions** du dépôt que `deploy-prod.yml` s'est bien
  exécuté après `CI`, et que `docker compose -f docker-compose.yml ps` sur
  l'hôte montre les conteneurs prod à jour (nouvelle image, healthcheck `app`
  passant).
- En cas d'échec du déploiement, la stack précédente reste en place tant que
  `docker compose up -d` n'a pas réussi (Compose ne coupe pas un service sain
  pour le remplacer par un service qui échoue à démarrer) — vérifier malgré
  tout manuellement après tout échec signalé par Actions.

## Check-list récapitulative

### Staging

- [ ] Second tunnel Cloudflare créé (`piloti-staging`) + Public Hostname + DNS vérifié
- [ ] Politique Cloudflare Access créée, restreinte à l'email du propriétaire
- [ ] Secrets GitHub créés : `STAGING_CLOUDFLARE_TUNNEL_TOKEN`, `STAGING_BETTER_AUTH_SECRET`, (optionnel) `STAGING_RESEND_API_KEY`, `STAGING_VAPID_PUBLIC_KEY`, `STAGING_VAPID_PRIVATE_KEY`
- [ ] Variables GitHub créées : `STAGING_DOMAIN`, `STAGING_BETTER_AUTH_URL`, (optionnel) `STAGING_RESEND_FROM_EMAIL`, `STAGING_VAPID_SUBJECT`
- [ ] Premier déploiement vérifié : conteneurs/volumes strictement distincts de la prod, accès uniquement via Cloudflare Access

### Prod / commun

- [ ] Runner self-hosted installé sur l'hôte, labels `piloti-staging` **et** `piloti-prod` présents, lancé en service persistant
- [ ] Protection de branche activée sur `main` (relecture + merge humain obligatoires) — c'est le vrai garde-fou avant tout déploiement prod
- [ ] Premier déploiement prod automatique vérifié (`Actions` → `deploy-prod.yml` vert, conteneurs prod à jour, healthcheck `app` passant)
