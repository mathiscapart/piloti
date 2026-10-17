# Audit de la gestion du temps

> Audit réalisé le 2026-10-17 sur `develop` (`2efd32b`, PR #191 fusionnée). Ce document ne modifie aucun code. Il répond à une question de Mathis : faut-il reconstruire la gestion des dates et des récurrences sur une bibliothèque, au lieu du code maison actuel ?
>
> La PR #196 (#195, débordement de fin de mois) est ouverte et en veille. Elle n'a été que **lue**.

## Synthèse

1. Le socle `src/lib/datetime.ts` (D-046) est **sain**. Sa sortie est identique sous les fuseaux serveur `UTC`, `Europe/Paris`, `America/New_York` et `Pacific/Kiritimati` (essai E1). Aux heures inexistantes et ambiguës du changement d'heure, il donne le même instant que luxon et Temporal (E1, E4).
2. Les bugs réels sont **sémantiques, pas arithmétiques** : débordement de fin de mois (#195), absence d'ancre de série, régénération le jour J alors que le retard ne compte qu'à J+1, deux règles de retard de prêt, `max(new Date())` figé au chargement, âge calculé dans le fuseau du serveur.
3. **Aucune bibliothèque ne corrige le problème de fond.** date-fns, luxon, dayjs et Temporal dérivent tous de la même façon que #196 (31/01 → 28/02 → 28/03) quand on enchaîne depuis l'échéance précédente (E4). rrule saute les mois trop courts (31/01 → 31/03 → 31/05). Seule une **ancre de série** évite la dérive, et c'est une décision de modèle de données, pas de bibliothèque.
4. **Recommandation : option (a)**, garder le code maison et livrer des correctifs ciblés en 4 à 5 PR. Aucune dépendance, pas de reconstruction. Une migration Prisma d'une colonne seulement si Mathis veut un « 31 du mois » sans dérive.

## Méthode et preuves

- Inventaire par `git grep` sur `src/`, `prisma/` et `scripts/`, hors `*.test.ts`. Motifs : `Date.UTC`, `setUTC*`, `getUTC*`, `wallNow`, `todayInput`, `instantToWall`, `wallToInstant`, `3_600_000`, `86_400_000`, `24 * 60 * 60 * 1000`, `Intl.DateTimeFormat`, `new Date()`, `Date.now()`, `RRULE`, `DTSTART`, ainsi que les importations de `@/lib/datetime`.
- Essais jetables, **hors du dépôt**, dans le dossier temporaire de session. Ils importent les vrais modules du dépôt (`node --experimental-strip-types` ou le `tsx` du dépôt). Les bibliothèques ont été installées dans un dossier séparé avec `pnpm add --ignore-scripts`. Aucune n'a été ajoutée au dépôt.

| Essai | Contenu |
|---|---|
| E1 | `advanceDate`, `wallToInstant`, `instantToWall`, `wallNow`, `todayInput`, `isOverdue`, `retentionCutoff`, exécutés sous 4 fuseaux `TZ`. Sortie identique (même empreinte md5). |
| E2 | `computeAge` (`src/lib/legal/age.ts`) avec une horloge figée, sous 3 fuseaux. |
| E3 | Motif zod `z.coerce.date().max(new Date())` construit au chargement, puis validé 1,5 s plus tard. |
| E4 | Comportement de date-fns, `@date-fns/utc`, `@date-fns/tz`, luxon, dayjs, rrule, temporal-polyfill, sous `TZ=UTC` et `TZ=America/New_York`. |
| E5 | Taille *bundle* minifiée et gzip (esbuild 0.28.2 du dépôt, `--platform=browser`), pour un usage type de chaque bibliothèque. |
| E6 | `buildTaskVMs` (`task-vm.ts`) et le prédicat du scheduler, horloge figée au 17/10/2026 10:00 à Paris. |
| E7 | `pnpm audit` sur les 8 paquets candidats, et `npm view` pour la version et la dernière modification du registre. |
| Base | `pnpm test` sur `develop` : 33 fichiers, **726 tests verts**. |

## 1. Inventaire

### 1.1 Les deux modèles

- **Heure murale** : l'heure saisie est stockée dans les composantes UTC d'un `Date`. Une date seule est stockée à minuit UTC. On la formate en UTC et on la compare à `wallNow()`.
- **Instant réel** : stocké avec `new Date()`, affiché en `Europe/Paris` via `formatInstant`.

| Colonne (`prisma/schema.prisma`) | Modèle |
|---|---|
| `Event.startDate`, `endDate`, `registrationDeadline` (l.417-425) | murale, date et heure |
| `Task.dueDate` (l.726) | murale, date seule |
| `Loan.startDate`, `expectedReturn` (l.265-266) | murale, date seule |
| `Expense.date` (l.528), `Campaign.deadline` (l.557), mouvements de caisse `date` (l.611), `Payment.paidAt` (l.656), `dropoffDate` (l.339) | murale, date seule |
| `User.birthDate` (l.35) | murale, date seule. Lue avec les getters **locaux** dans `age.ts` (voir B7) |
| `createdAt`, `updatedAt`, `returnedAt`, `resolvedAt`, `reviewedAt`, `reimbursedAt`, `doneAt`, `reminderSentAt`, `rejectedAt`, `ownerConsent*At`, `Poll.closesAt`, `expiresAt` | instant |

### 1.2 Le socle : `src/lib/datetime.ts` (147 lignes)

Ce fichier contient `formatWall`, `formatInstant`, `formatEventRange`, `monthKey`, `monthLabel`, `toDatetimeLocal`, `toDateInput`, `instantToWall`, `wallToInstant`, `wallNow` et `todayInput`. Il est couvert par `datetime.test.ts` (21 cas).

`datetime-usage.test.ts` (259 lignes) l'entoure d'un verrou textuel. Ce verrou interdit hors du socle `Intl.DateTimeFormat`, `toLocale*String`, les getters et setters locaux, `getTimezoneOffset`, `new Date(a, m, j)`, `toISOString().slice…` et les chaînes date-heure sans fuseau. **Il ne contrôle aucune importation de bibliothèque.** Un `format(d, "dd/MM")` de date-fns ou un `dayjs(d).format()` le traverserait sans échouer, alors que les deux formatent dans le fuseau du serveur. Point à retenir pour les options (b) à (e).

### 1.3 Fichiers qui consomment le socle (57 dans `src/` + `prisma/seed.ts`)

Toutes les lignes ci-dessous passent par le socle. **Risque faible**, sauf mention contraire (renvoi à un bug de la section 2).

| Domaine | Fichiers | Rôle | Modèle |
|---|---|---|---|
| Admin, audit, modération | `admin/audit/page.tsx`, `admin/inscriptions/page.tsx`, `admin/utilisateurs/page.tsx`, `moderation/page.tsx`, `admin/utilisateurs/[id]/modifier/page.tsx` (`toDateInput`) | affichage | instant ; murale pour `birthDate` |
| Dons | `admin/dons/page.tsx` | affichage | les deux |
| Communication | `annonces/page.tsx`, `communication/[slug]/ChannelView.tsx`, `messages/[userId]/ThreadView.tsx` | affichage | instant |
| Tableau de bord | `dashboard/page.tsx` (retard de prêt en jours, voir **B5**), `modules/dashboard/queries.ts` (`wallNow` contre `endDate`), `components/dashboard/NextEventCard.tsx` | comparaison et affichage | murale |
| Finances | `finances/bilan/page.tsx`, `bilan/export/route.ts`, `tableau-de-bord/page.tsx`, `modules/finance/dashboard.ts` (année de Paris, bornes `wallToInstant`, mois `instantToWall`) | agrégation par année et par mois | murale + instant |
| Finances, saisie | `caisses/AddMovementForm.tsx`, `caisses/CashBoxAdmin.tsx`, `cotisations/RecordPaymentRow.tsx`, `notes/ExpenseForm.tsx` (`todayInput`), `budget-actions.ts:293`, `campaign-actions.ts:128`, `cashbox-actions.ts:16` (`new Date(todayInput())`) | « aujourd'hui » à Paris | murale |
| Finances, affichage | `caisses/[id]/page.tsx`, `cotisations/[id]/page.tsx`, `cotisations/page.tsx`, `notes/page.tsx`, `notes/export/route.ts`, `planning/[id]/budget/TicketsSection.tsx` | affichage, export CSV | murale |
| Campagnes | `campaign-scheduler.ts:45` (`deadline < wallNow`, J+N en `ONE_DAY_MS`), `campaigns.ts:120` | relances, retard | murale |
| Lieux | `lieux/[id]/page.tsx`, `ReviewList.tsx`, `modifier/page.tsx`, `proprietaire/[token]/page.tsx` | affichage | les deux |
| Membres, pédagogie | `membres/[id]/page.tsx` (`wallNow` contre `expectedReturn`), `progression/ProgressionView.tsx`, `progression/bilan/page.tsx` | affichage | les deux |
| Prêts | `prets/[id]/retour/page.tsx`, `prets/nouveau/step1-details.tsx` (`wallNow + n × 24 h` : sans danger, l'heure murale UTC n'a pas d'heure d'été), `components/loans/LoanGroupCard.tsx` (**B5**), `inventory/loan-actions.ts:94`, `inventory/overdue.ts:26` (**B5**), `inventory/queries.ts:44,259,394` (**B5**) | retard, disponibilité | murale |
| Stock, incidents | `stock/[id]/page.tsx`, `components/incidents/IncidentCard.tsx` | affichage | les deux |
| Planning | `planning/page.tsx` (`monthKey`, `monthLabel`), `planning/[id]/page.tsx:86,127` (date limite et fin contre `wallNow`), `presences/page.tsx`, `planning/[id]/modifier/page.tsx` (`toDatetimeLocal`), `modules/planning/actions.ts:367`, `queries.ts:17,200`, `reminders.ts:18` (fenêtre de 48 h × `3_600_000`), `stats.ts:31`, `event-hooks.ts` | événements | murale |
| Tâches | `task-scheduler.ts:15,60` (**B3**, **B4**), `task-vm.ts:32-37` (**B3**) | récurrence, retard | murale |
| Seed | `prisma/seed.ts:1108` | année en cours | murale |

10 de ces fichiers sont des composants `"use client"`. Le socle part donc aussi dans le *bundle* navigateur, ce qui compte pour la taille des options.

### 1.4 Arithmétique et parsing hors du socle

| Fichier:ligne | Rôle | Modèle | Risque |
|---|---|---|---|
| `planning/recurrence.ts:9-25` `advanceDate` | occurrence suivante d'une tâche | murale, date seule | **B1** débordement, **B2** pas d'ancre |
| `planning/recurrence.ts:33-55` `nextOccurrenceData` | copie de la tâche, échéance avancée depuis la **précédente** | murale | **B2** |
| `planning/task-actions.ts:18-23` `parseDueDate` | `YYYY-MM-DD` → `Date.UTC` | murale | **B9** |
| `planning/actions.ts:32-37` `parseWallTime` | `datetime-local` → `Date.UTC` | murale | **B9** |
| `finance/actions.ts:29-33`, `finance/campaign-actions.ts:21-25`, `finance/cashbox-actions.ts:14-18`, `pedagogy/progression-actions.ts:76-80` | même parseur, recopié 4 fois | murale | **B9**, duplication |
| `inventory/types.ts:62,73,74,153` | `z.coerce.date()` sur `YYYY-MM-DD` (lu en UTC) | murale | **B9** |
| `inventory/availability.ts:9,15-17` `isOverdue` | en retard si `expectedReturn + 1 j ≤ now` | murale | **B5** |
| `inventory/overdue.ts:15,68-69` | jours de retard en `ONE_DAY_MS` | murale | faible |
| `inventory/queries.ts:251` | fenêtre « bientôt » `+ N × 24 h` | murale | faible |
| `finance/dashboard.ts:14-15,46,49,79-80` | bornes d'année `Date.UTC`, mois `getUTCMonth` | murale + instant | faible (E1 : `wallToInstant(1er janv.)` = `2025-12-31T23:00Z`) |
| `camp/places.ts:229`, `lieux/[id]/page.tsx:83` | `startDate.getUTCFullYear()` | murale | faible |
| `lib/audit-retention.ts:45-48` `retentionCutoff` | `setUTCFullYear(− n)` | instant | **B8**, bénin |
| `admin/rejected-retention.ts:6-12` | 30 j × `86 400 000` | instant | faible (durée réelle voulue) |
| `camp/owner-consent.ts:62-63,91,112` | durée de vie d'un lien en ms | instant | faible |
| `communication/poll-actions.ts:15,143` ; `CreatePollDialog.tsx:49` | `closesAt` : le `datetime-local` est converti en instant **par le navigateur** (`toISOString`) | instant | faible : dépend du fuseau du navigateur, voulu |
| `messages/MessagesUI.tsx:26`, `NotificationBell.tsx:19` | « il y a N s » | instant | faible |
| `lib/scheduler.ts:16,25,109-110` | `setInterval` toutes les 6 h par défaut | instant | contexte de **B4** |
| `lib/auth-rate-limit.ts:51,54` | fenêtres en secondes | instant | faible |
| `lib/legal/age.ts:30,69-80` `computeAge` | getters **locaux** et `new Date()` | murale lue comme locale | **B7** |
| `modules/admin/actions.ts:116-118` | `.max(new Date())` évalué au chargement du module | murale | **B6** |
| `lib/upload.ts:87` | dossier `AAAA/MM` | instant | exception documentée (D-046) |
| `api/calendar/[token]/route.ts:13-26,46,60-61` | iCal : `DTSTART` et `DTEND` flottants, `DTSTAMP` en Z | murale + instant | **I1** |
| `prisma/seed.ts:39`, `seed-branches.ts:26` | `DAY_MS` pour les données de démo | — | sans objet |

## 2. Bugs et incohérences réels

Chaque ligne est prouvée par une exécution, ou marquée « lecture de code » quand le chemin n'a pas pu être exécuté sans base ni serveur.

| # | Constat | Preuve | Gravité |
|---|---|---|---|
| **B1** | `advanceDate` déborde (#195). En mensuel, 31/01/2026 → **03/03/2026** et 31/03 → **01/05**. En chaîne depuis le 31/01, la série tombe le 3 de chaque mois (03/03, 03/04, 03/05…). En annuel, 29/02/2028 → **01/03/2029**. | E1 | moyenne : échéance décalée et définitivement fausse pour la série |
| **B2** | **Pas d'ancre de série.** L'occurrence suivante part de l'échéance précédente (`recurrence.ts:53-54`), et `Task` n'a ni `seriesId` ni jour d'ancrage (`schema.prisma:722-746`). Tout correctif par plafonnement dérive donc définitivement. C'est le cas de #196, qui le fige dans un test (« 31/01 → 28/02 → 28/03 »), mais aussi de date-fns, luxon, dayjs et Temporal (E4). Les séries déjà décalées par B1 sont **difficilement** récupérables : `dueDate` n'est pas dans l'audit (`task-actions.ts:85`), mais les occurrences passées restent en base (la génération ajoute une ligne, `task-scheduler.ts:44`) ; la plus ancienne garde le jour d'origine, rattachable par titre, récurrence et auteur faute de `seriesId` (non vérifié sur des données). | E4, diff #196, lecture de code | moyenne : décision produit |
| **B3** | Le scheduler régénère dès que `dueDate < wallNow()` (`task-scheduler.ts:20`), donc **à 00:00 à Paris le jour J**. La tâche n'est pourtant affichée « en retard » qu'à J+1 (`task-vm.ts:50`). Le jour de l'échéance, l'occurrence suivante existe déjà alors que la tâche courante est encore à faire. | E6 : régénère `true`, en retard `false`, le 17/10 à 10:00 pour une échéance au 17/10 | faible à moyenne |
| **B4** | Rattrapage : une passe ne génère qu'**une** occurrence par tâche échue. La nouvelle, si elle est déjà échue, attend la passe suivante (6 h par défaut, `scheduler.ts:16`). Après un arrêt long, une tâche quotidienne crée N tâches déjà échues, au rythme de 4 par jour. | lecture de code (`task-scheduler.ts:16-48`), **non exécuté** | faible |
| **B5** | **Deux règles de retard de prêt** (déjà signalé dans D-046, toujours présent). `overdue.ts:35`, `queries.ts:44,259`, `LoanGroupCard.tsx:21` et le tableau de bord considèrent le prêt en retard **dès 00:00 le jour du retour**, et l'alerte part ce jour-là (« en retard depuis aujourd'hui »). `availability.ts:15-17` ne le compte en retard qu'**à J+1**. | E1 : jour du retour à 10:00, `expectedReturn < now` = `true`, `isOverdue` = `false` | moyenne : alerte envoyée à tort le jour même |
| **B6** | `attestationDate: z.coerce.date().max(new Date())` (`admin/actions.ts:118`) fige « maintenant » au chargement du module. Sur un serveur démarré le 16/10, une attestation datée du 17/10 est refusée (« ne peut pas être dans le futur »), et c'est le cas de toute date postérieure au démarrage. `age.ts:24-31` avait déjà corrigé ce même motif. | E3 : même motif zod, date du jour **refusée** 1,5 s après le chargement. Le chemin réel (Server Action) n'a pas été exécuté. | moyenne : bloque la création d'un compte jeune |
| **B7** | `computeAge` lit la date de naissance avec les getters **locaux** du serveur. Pour une naissance le 17/10/2011 : en production (`TZ` non défini, donc UTC, non vérifié sur l'hôte), on a 14 ans à 00:30 à Paris le 17/10 et 15 ans sous `TZ=Europe/Paris`. Sous `America/New_York`, l'anniversaire est compté **la veille**. Ce code gouverne la connexion à 15 ans, la majorité et la messagerie privée (SAFE-01). | E2 | faible : fenêtre de 1 à 2 h, mais il s'agit de mineurs. Exception déjà connue de D-046 (« issue dédiée ») |
| **B8** | `retentionCutoff(1, 29/02/2028)` → 01/03/2027. | E1 | bénin : un jour de conservation en moins une fois tous les 4 ans |
| **B9** | Les parseurs `Date.UTC` et `z.coerce.date()` acceptent les dates impossibles : `2026-02-31` → 03/03/2026, `25:99` → 02:39 le lendemain. | exécution Node | faible : un `input type="date"` n'envoie pas cela, seule une requête forgée le peut |

**Ce qui n'est pas un bug (vérifié)**

- **Fuseau du serveur** : le socle est indépendant de `TZ` (E1, 4 fuseaux, sortie identique).
- **Changement d'heure** : `wallToInstant(29/03/2026 02:30)`, heure inexistante, donne `01:30Z`, soit 03:30 à Paris. C'est le même résultat que luxon et Temporal en mode `compatible` (E4). L'heure ambiguë `25/10 02:30` donne `01:30Z`, la seconde occurrence. `wallToInstant` ne sert de toute façon qu'aux bornes du 1er janvier à 00:00 (`finance/dashboard.ts:23`). `instantToWall` replie `00:30Z` et `01:30Z` du 25/10 sur la même heure murale 02:30 : c'est inhérent à l'heure murale, et sans effet sur les agrégations au mois.
- **Arithmétique en ms sur l'heure murale** (`+ n × 24 h`, `3_600_000`) : juste, car l'heure murale est en UTC, qui n'a pas d'heure d'été.
- **`advanceDate` perd l'heure** (`Date.UTC(y, m, d + n)`) : sans effet aujourd'hui, `Task.dueDate` étant une date seule. À garder en tête si les tâches reçoivent une heure.

**Récurrences : événements et tâches.** Les événements n'ont **aucune** récurrence (pas de colonne dans le modèle `Event`, `schema.prisma:413`, aucune occurrence de `RRULE` dans `src/`). La récurrence n'existe que pour les tâches : `NONE | DAILY | WEEKLY | MONTHLY | YEARLY` × `recurrenceEvery` (`enums.ts:278`), par **copie de ligne**, une occurrence à la fois.

**I1 : export iCal** (`api/calendar/[token]/route.ts`). Il n'exporte que les événements, pas les tâches. Les dates sont en heure **flottante**, sans `TZID` ni `VTIMEZONE`, et il n'y a pas de `RRULE`, ce qui est cohérent puisque les événements ne se répètent pas. L'heure flottante affiche la même heure murale quel que soit le fuseau de l'appareil. L'effet réel dans Google Calendar et Apple Calendar est **non vérifié**. Ajouter une `RRULE` n'aurait de sens que si des séries d'événements existaient. Pour les tâches, une `RRULE` créerait des occurrences fantômes sans ligne `Task`, donc sans inscription ni statut.

**Hors sujet, signalé sans être traité.** `task-scheduler.ts:40-44` (création de l'occurrence) et `:92-93` (`reminderSentAt`) écrivent sans `withAudit()`, contrairement à l'invariant de `CLAUDE.md` et au précédent de D-040, où la purge est attribuée au plus ancien ADMIN. Cela relève d'une issue séparée.

## 3. Options comparées

Chiffres mesurés le 2026-10-17 (E4, E5, E7). La colonne « gzip » donne le coût *bundle* d'un usage type (esbuild, minifié). « Dernière modif. » est le champ `time.modified` du registre npm.

| Paquet | Version | Licence | Dépendances | Sur disque | gzip, usage type | Dernière modif. | `pnpm audit` |
|---|---|---|---|---|---|---|---|
| socle actuel `datetime.ts` | — | — | 0 | — | 878 o (tout le fichier) | — | — |
| date-fns + @date-fns/utc (`addMonths`, `addDays`, `addYears`) | 4.4.0 / 2.1.1 | MIT | 0 | 20 Mo / 64 Ko | 878 o | 2026-05-29 / 2025-07-30 | aucune vulnérabilité |
| + @date-fns/tz | 1.5.0 | MIT | 0 | 184 Ko | 2,2 Ko | 2026-05-21 | aucune |
| luxon | 3.7.2 | MIT | 0 | 4,5 Mo | 21,9 Ko | 2025-09-05 | aucune |
| dayjs + `utc` + `timezone` | 1.11.23 | MIT | 0 | 1,9 Mo | 5,0 Ko | 2026-08-17 | aucune |
| rrule | 2.8.1 | BSD-3-Clause | tslib | 980 Ko | 13,6 Ko | **2023-11-10** (dernière version) | aucune |
| temporal-polyfill | 1.0.6 | MIT | 2 (`temporal-spec`, `temporal-utils`) | 1,1 Mo | 19,7 Ko | **2026-10-13** (4 jours) | aucune |
| @js-temporal/polyfill | 0.5.1 | ISC | jsbi | 3,0 Mo | 46,8 Ko | 2025-03-31 | aucune |

**Temporal natif** : `typeof Temporal === "undefined"` sur Node 22.23.3 (E4), la version de cette machine. L'image de production utilise la même version : `NODE_IMAGE_TAG="22.23.3-alpine3.24"` dans `.env.example`. Le `.env` de production est **non vérifié**.

**Comportement en fin de mois (E4)**, en enchaînant depuis l'échéance précédente comme le fait le code actuel :

| Implémentation | 31/01 +1 mois, trois fois |
|---|---|
| code actuel | 03/03, 03/04, 03/05 (**B1**) |
| #196 | 28/02, 28/03 (test du diff) |
| date-fns `addMonths` (`UTCDate`), luxon, dayjs, Temporal `PlainDate` | 28/02, 28/03, 28/04 |
| date-fns `addMonths(ancre, i)` | 28/02, **31/03**, **30/04** |
| rrule `FREQ=MONTHLY` (DTSTART 31/01) | **31/03, 31/05, 31/07** (saute les mois courts, RFC 5545) |
| rrule `BYMONTHDAY=-1` | 28/02, 31/03 (« dernier jour », une autre sémantique) |

En annuel, date-fns donne 29/02/2028 → 28/02/2029, comme #196.

### Fiche par option

**(a) Code maison + correctifs**
- Taille et maintenance : 0 dépendance, socle de 147 lignes et `recurrence.ts` de 56 lignes, déjà testés.
- Heure murale UTC : native.
- `datetime-usage.test.ts` : inchangé.
- Migration : aucune, sauf si l'on choisit l'ancre (`ALTER TABLE "Task" ADD COLUMN "recurrenceDay" INTEGER`, nullable, sans reconstruction de table). Les tâches existantes se remplissent en mode paresseux (`recurrenceDay ?? dueDate.getUTCDate()`), sans script.
- Fichiers touchés : 2 pour B1 (#196), +2 avec l'ancre (schéma, migration), 2 pour B3/B4, 4 à 5 pour B5, 1 pour B6, 1 pour B7 (+ `age.test.ts`), 6 à 7 pour B9 si l'on centralise le parseur dans le socle.
- Risque de régression : faible, chaque correctif est isolé et testé en TDD.
- Effort : 4 à 5 petites PR (estimation, non mesurée).
- Bénéfice : il corrige **tous** les bugs prouvés.
- Sécurité : rien de nouveau.
- DECISIONS.md : une entrée D-047, voir la section 4.

**(b) date-fns + @date-fns/utc (+ @date-fns/tz)**
- Taille et maintenance : 0 dépendance transitive, publications récentes, *tree-shaking* parfait (878 o, le même coût que le socle).
- Heure murale UTC : bonne, `UTCDate` lit les composantes UTC quel que soit le `TZ` (E4).
- Ce que ça remplace en pratique : environ 10 lignes de `advanceDate` et `instantToWall`/`wallToInstant` (via `TZDate`). L'API du socle peut rester la même, donc les 57 appelants ne bougent pas.
- **Ce que ça ne corrige pas** : B1 et B2 restent entiers (même dérive que #196), et B3 à B9 n'ont rien à voir avec une bibliothèque.
- `datetime-usage.test.ts` : à **étendre** avec une règle qui interdit `from "date-fns"`, `@date-fns/*` hors du socle. Sinon `format()` formaterait dans le fuseau du serveur sans être détecté.
- Migration : la même qu'en (a).
- Fichiers : 2 (socle, `recurrence.ts`) + le verrou + `package.json` et le lockfile.
- Risque : faible.
- Bénéfice : quasi nul par rapport à (a).
- DECISIONS.md : oui, pour l'ajout de dépendance.

**(c) Temporal (polyfill), luxon, dayjs**
- Taille : de 5 Ko (dayjs) à 47 Ko gzip (@js-temporal) dans le *bundle* navigateur, car 10 composants client importent le socle.
- Heure murale : Temporal a le bon modèle (`PlainDate`, `PlainDateTime`, `ZonedDateTime`), mais Prisma ne rend que des `Date`. Il faudrait convertir à chaque frontière, ou réécrire les 57 appelants pour manipuler des `Temporal.*`.
- temporal-polyfill 1.0.6 a été publié il y a 4 jours, la chaîne d'approvisionnement est donc à surveiller. Le Temporal natif est absent de Node 22.
- luxon et dayjs : même dérive (E4), et dayjs dépend de plugins à état global (`dayjs.extend`).
- Verrou : à étendre comme en (b).
- Migration : la même qu'en (a).
- Fichiers : de 2 (socle seul) à 58+ (adoption réelle).
- Risque : moyen à élevé selon la profondeur.
- Bénéfice : aucun bug prouvé n'est corrigé par la bibliothèque elle-même.
- DECISIONS.md : oui.

**(d) rrule / iCalendar**
- Maintenance : dernière version en **novembre 2023**, près de 3 ans sans publication, 13,6 Ko gzip, dépend de `tslib`.
- Sémantique **différente** (RFC 5545) : les mois sans 31 sont sautés, ce qui casserait la moitié des tests de #196 et changerait le comportement visible.
- Prérequis : un `DTSTART` d'ancrage, donc la même migration qu'en (a), plus une colonne `recurrenceRule String` qui remplace `recurrence` et `recurrenceEvery`, avec une migration de données.
- Fichiers : `recurrence.ts`, `task-actions.ts`, `task-scheduler.ts`, `task-vm.ts`, `tasks.ts`, `enums.ts`, `CreateTaskForm.tsx`, le schéma et la migration (liste de l'architecte, partiellement recoupée).
- Gain : la génération reste une copie de ligne. Une RRULE n'apporterait que l'expansion de séries, dont Piloti n'a pas besoin : 5 fréquences simples, aucun événement récurrent. Elle n'apporterait rien non plus à l'export iCal (voir I1).
- Risque : élevé pour un gain nul.
- DECISIONS.md : oui.

**(e) Reconstruction complète**
- Fichiers : 58 consommateurs du socle, 6 parseurs, l'iCal, le verrou et sa doc (D-046), soit environ 70 fichiers.
- Risque de régression : élevé. Seule la logique pure est testée unitairement : les Server Actions et les composants ne le sont pas (`CLAUDE.md` §4), et chaque parcours devrait être rejoué à la main.
- Bénéfice : aucun bug prouvé n'exige de reconstruction. Le socle D-046 tient sous 4 fuseaux.
- Effort : plusieurs semaines (estimation).
- DECISIONS.md : oui, avec amendement de D-046.

### Tableau de décision

| | (a) maison | (b) date-fns | (c) Temporal / luxon / dayjs | (d) rrule | (e) reconstruction |
|---|---|---|---|---|---|
| Bugs B1 à B9 corrigés | tous | B1 seulement (avec dérive) | B1 seulement (avec dérive) | B1, autre sémantique | tous, à grand coût |
| Dérive B2 | ancre (+1 colonne) | ancre (+1 colonne) | ancre (+1 colonne) | DTSTART (+1 à 2 colonnes) | ancre |
| Fichiers | ≈ 15, en 4 à 5 PR | ≈ 4 + (a) | 4 à 58 | ≈ 9 + migration de données | ≈ 70 |
| *Bundle* client | 0 | 0 à +1,3 Ko | +5 à +47 Ko | +13,6 Ko | variable |
| Verrou D-046 | inchangé | à étendre | à étendre | à étendre | à réécrire |
| Risque | faible | faible | moyen à élevé | élevé | élevé |

## 4. Recommandation

**Option (a) : garder le socle maison et corriger de façon ciblée.** Pas de bibliothèque, pas de reconstruction.

**Pourquoi**
1. Le socle D-046 est prouvé indépendant du fuseau du serveur et correct aux changements d'heure (E1, E4). Le reconstruire ne corrige rien.
2. Le seul calcul où une bibliothèque aide (ajouter des mois) tient en 3 lignes, et **toutes** les bibliothèques reproduisent la dérive de #196. Le vrai remède est l'ancre de série, qui relève du modèle de données.
3. Les autres bugs (B3 à B9) relèvent de règles métier ou de validation. Aucune bibliothèque ne les touche.
4. Chaque bibliothèque oblige à étendre le verrou statique, sinon `format()` réintroduit le fuseau du serveur. On gagnerait une dépendance de plus à surveiller, sans gain mesurable.

**Quand réévaluer** : si Piloti doit gérer des **événements récurrents** (séries, exceptions, export iCal en `RRULE`), ou des fuseaux multiples. Temporal deviendra le bon candidat quand il sera natif dans la version Node de l'image.

### Découpage en étapes livrables (une PR vers `develop` chacune)

| # | Branche | Contenu | Vérification observable |
|---|---|---|---|
| 1 | PR #196 existante | Plafonnement en fin de mois (B1), **après** la décision D1 | `pnpm test src/modules/planning/recurrence.test.ts` vert. Si D1 = ancre, le test « 28/02 → 28/03 » de #196 est à réécrire |
| 2 | `feat/planning-ancre-recurrence` (si D1 = ancre) | `Task.recurrenceDay Int?` + migration ; `advanceDate(…, anchorDay)` ; propagation dans `nextOccurrenceData` ; repli `?? dueDate.getUTCDate()` | TDD : 31/01 → 28/02 → **31/03** rouge puis vert ; `pnpm db:migrate` sur la base du worktree ; parcours réel : tâche mensuelle au 31/01, cocher, échéance au 28/02, cocher, échéance au 31/03 |
| 3 | `fix/planning-regeneration-taches` | B3 (régénérer à J+1, ou aligner l'affichage) et B4 (sauter à la prochaine échéance future), selon D2 et D3 | tests Vitest sur une fonction pure extraite (date de régénération, rattrapage) ; parcours réel du scheduler sur la base du worktree |
| 4 | `fix/prets-regle-retard` | B5 : une seule règle `isOverdue` utilisée partout (`overdue.ts`, `queries.ts`, `LoanGroupCard.tsx`, tableau de bord), selon D4 | test Vitest sur la règle ; parcours réel : prêt rendu prévu aujourd'hui, liste « retard » et alerte cohérentes |
| 5 | `fix/dates-validation` | B6 (`refine` évalué à la validation, comme `age.ts`) ; B7 (`computeAge` en composantes UTC et jour de Paris via `todayInput`) ; B9 (un `parseDateInput` unique dans le socle, qui refuse le 31/02) | TDD sur `age.test.ts` et `datetime.test.ts` ; parcours réel : création d'un compte jeune avec l'attestation du jour |
| 6 | dans la PR 2 ou 3 | Entrée **D-047** dans `DECISIONS.md` : pas de bibliothèque de dates, sémantique de récurrence retenue (ancre, régénération, rattrapage) | relecture humaine |

L'audit sans `withAudit()` du scheduler de tâches (section 2, hors sujet) mérite une issue séparée.

### Ce qui exige une décision de Mathis

- **D1. Le « 31 du mois ».** Trois possibilités : plafonner avec dérive (#196 tel quel, 31/01 → 28/02 → 28/03) ; plafonner sans dérive (ancre `recurrenceDay`, 31/01 → 28/02 → 31/03, une migration) ; ou une règle « dernier jour du mois » quand l'origine en était un (sans migration, mais ambiguë : une tâche du 30/04 passerait au 31/05). Le sort de #196 en dépend.
- **D2. Le moment de la régénération.** Faut-il générer l'occurrence suivante à 00:00 le jour J (comportement actuel), au lendemain, ou seulement quand la tâche est cochée ?
- **D3. Le rattrapage.** Faut-il générer toutes les occurrences manquées, une seule par passe (comportement actuel), ou sauter directement à la prochaine échéance future ?
- **D4. Le retard d'un prêt.** Commence-t-il le jour du retour (alerte actuelle) ou le lendemain (règle de disponibilité) ?
- **D5. Les séries déjà décalées par B1.** Faut-il les rechercher en production (tâches `MONTHLY` ou `YEARLY` dont le jour d'échéance a glissé) et les corriger, en retrouvant le jour d'origine sur la plus ancienne occurrence de chaque série ? Leur existence est **non vérifiée** : je n'ai pas accès à la base de production.

## Limites de cet audit

- Aucun accès à la base de production : la présence de séries touchées par B1 et le `TZ` réel du conteneur (supposé UTC, aucun `TZ` dans `Dockerfile` ni `docker-compose*.yml`) sont **non vérifiés**.
- Serveur non lancé (contrainte mémoire). B4 et le chemin Server Action de B6 sont établis par lecture de code et par un essai du même motif, pas par un parcours réel.
- Le rendu de l'heure flottante iCal dans les applications d'agenda est **non vérifié**.
- Les efforts sont des estimations, pas des mesures.
