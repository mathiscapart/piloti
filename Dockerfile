# syntax=docker/dockerfile:1.7
# Piloti — image multi-stage Next.js 16 + Prisma 7 + better-sqlite3.
#
# Cibles :
#   - deps     : `pnpm install` (mise en cache)
#   - builder  : `prisma generate` + `next build` (output: 'standalone')
#   - migrate  : conteneur one-shot qui applique les migrations DB
#   - runner   : image finale minimale, USER non-root
#
# Build : `docker compose build`
# Run   : `docker compose up -d`

# -----------------------------------------------------------------------------
# Base : Node 22 Alpine + pnpm + outils de compilation native (better-sqlite3)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++ \
 && corepack enable \
 && corepack prepare pnpm@latest-11 --activate
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# -----------------------------------------------------------------------------
# Deps : installe toutes les dépendances (dev incluses, on en aura besoin pour
# Prisma CLI et tsx dans la cible migrate)
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder : génère le client Prisma, compile Next.js en mode standalone
# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `prisma generate` ne se connecte pas à la DB mais `prisma.config.ts` exige
# DATABASE_URL via env() — on injecte un placeholder pour faire passer le build.
# La vraie URL est passée au runtime par docker-compose (file:/data/piloti.db).
ENV DATABASE_URL=file:/tmp/build-placeholder.db
# `auth.ts` plante au load (S-4) si BETTER_AUTH_SECRET absent, et Next build
# évalue les modules en page-data collection → on met un placeholder build.
# La vraie valeur vient de docker-compose --env-file au runtime.
ENV BETTER_AUTH_SECRET=build-placeholder-not-used-at-runtime
RUN pnpm prisma generate
RUN pnpm build

# -----------------------------------------------------------------------------
# Migrate : conteneur léger qui applique `prisma migrate deploy` au démarrage,
# puis exit 0. compose le lance avant l'app (depends_on + service_completed_*).
# -----------------------------------------------------------------------------
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Le runner tourne en UID 1001 (nextjs). On crée la DB avec ce uid pour qu'elle
# soit writable après migration. `prisma migrate deploy` lit DATABASE_URL et
# crée le fichier — on chown ensuite tout le dossier monté.
CMD ["sh", "-c", "pnpm prisma migrate deploy && chown -R 1001:1001 /data"]

# -----------------------------------------------------------------------------
# Runner : image finale, minimale, USER non-root
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# User non-root (1001:1001)
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone : minimal node_modules + server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Dossier prêt à recevoir les uploads (monté en volume)
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs

EXPOSE 3000

# Healthcheck via la route /api/health (Phase 2)
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# Dev : image qui monte le code en volume et lance `pnpm dev`. Utilisée par
# docker-compose.dev.yml. Pour les vrais dev workflows on lance `pnpm dev`
# en local — ce target sert si on veut reproduire l'env conteneurisé.
# -----------------------------------------------------------------------------
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Le client Prisma doit être généré dans node_modules avant le démarrage,
# sinon `pnpm dev` plante avec "Cannot find module '.prisma/client/default'".
# DATABASE_URL placeholder — `prisma generate` ne se connecte pas à la DB.
ENV DATABASE_URL=file:/tmp/build-placeholder.db
RUN pnpm prisma generate
ENV NODE_ENV=development
EXPOSE 3000
# Au démarrage : régénère le client Prisma (garantit qu'il colle au schéma même
# après un down/up qui recrée le volume node_modules), applique les migrations,
# puis lance Next. `generate` (~150ms) et `migrate deploy` sont idempotents.
CMD ["sh", "-c", "pnpm prisma generate && pnpm prisma migrate deploy && pnpm dev"]
