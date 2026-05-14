# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **pnpm** (lockfile `pnpm-lock.yaml`; `pnpm-workspace.yaml` declares the allowed build scripts — Prisma engines, esbuild, sharp).

- `pnpm dev` — Next.js dev server on http://localhost:3000
- `pnpm build` — production build (uses `output: 'standalone'`)
- `pnpm start` — serve the production build
- `pnpm lint` — ESLint (flat-config in `eslint.config.mjs`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm db:migrate` / `db:seed` / `db:studio` / `db:reset` / `db:generate` — Prisma workflow (DB lives at `DATABASE_URL`, SQLite file)

There is no test runner.

## Architecture

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind v4 + Prisma (SQLite) + better-auth.

- Routes live under `src/app/`. The path alias `@/*` resolves to `./src/*` (see `tsconfig.json`). There is **no** `pages/` directory.
- **Next.js 16 renamed `middleware.ts` → `proxy.ts`**. Route protection goes in `src/proxy.ts` (not `src/middleware.ts`).
- **Tailwind v4 is CSS-first**: design tokens are defined in `src/app/globals.css` inside an `@theme inline` block. There is **no** `tailwind.config.*` file. SGDF palette tokens (`forest`, `sky`, `sun`, `fire`, `brick`, `sand`, `snow`, `earth`, `trail`, `stone`) are exposed as both raw utilities (`bg-forest`, `text-earth`) **and** as shadcn aliases (`--color-primary` → `--color-forest`, etc.) so shadcn components automatically inherit the SGDF palette.
- The root layout (`src/app/layout.tsx`) loads **Nunito** (variable font, weights 400–900) and **JetBrains Mono** via `next/font/google` and wires `<html lang="fr">`. The `<body>` is `bg-sand font-sans text-earth` and includes a global `<Toaster />` (sonner).
- UI primitives come from **shadcn/ui** scaffolded under `src/components/ui/`. The Button is customised: `rounded-full` + `font-bold` per the SGDF spec, with an extra `info` variant (`bg-sky`).
- ESLint extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` and re-declares the default ignores (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`) — the flat-config override clears them otherwise.

## Piloti — Contraintes fixes

- SQLite en dev ET prod (cette version)
- Code anglais / UI française
- Design depuis Notion "Design System — Style SGDF"
- Maquettes depuis Stitch (chercher en premier)
- Toute modification de données → AuditLog dans la même transaction Prisma
- Aucun port exposé en prod (tout via cloudflared)
- Better-auth (PAS NextAuth)

Voir `DECISIONS.md` pour le détail des choix techniques autonomes.
