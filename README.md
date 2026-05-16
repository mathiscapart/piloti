# Piloti

Application de gestion du matériel pour un groupe scout SGDF. Inventaire, prêts, incidents, tableau de bord — interface entièrement en français.

**Stack :** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Prisma 7 · SQLite · better-auth

---

## Démarrage rapide (développement)

### 1. Prérequis

- **Node.js 22+**
- **pnpm 11+** — si absent : `corepack enable && corepack prepare pnpm@latest --activate`

### 2. Cloner et installer

```bash
git clone <url-du-repo>
cd piloti
pnpm install
```

### 3. Variables d'environnement

```bash
cp .env.example .env
```

Éditer `.env` : les valeurs par défaut suffisent pour le développement local. Seule `BETTER_AUTH_SECRET` doit être changée (voir le fichier `.env.example`).

### 4. Base de données

```bash
pnpm db:migrate    # Crée dev.db et applique toutes les migrations
pnpm db:seed       # Peuple avec des données de test (optionnel)
```

### 5. Lancer

```bash
pnpm dev           # http://localhost:3000
```

**Premier lancement sans seed :** l'application redirige automatiquement vers `/setup` pour créer le compte administrateur (comme n8n). Pas besoin de seed en production.

**Avec seed** — comptes de test disponibles :

| Email | Mot de passe | Rôle | Statut |
|---|---|---|---|
| `admin@piloti.fr` | `PilotiAdmin2024!` | Admin | Actif |
| `thomas.martin@sgdf.fr` | `PilotiChef2024!` | Chef (Pios) | Actif |
| `julie.bernard@sgdf.fr` | `PilotiChef2024!` | Chef (Bleus) | Actif |
| `paul.durand@sgdf.fr` | `PilotiScout2024!` | Chef (Verts) | En attente |

---

## Commandes

```bash
pnpm dev              # Serveur de développement (http://localhost:3000)
pnpm build            # Build de production
pnpm start            # Servir le build de production
pnpm lint             # ESLint
pnpm typecheck        # Vérification TypeScript (sans compilation)

pnpm db:migrate       # Appliquer les migrations Prisma (crée dev.db si absent)
pnpm db:seed          # Remplir la base avec des données de test réalistes
pnpm db:studio        # Prisma Studio — interface graphique pour la base
pnpm db:reset         # Réinitialiser la base et réappliquer toutes les migrations
pnpm db:generate      # Régénérer le client Prisma (après modification du schéma)

pnpm icons:generate   # Régénérer favicon.ico et les icônes PWA depuis les SVG
```

---

## Structure du projet

```
piloti/
├── prisma/
│   ├── schema.prisma          # Schéma de base de données (SQLite)
│   ├── seed.ts                # Données de test réalistes
│   └── migrations/            # Migrations versionnées
├── public/
│   ├── logo/                  # SVG source du design system Piloti/SGDF
│   └── icons/                 # PNG générés (PWA, apple-touch-icon)
├── scripts/
│   └── gen-icons.mjs          # Génère favicon.ico + icônes PWA via sharp
├── src/
│   ├── app/
│   │   ├── (app)/             # Pages protégées (authentification requise)
│   │   │   ├── dashboard/     # Tableau de bord
│   │   │   ├── stock/         # Inventaire matériel
│   │   │   ├── prets/         # Prêts
│   │   │   ├── incidents/     # Signalements d'incidents
│   │   │   └── admin/         # Administration (inscriptions, utilisateurs, catégories, audit)
│   │   ├── (auth)/            # Pages publiques
│   │   │   ├── login/         # Connexion
│   │   │   ├── register/      # Demande d'accès (validation admin requise)
│   │   │   ├── setup/         # Premier lancement — création du compte admin
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   ├── api/
│   │   │   ├── auth/[...all]/ # Route better-auth (sessions, reset password…)
│   │   │   ├── upload/        # Upload de photos d'incidents
│   │   │   └── health/        # Health check Docker
│   │   ├── globals.css        # Design tokens Tailwind v4 (@theme) + palette SGDF
│   │   ├── layout.tsx         # Layout racine (polices, Toaster)
│   │   └── favicon.ico / icon.png / icon.svg  # Favicon multi-format
│   ├── components/
│   │   ├── ui/                # Primitives shadcn/ui (Button, Input, Dialog…)
│   │   ├── layout/            # Sidebar, MobileHeader, UserMenu, nav-items
│   │   ├── dashboard/         # Widgets du tableau de bord
│   │   ├── equipment/         # CategoryChip, EquipmentForm
│   │   ├── loans/             # LoanCard
│   │   └── incidents/         # IncidentForm, IncidentTypeGrid
│   ├── lib/
│   │   ├── auth.ts            # Configuration better-auth (emailAndPassword + Resend)
│   │   ├── auth-client.ts     # Client better-auth (côté navigateur)
│   │   ├── db.ts              # Client Prisma (singleton, adapter better-sqlite3)
│   │   ├── audit.ts           # withAudit() — wrappeur transaction + AuditLog
│   │   ├── permissions.ts     # can(user, "permission") — contrôle d'accès
│   │   ├── password-policy.ts # Schéma Zod + hint texte pour la politique de mdp
│   │   ├── enums.ts           # Constantes TS (ROLES, UNITS, statuts…)
│   │   ├── get-current-user.ts
│   │   └── incident-categories.ts
│   ├── modules/
│   │   ├── admin/
│   │   │   ├── actions.ts     # Server Actions admin (approuver, suspendre, supprimer…)
│   │   │   └── queries.ts     # Requêtes admin (utilisateurs, audit log)
│   │   └── inventory/
│   │       ├── actions.ts     # CRUD matériel
│   │       ├── loan-actions.ts
│   │       ├── incident-actions.ts
│   │       ├── category-actions.ts
│   │       ├── queries.ts
│   │       └── types.ts       # Schémas Zod pour la validation
│   └── proxy.ts               # Protection des routes (Next.js 16 = proxy.ts, pas middleware.ts)
└── traefik/
    └── config/                # Configuration Traefik (security headers…)
```

---

## Concepts clés

### Protection des routes — `src/proxy.ts`

> ⚠️ Next.js 16 a renommé `middleware.ts` en `proxy.ts`. Tout exemple en ligne utilisant `middleware.ts` ne fonctionnera pas.

Le proxy gère trois cas :
1. **Base vide** (premier lancement) → redirige vers `/setup`
2. **Non authentifié** → redirige vers `/login` (sauf routes publiques)
3. **Compte non ACTIVE** → efface le cookie, redirige vers `/login`

### Mutations — `withAudit()`

Toute modification de données passe par `withAudit()` qui execute la mutation ET crée une entrée `AuditLog` dans la **même transaction Prisma**. Jamais de mutation sans trace.

```ts
await withAudit(
  (tx) => tx.equipment.update({ where: { id }, data }),
  { action: "EQUIPMENT_UPDATED", userId: user.id, equipmentId: id }
);
```

### Contrôle d'accès — `can()`

```ts
import { can } from "@/lib/permissions";
if (!can(user, "admin.access")) return { error: "Accès refusé." };
```

### Server Actions

Pattern standard du projet :

```ts
// actions.ts
export async function monAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> { ... }

// composant client
const [state, action, pending] = useActionState(monAction, { error: null });
```

### Politique de mot de passe

Définie dans `src/lib/password-policy.ts` : 12 caractères minimum, majuscule, minuscule, chiffre. Partagée entre l'inscription, le reset de mot de passe et le changement admin.

---

## Ajouter une fonctionnalité

### Nouveau modèle de données

1. Modifier `prisma/schema.prisma`
2. `pnpm db:migrate` (génère la migration + regénère le client)
3. Ajouter les requêtes dans `src/modules/<module>/queries.ts`
4. Ajouter les Server Actions dans `src/modules/<module>/actions.ts` (avec `withAudit`)
5. Créer les composants dans `src/components/<module>/` et les pages dans `src/app/(app)/`

### Nouvelle page protégée

Créer `src/app/(app)/ma-page/page.tsx`. Le proxy protège automatiquement tout ce qui est sous `(app)/`.

### Nouvelle catégorie de matériel

Depuis l'interface admin → Catégories, ou directement dans Prisma Studio (`pnpm db:studio`).

---

## Déploiement Docker (production)

### Prérequis

- Docker Engine 29+ et Docker Compose v2
- Un tunnel Cloudflare Zero Trust configuré (zéro port exposé sur la machine)
- Un compte Resend avec domaine vérifié (pour les emails de reset de mot de passe)

### Configuration

Créer `.env.production` (ne jamais commiter ce fichier) :

```env
DATABASE_URL="file:/data/piloti.db"
BETTER_AUTH_SECRET="<openssl rand -hex 32>"
BETTER_AUTH_URL="https://piloti.votre-domaine.fr"
TRAEFIK_DOMAIN="piloti.votre-domaine.fr"
CLOUDFLARE_TUNNEL_TOKEN="<token Zero Trust>"
RESEND_API_KEY="re_<votre-cle>"
RESEND_FROM_EMAIL="noreply@votre-domaine.fr"
```

### Lancer

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

Les migrations Prisma s'appliquent automatiquement au démarrage via le service `migrate`. L'application est accessible uniquement via le tunnel Cloudflare, sans aucun port exposé.

### Premier lancement en production

À la première ouverture dans le navigateur, l'application redirige vers `/setup` pour créer le compte administrateur. Aucun seed à lancer manuellement.

### Mise à jour

```bash
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d app
```

### Commandes utiles

```bash
docker compose --env-file .env.production logs -f app   # Logs en direct
docker compose --env-file .env.production down           # Arrêter (données conservées)
docker compose --env-file .env.production down -v        # Arrêter + effacer les données
```

### Architecture

```
Internet → Cloudflare CDN/WAF
        → cloudflared (tunnel sortant, pas de port entrant)
        → Traefik (reverse proxy interne, security headers)
        → Next.js (port 3000, réseau Docker isolé)
```

Réseaux Docker :
- `internal` (`internal: true`) — app ↔ Traefik uniquement, pas d'accès Internet
- `tunnel` — cloudflared ↔ Traefik

Volumes Docker :
- `piloti-data` — base SQLite (`/data/piloti.db`)
- `piloti-uploads` — photos d'incidents (`/app/public/uploads`)

---

## Notes techniques

- **Tailwind v4** : configuration CSS-first dans `src/app/globals.css` (`@theme inline`), pas de `tailwind.config.*`. Les tokens `bg-forest`, `text-earth`, `bg-primary` (shadcn) viennent tous du même bloc.
- **Prisma 7** : utilise l'adapter `better-sqlite3` au lieu du moteur Rust natif — plus léger en Docker, pas de binaire plateforme-spécifique.
- **better-auth** : gestion des sessions, hash scrypt des mots de passe, reset par email (Resend). Pas de plugin admin — les actions d'administration sont des Server Actions protégées par `can()`.
- **Audit** : `AuditLog` est immuable et transactionnel. Chaque mutation de données laisse une trace avec `userId`, `action`, et un champ `metadata` JSON libre.
