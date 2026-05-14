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
