#!/usr/bin/env bash
# Prépare un worktree Orca pour qu'un agent puisse travailler en parallèle des
# autres : dépendances, base SQLite propre au worktree, port dédié.
#
# Lancé par Orca à la création du worktree (cf. `orca.yaml`), relançable à la
# main sans risque : le port déjà attribué est conservé, la base n'est
# re-seedée que si elle n'existe pas.
#
# Pourquoi en natif et pas via docker-compose.dev.yml : ce compose publie le
# port 4000 en dur et un seul conteneur `piloti-app-1` peut exister. Deux
# worktrees ne peuvent donc pas l'utiliser en même temps.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ "$(git rev-parse --git-dir)" == "$(git rev-parse --git-common-dir)" ]]; then
  echo "worktree-setup : à lancer dans un worktree, pas dans le checkout principal." >&2
  exit 1
fi

PORT_MIN=3101
PORT_MAX=3199

# Port déjà attribué à ce worktree ?
port=""
if [[ -f .env.local ]]; then
  port="$(sed -n 's/^PORT=//p' .env.local | tr -d '"')"
fi

if [[ -z "$port" ]]; then
  # Ports réservés par les autres worktrees, même si leur serveur est éteint.
  taken="$(
    git worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wt; do
      [[ "$wt" == "$PWD" ]] && continue
      [[ -f "$wt/.env.local" ]] && sed -n 's/^PORT=//p' "$wt/.env.local" | tr -d '"'
    done
  )"
  for ((p = PORT_MIN; p <= PORT_MAX; p++)); do
    grep -qx "$p" <<<"$taken" && continue
    ss -Hltn "sport = :$p" 2>/dev/null | grep -q . && continue
    port="$p"
    break
  done
  [[ -n "$port" ]] || { echo "worktree-setup : aucun port libre entre $PORT_MIN et $PORT_MAX." >&2; exit 1; }
fi

# `.env` : base de l'environnement, créé une seule fois. Lu par Prisma et par
# le seed (`dotenv/config` ne lit que lui).
if [[ ! -f .env ]]; then
  cat > .env <<EOF
# Généré par scripts/worktree-setup.sh — env de dev propre à ce worktree.
DATABASE_URL="file:./dev.db"
BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
SEED_PASSWORD="$(openssl rand -hex 8)"
EOF
fi

# `.env.local` : ce qui dépend du port. Next le fait primer sur `.env`.
# DATABASE_URL est forcé ici aussi : un `.env` copié du checkout principal ne
# doit jamais faire partager une base entre deux worktrees.
cat > .env.local <<EOF
# Généré par scripts/worktree-setup.sh — ne pas éditer, relancer le script.
PORT=$port
DATABASE_URL="file:./dev.db"
BETTER_AUTH_URL="http://localhost:$port"
TRUSTED_ORIGINS="http://host.docker.internal:$port"
EOF

set -a
# shellcheck disable=SC1091
. ./.env
# shellcheck disable=SC1091
. ./.env.local
set +a

fresh_db=0
[[ -f dev.db ]] || fresh_db=1

pnpm install --frozen-lockfile
pnpm db:generate
pnpm exec prisma migrate deploy

# Le seed EFFACE la base : seulement à sa création, jamais sur une relance.
if ((fresh_db)); then
  pnpm db:seed
fi

cat <<EOF

Worktree prêt.
  Lancer le serveur : pnpm dev:worktree
  Depuis l'hôte     : http://localhost:$port
  Depuis le MCP     : http://host.docker.internal:$port
  Comptes du seed   : mot de passe SEED_PASSWORD dans .env
EOF
