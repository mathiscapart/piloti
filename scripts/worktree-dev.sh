#!/usr/bin/env bash
# Lance `next dev` sur le port attribué au worktree par worktree-setup.sh.
# Next ne lit pas PORT depuis les fichiers .env (le serveur démarre avant de
# les charger) : il faut le passer en argument.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

port="$(sed -n 's/^PORT=//p' .env.local 2>/dev/null | tr -d '"')"
[[ -n "$port" ]] || { echo "Pas de port attribué : lancer d'abord bash scripts/worktree-setup.sh" >&2; exit 1; }

exec pnpm exec next dev -p "$port"
