import "dotenv/config";

import { randomBytes } from "node:crypto";

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import type { AccountStatus, Role, Unit } from "../src/lib/enums";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal/versions";
import { canonicalPair } from "../src/modules/communication/dm";
import { resolveConcernedUnit } from "../src/modules/communication/moderation-policy";
import { computeTiers } from "../src/modules/finance/tiers";

// === Garde-fou ===
// Ce script commence par un `deleteMany()` en cascade : il DÉTRUIT la base
// visée. Prod et staging partagent le même `DATABASE_URL` (`file:/data/piloti.db`),
// donc le chemin ne permet pas de les distinguer — un `--env-file` de travers
// suffisait à vider la prod. On exige donc une intention explicite dès que la
// cible n'est pas la base de développement locale.
function assertSafeToSeed(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocalDev = url.includes("dev.db");
  if (isLocalDev || process.env.SEED_CONFIRM === "1") return;
  throw new Error(
    `Seed refusé : DATABASE_URL="${url}" n'est pas la base de développement locale.\n` +
      "Ce script EFFACE toutes les données de la base visée.\n" +
      "Si c'est bien l'intention (staging), relancer avec SEED_CONFIRM=1.",
  );
}

// Mot de passe des comptes factices. Jamais committé : fourni par
// `SEED_PASSWORD`, sinon généré aléatoirement et affiché en fin de seed.
const SEED_PASSWORD =
  process.env.SEED_PASSWORD ?? `${randomBytes(12).toString("base64url")}aA1!`;

// === Helpers ===
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365.25 * DAY_MS;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY_MS);
const yearsAgo = (y: number) => new Date(now - y * YEAR_MS);

// Générateur pseudo-aléatoire DÉTERMINISTE (mulberry32). Un jeu de données qui
// change à chaque exécution rend tout rapport de bug irreproductible : « chez
// moi le prêt en retard n'existe pas » devient impossible à trancher. Même
// graine, même base, sur toutes les machines et tous les déploiements staging.
function makeRandom(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRandom(20260824);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;

const FIRST_NAMES_F = [
  "Camille", "Louise", "Jeanne", "Alice", "Clara", "Éléonore", "Marion", "Sixtine",
  "Anaïs", "Blandine", "Garance", "Maëlle", "Solène", "Apolline", "Roseline",
] as const;
const FIRST_NAMES_M = [
  "Antoine", "Baptiste", "Hugo", "Timothée", "Corentin", "Gaspard", "Basile",
  "Aymeric", "Clément", "Martin", "Léonard", "Augustin", "Firmin", "Vianney",
] as const;
const LAST_NAMES = [
  "Lefebvre", "Delattre", "Dubois", "Carpentier", "Leroy", "Vandenberghe",
  "Bouchez", "Delcourt", "Legrand", "Mercier", "Descamps", "Wallez",
] as const;

/**
 * Branche d'un jeune d'après son âge.
 *
 * Utilisé pour répartir la trentaine de membres générés plus bas. Les tranches
 * officielles figurent dans `UNIT_LABEL` (src/lib/enums.ts) : Farfadets 6-8,
 * Louveteaux-Jeannettes 8-11, Scouts-Guides 11-14, Pionniers-Caravelles 14-17,
 * Compagnons 17-21.
 *
 * Renvoie `null` si l'âge ne correspond à aucune branche de jeunes — l'appelant
 * traite alors la personne comme un adulte (`ADULTES`).
 */
function unitForAge(age: number): Unit | null {
  // Les tranches de `UNIT_LABEL` se chevauchent aux bornes (6-8, 8-11, 11-14…).
  // On tranche comme sur le terrain : à l'âge de passage, le jeune part dans la
  // branche SUPÉRIEURE — 8 ans est louveteau, pas farfadet.
  //
  // Les deux extrémités renvoient `null` plutôt qu'une branche par défaut : un
  // âge hors périmètre est une donnée à traiter, pas à ranger silencieusement.
  if (age < 6) return null;
  if (age < 8) return "FARFADETS";
  if (age < 11) return "LOUVETEAUX";
  if (age < 14) return "SCOUTS";
  if (age < 17) return "PIONNIERS";
  if (age < 21) return "COMPAGNONS";
  return null;
}

/**
 * Compte enfant SANS connexion (US-CM-01, D-026) : la fiche existe pour être
 * rattachée à une progression, un prêt, une présence — mais elle n'a ni mot de
 * passe ni ligne `Account`, donc aucun moyen de se connecter. On ne passe donc
 * PAS par better-auth, contrairement à `seedUser`.
 *
 * L'email est un placeholder `@piloti.invalid` : même convention que
 * `createChildAccount` (src/modules/admin/actions.ts), qui rebascule `canLogin`
 * à `true` le jour où un vrai email le remplace.
 */
async function seedChild(input: {
  firstName: string;
  lastName: string;
  birthDate: Date;
  unit: Unit;
}) {
  return db.user.create({
    data: {
      email: `enfant-${input.firstName}.${input.lastName}-${randInt(1000, 9999)}@piloti.invalid`.toLowerCase(),
      name: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      unit: input.unit,
      role: "SCOUT",
      roles: JSON.stringify(["SCOUT"]),
      status: "ACTIVE",
      emailVerified: false,
      canLogin: false,
    },
  });
}

interface SeedUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: AccountStatus;
  // SAFE-01 (D-023) — obligatoire : un compte ACTIVE sans date de naissance
  // est traité comme une anomalie de données, pas comme un profil à compléter.
  // Le proxy refuse la session et renvoie sur /login (il n'existe plus d'écran
  // de complétion) : sans date ici, aucun compte seedé n'est utilisable en
  // développement.
  birthDate: Date;
  unit?: Unit;
  phone?: string;
  // US-32 — « casquettes » supplémentaires cumulées au rôle principal (ex. un
  // chef également trésorier). `role` reste le rôle principal affiché.
  extraRoles?: Role[];
}

/**
 * Crée un user via better-auth (hash password via scrypt + crée la row Account),
 * puis met à jour role / status / emailVerified (champs `input: false`).
 */
async function seedUser(input: SeedUserInput) {
  await auth.api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
  });
  return db.user.update({
    where: { email: input.email },
    data: {
      // US-32 — rôles unifiés : `roles` est la source ; `role` reste un miroir.
      role: input.role,
      roles: JSON.stringify([input.role, ...(input.extraRoles ?? [])]),
      status: input.status,
      emailVerified: input.status === "ACTIVE",
      // SEC-08 (Vuln 2) — `unit` est `input: false` côté better-auth.
      unit: input.unit,
      // SAFE-01 — `birthDate` est `input: false` également (elle ne doit jamais
      // être settable par le titulaire) : elle s'écrit ici, après le signup.
      birthDate: input.birthDate,
    },
  });
}

async function main() {
  assertSafeToSeed();

  console.log("→ Seed Piloti : reset en cours…");

  // Reset. Deux propriétés, apprises à la dure : la liste doit être EXHAUSTIVE,
  // et l'ensemble doit être ATOMIQUE.
  //
  // Exhaustive — la version précédente ne citait que neuf tables, écrites quand
  // le schéma n'en comptait pas davantage. `Message`, `DirectMessage`, `Report`,
  // `Consent` et `FamilyLink` sont arrivées ensuite (SAFE-02, communication,
  // RGPD-02) sans être ajoutées ici. Sur une base vierge le manque ne se voit
  // pas ; sur une base qui contient des messages, `user.deleteMany()` viole une
  // clé étrangère et le script meurt.
  //
  // Atomique — et il meurt APRÈS avoir déjà vidé le journal d'audit. Une série
  // de `deleteMany()` hors transaction laisse la base à mi-chemin : c'est le
  // pire état possible, ni l'ancien ni le nouveau. Le `$transaction` applique
  // ici le raisonnement de `withAudit()` (cf. CLAUDE.md) au reset lui-même.
  //
  // EXCLUES VOLONTAIREMENT — `Category`, `ChannelCategory` et `Channel` ne sont
  // pas des données de seed : ce sont les données de RÉFÉRENCE posées par la
  // migration `20260723212606_restore_default_data` (D-019/D-021), en
  // `INSERT OR IGNORE`. Les effacer ici les perdrait définitivement, car
  // `migrate deploy` ne rejoue pas une migration déjà appliquée — l'app
  // repartirait sans aucune catégorie d'inventaire ni aucun salon. Ne pas
  // « compléter » la liste avec elles.
  //
  // Ordre : du plus dépendant vers le moins dépendant.
  await db.$transaction([
    // Communication
    db.messageReaction.deleteMany(),
    db.channelRead.deleteMany(),
    db.channelMute.deleteMany(),
    db.pollVote.deleteMany(),
    db.poll.deleteMany(),
    db.message.deleteMany(),
    db.announcementRead.deleteMany(),
    db.announcement.deleteMany(),
    db.directMessage.deleteMany(),
    db.conversation.deleteMany(),
    db.report.deleteMany(),
    // Notifications
    db.notification.deleteMany(),
    db.pushSubscription.deleteMany(),
    db.notificationPreference.deleteMany(),
    // Pédagogie
    db.stepValidation.deleteMany(),
    db.badgeAward.deleteMany(),
    db.pedagogicalGoal.deleteMany(),
    db.pedagogicalNote.deleteMany(),
    db.badge.deleteMany(),
    db.progressionStep.deleteMany(),
    // Planning
    db.taskSignup.deleteMany(),
    db.task.deleteMany(),
    db.attendance.deleteMany(),
    db.eventRegistration.deleteMany(),
    db.eventReminder.deleteMany(),
    // Finances
    db.campaignPayment.deleteMany(),
    db.campaignReminder.deleteMany(),
    db.campaignExemption.deleteMany(),
    db.campaignSocialCase.deleteMany(),
    db.campaign.deleteMany(),
    db.cashTransaction.deleteMany(),
    db.cashBox.deleteMany(),
    db.expense.deleteMany(),
    db.budgetLine.deleteMany(),
    db.donation.deleteMany(),
    // Lieux de camp
    db.campPlaceReview.deleteMany(),
    db.campPlace.deleteMany(),
    // Inventaire
    db.incident.deleteMany(),
    db.loan.deleteMany(),
    db.equipment.deleteMany(),
    // Planning (l'événement porte prêts et dépenses, donc après eux)
    db.event.deleteMany(),
    // Comptes et traces
    db.familyLink.deleteMany(),
    db.consent.deleteMany(),
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.account.deleteMany(),
    db.verification.deleteMany(),
    db.user.deleteMany(),
    // `User.socialBracketId` pointe ici : les brackets partent après les users.
    db.socialBracket.deleteMany(),
  ]);

  console.log("→ Création des utilisateurs (via better-auth)…");
  const admin = await seedUser({
    email: "admin@piloti.fr",
    password: SEED_PASSWORD,
    firstName: "Admin",
    lastName: "Piloti",
    birthDate: new Date("1985-02-14"),
    role: "ADMIN",
    status: "ACTIVE",
  });

  const thomas = await seedUser({
    email: "thomas.martin@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Thomas",
    lastName: "Martin",
    birthDate: new Date("1990-03-12"),
    role: "CHEF",
    status: "ACTIVE",
    unit: "PIONNIERS",
    phone: "06 12 34 56 78",
  });

  const julie = await seedUser({
    email: "julie.bernard@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Julie",
    lastName: "Bernard",
    birthDate: new Date("1992-07-30"),
    role: "CHEF",
    status: "ACTIVE",
    unit: "SCOUTS",
    phone: "06 98 76 54 32",
  });

  const paul = await seedUser({
    email: "paul.durand@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Paul",
    lastName: "Durand",
    birthDate: new Date("2004-11-05"),
    role: "CHEF",
    status: "PENDING",
    unit: "COMPAGNONS",
    phone: "06 11 22 33 44",
  });

  console.log("→ Création du matériel…");
  const canadienne1 = await db.equipment.create({
    data: {
      name: "Tente Canadienne 4p #1",
      category: "TENTE",
      totalQty: 1,
      condition: "BON",
      location: "Local Scouts",
      notes: "Achat 2022, état correct.",
    },
  });

  const canadienne2 = await db.equipment.create({
    data: {
      name: "Tente Canadienne 4p #2",
      category: "TENTE",
      totalQty: 1,
      condition: "BON",
      location: "Local Scouts",
    },
  });

  const igloo = await db.equipment.create({
    data: {
      name: "Tente Igloo 6p #1",
      category: "TENTE",
      totalQty: 1,
      condition: "USE",
      location: "Local Pionniers",
      notes: "Beaucoup utilisée, piquets fragiles.",
    },
  });

  const marabout = await db.equipment.create({
    data: {
      name: "Tente Marabout 8p",
      category: "TENTE",
      totalQty: 1,
      condition: "A_REPARER",
      location: "Local commun",
    },
  });

  const malleCuisine = await db.equipment.create({
    data: {
      name: "Malle cuisine Scouts",
      category: "MALLE",
      totalQty: 1,
      condition: "BON",
      location: "Local Scouts",
    },
  });

  await db.equipment.create({
    data: {
      name: "Malle bivouac Pionniers",
      category: "MALLE",
      totalQty: 1,
      condition: "BON",
      location: "Local Pionniers",
    },
  });

  const rechaud = await db.equipment.create({
    data: {
      name: "Réchaud Camping Gaz",
      category: "CUISINE",
      totalQty: 2,
      condition: "BON",
      location: "Malle cuisine Scouts",
    },
  });

  await db.equipment.create({
    data: {
      name: "Lot sardines + tendeurs",
      category: "BIVOUAC",
      totalQty: 50,
      condition: "BON",
      location: "Local commun",
    },
  });

  await db.equipment.create({
    data: {
      name: "Corde Dyneema 30m",
      category: "BIVOUAC",
      totalQty: 1,
      condition: "NEUF",
      location: "Local commun",
      notes: "Achat janvier 2026.",
    },
  });

  const molkky = await db.equipment.create({
    data: {
      name: "Mölkky bois",
      category: "JEU",
      totalQty: 1,
      condition: "BON",
      location: "Local Scouts",
    },
  });

  console.log("→ Création des prêts (2 actifs + 2 retard + 1 séchage)…");
  await db.loan.create({
    data: {
      equipmentId: canadienne1.id,
      borrowerId: thomas.id,
      quantity: 1,
      startDate: daysFromNow(-1),
      expectedReturn: daysFromNow(5),
      status: "ACTIF",
      eventName: "Week-end Pios 9/10",
    },
  });

  await db.loan.create({
    data: {
      equipmentId: molkky.id,
      borrowerId: julie.id,
      quantity: 1,
      startDate: daysFromNow(-2),
      expectedReturn: daysFromNow(3),
      status: "ACTIF",
      eventName: "Réunion Bleus",
    },
  });

  await db.loan.create({
    data: {
      equipmentId: igloo.id,
      borrowerId: julie.id,
      quantity: 1,
      startDate: daysFromNow(-7),
      expectedReturn: daysFromNow(-2),
      status: "RETARD",
      eventName: "Week-end Bleus 2/3",
    },
  });

  await db.loan.create({
    data: {
      equipmentId: malleCuisine.id,
      borrowerId: thomas.id,
      quantity: 1,
      startDate: daysFromNow(-10),
      expectedReturn: daysFromNow(-3),
      status: "RETARD",
      eventName: "Camp Pios — préparation",
    },
  });

  const loanSechage = await db.loan.create({
    data: {
      equipmentId: canadienne2.id,
      borrowerId: thomas.id,
      quantity: 1,
      startDate: daysFromNow(-1),
      expectedReturn: daysFromNow(2),
      status: "SECHAGE",
      eventName: "Week-end Pios 9/10",
      dryingLocation: "chez Thomas Martin",
      dryingPersonName: "Thomas Martin",
    },
  });

  await db.loan.create({
    data: {
      equipmentId: molkky.id,
      borrowerId: thomas.id,
      quantity: 1,
      startDate: daysFromNow(-30),
      expectedReturn: daysFromNow(-25),
      returnedAt: daysFromNow(-26),
      returnedById: admin.id,
      status: "RETOURNE",
      eventName: "Soirée jeux",
    },
  });

  console.log("→ Création des dons de matériel (2 en attente, 1 accepté, 1 refusé)…");
  await db.donation.createMany({
    data: [
      {
        category: "CUISINE",
        name: "Gamelles inox (lot de 8)",
        quantity: 8,
        condition: "BON",
        dropoffDate: daysFromNow(10),
        donorName: "Famille Lefebvre",
        note: "Ne servent plus, enfants trop grands pour le mouvement.",
        status: "PENDING",
      },
      {
        category: "BIVOUAC",
        name: "Bâche de sol 4x6",
        quantity: 2,
        condition: "USE",
        donorName: "Anonyme",
        status: "PENDING",
      },
      {
        category: "JEU",
        name: "Jeu de société — Loup Garou",
        quantity: 1,
        condition: "BON",
        donorId: julie.id,
        status: "APPROVED",
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-3),
      },
      {
        category: "TENTE",
        name: "Toile de tente 2p percée",
        quantity: 1,
        condition: "HORS_SERVICE",
        donorName: "M. Descamps",
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-1),
        rejectedReason: "Matériel hors d'usage, réparation non rentable.",
      },
    ],
  });

  console.log("→ Création des incidents (1 bloquant + 1 gênant + 1 résolu)…");
  const incidentBloquant = await db.incident.create({
    data: {
      equipmentId: marabout.id,
      reporterId: thomas.id,
      types: JSON.stringify(["TENTE_TOILE", "TENTE_FERMETURE"]),
      severity: "BLOQUANT",
      notes:
        "Déchirure d'environ 30cm à l'avant + fermeture éclair principale cassée. Inutilisable pour le prochain camp.",
    },
  });

  await db.incident.create({
    data: {
      equipmentId: igloo.id,
      reporterId: julie.id,
      types: JSON.stringify(["TENTE_PIQUET", "TENTE_TENDEUR"]),
      severity: "GENANT",
      notes: "3 piquets tordus et 2 tendeurs cassés au retour du week-end Bleus.",
    },
  });

  await db.incident.create({
    data: {
      equipmentId: rechaud.id,
      reporterId: thomas.id,
      types: JSON.stringify(["CUISINE_RECHAUD"]),
      severity: "MINEUR",
      notes: "Valve un peu dure à l'allumage.",
      resolvedAt: daysFromNow(-5),
      resolvedById: admin.id,
      resolvedNote: "Vérifié, RAS — fonctionne correctement après nettoyage.",
    },
  });

  console.log("→ Création de l'historique d'audit…");
  await db.auditLog.createMany({
    data: [
      {
        action: "USER_REGISTERED",
        userId: admin.id,
        metadata: JSON.stringify({ email: admin.email }),
        createdAt: new Date(now - 30 * DAY_MS),
      },
      {
        action: "USER_REGISTERED",
        userId: thomas.id,
        metadata: JSON.stringify({ email: thomas.email }),
        createdAt: new Date(now - 25 * DAY_MS),
      },
      {
        action: "USER_REGISTERED",
        userId: julie.id,
        metadata: JSON.stringify({ email: julie.email }),
        createdAt: new Date(now - 20 * DAY_MS),
      },
      {
        action: "EQUIPMENT_CREATED",
        userId: admin.id,
        equipmentId: marabout.id,
        metadata: JSON.stringify({ name: marabout.name }),
        createdAt: new Date(now - 15 * DAY_MS),
      },
      {
        action: "INCIDENT_REPORTED",
        userId: thomas.id,
        equipmentId: marabout.id,
        incidentId: incidentBloquant.id,
        metadata: JSON.stringify({ severity: "BLOQUANT" }),
        createdAt: new Date(now - 6 * DAY_MS),
      },
      {
        action: "LOAN_DRYING_STARTED",
        userId: thomas.id,
        equipmentId: canadienne2.id,
        loanId: loanSechage.id,
        metadata: JSON.stringify({
          dryingLocation: "chez Thomas Martin",
          dryingPersonName: "Thomas Martin",
        }),
        createdAt: new Date(now - 1 * DAY_MS),
      },
    ],
  });

  // =========================================================================
  // Cohorte de groupe — volume et formes réalistes.
  //
  // Objet : donner à l'app de quoi ressembler à un vrai groupe, pour que les
  // écrans de liste, les filtres, les totaux et les cas limites (prêt en
  // retard, cotisation partielle, note de frais refusée) soient exerçables.
  // Tout ce qui suit est DÉTERMINISTE : même graine, même jeu de données.
  // =========================================================================
  console.log("→ Création des familles et des jeunes…");

  const chefs: { id: string; unit: Unit }[] = [];
  const jeunes: { id: string; unit: Unit }[] = [];
  // US-F01 — liens parent↔jeune, gardés en mémoire pour calculer le tarif
  // « 2e enfant » (computeTiers) sans re-requêter la base.
  const familyLinks: { parentId: string; childId: string }[] = [];
  // US-C03 — parents connectés, réutilisés plus bas pour des lectures d'annonce
  // cohérentes avec l'audience PARENTS.
  const parentIds: string[] = [];

  // Un chef par branche de jeunes, en plus de l'équipe créée plus haut. Le
  // chef des Farfadets porte en plus la casquette TRESORIER (US-29) : sans un
  // seul compte multi-rôles dans le jeu de données, rien n'exerce le cumul.
  const BRANCHES: readonly Unit[] = ["FARFADETS", "LOUVETEAUX", "SCOUTS", "PIONNIERS", "COMPAGNONS"];
  for (const [i, unit] of BRANCHES.entries()) {
    const chef = await seedUser({
      email: `chef.${unit.toLowerCase()}@piloti.fr`,
      password: SEED_PASSWORD,
      firstName: i % 2 === 0 ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M),
      lastName: pick(LAST_NAMES),
      birthDate: yearsAgo(randInt(21, 45)),
      role: "CHEF",
      status: "ACTIVE",
      unit,
      phone: `06${randInt(10000000, 99999999)}`,
      extraRoles: unit === "FARFADETS" ? ["TRESORIER"] : undefined,
    });
    chefs.push({ id: chef.id, unit });
  }

  console.log("→ Création des comptes de rôles fonctionnels (US-29)…");

  // Un compte par « casquette » fonctionnelle restante (RESPONSABLE_GROUPE,
  // RESPONSABLE_MATERIEL, SECRETAIRE, MEMBRE_LOCAL) : sans eux, la matrice de
  // permissions (src/lib/permissions.ts) n'est recettable que pour ADMIN/CHEF.
  // TRESORIER est déjà couvert ci-dessus (compte multi-rôles).
  const FUNCTIONAL_ROLES: readonly Role[] = [
    "RESPONSABLE_GROUPE",
    "RESPONSABLE_MATERIEL",
    "SECRETAIRE",
    "MEMBRE_LOCAL",
  ];
  const roleAccountSlug: Record<string, string> = {
    RESPONSABLE_GROUPE: "rg",
    RESPONSABLE_MATERIEL: "materiel",
    SECRETAIRE: "secretaire",
    MEMBRE_LOCAL: "membre.local",
  };
  for (const [i, role] of FUNCTIONAL_ROLES.entries()) {
    await seedUser({
      email: `${roleAccountSlug[role]}@example.invalid`,
      password: SEED_PASSWORD,
      firstName: i % 2 === 0 ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M),
      lastName: pick(LAST_NAMES),
      birthDate: yearsAgo(randInt(30, 55)),
      role,
      status: "ACTIVE",
      unit: "ADULTES",
      phone: `01990012${randInt(10, 99)}`,
    });
  }

  // Douze familles : un parent connecté, un à trois enfants rattachés.
  for (let f = 0; f < 12; f++) {
    const lastName = pick(LAST_NAMES);
    const parentFirst = chance(0.5) ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
    const parent = await seedUser({
      email: `parent${f + 1}@example.invalid`,
      password: SEED_PASSWORD,
      firstName: parentFirst,
      lastName,
      birthDate: yearsAgo(randInt(35, 52)),
      role: "PARENT",
      status: "ACTIVE",
      phone: `06${randInt(10000000, 99999999)}`,
    });
    parentIds.push(parent.id);

    for (let c = 0; c < randInt(1, 3); c++) {
      const age = randInt(6, 20);
      const unit = unitForAge(age) ?? "ADULTES";
      const firstName = chance(0.5) ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
      const birthDate = yearsAgo(age);

      // US-CM-01 / D-026 — sous 15 ans, aucune connexion possible : la fiche
      // est créée par un tiers, sans ligne `Account`. Au-dessus, compte normal.
      const child =
        age < 15
          ? await seedChild({ firstName, lastName, birthDate, unit })
          : await seedUser({
              email: `jeune-${f + 1}-${c + 1}@example.invalid`,
              password: SEED_PASSWORD,
              firstName,
              lastName,
              birthDate,
              role: "SCOUT",
              status: "ACTIVE",
              unit,
            });

      await db.familyLink.create({ data: { parentId: parent.id, childId: child.id } });
      familyLinks.push({ parentId: parent.id, childId: child.id });

      // RGPD-02 amendé (D-026) — tout mineur a une attestation parentale, posée
      // par le parent créateur et non auto-déclarée par le jeune lui-même.
      await db.consent.create({
        data: {
          userId: child.id,
          type: age < 18 ? "PARENTAL" : "SELF",
          privacyVersion: PRIVACY_VERSION,
          termsVersion: TERMS_VERSION,
          guardianName: age < 18 ? `${parentFirst} ${lastName}` : null,
          acceptedAt: daysFromNow(-randInt(30, 300)),
        },
      });

      // US-C08 — droit à l'image : les trois positions sont représentées, refus
      // compris, sans quoi l'écran de gestion n'a jamais de cas intéressant.
      await db.consent.create({
        data: {
          userId: child.id,
          type: "IMAGE_RIGHTS",
          privacyVersion: PRIVACY_VERSION,
          value: pick(["OUI", "OUI", "OUI", "RESTREINT_INTERNE", "NON"] as const),
          acceptedAt: daysFromNow(-randInt(30, 300)),
        },
      });

      jeunes.push({ id: child.id, unit });
    }
  }

  // Famille garantie : la boucle aléatoire ci-dessus ne garantit pas de
  // couverture précise par branche/âge. Ces trois comptes assurent, sans
  // dépendre du tirage, au moins un jeune connectable en Pionniers ET en
  // Compagnons, et un enfant sans connexion rattaché à un parent — des
  // identifiants stables, utiles pour la recette et la vérification automatisée.
  const familleTestParent = await seedUser({
    email: "parent.test@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Nadège",
    lastName: "Vasseur",
    birthDate: yearsAgo(42),
    role: "PARENT",
    status: "ACTIVE",
    phone: "01 99 00 45 67",
  });

  const jeunePionnier = await seedUser({
    email: "jeune.pionnier@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Élise",
    lastName: "Vasseur",
    birthDate: yearsAgo(16),
    role: "SCOUT",
    status: "ACTIVE",
    unit: "PIONNIERS",
  });

  const jeuneCompagnon = await seedUser({
    email: "jeune.compagnon@example.invalid",
    password: SEED_PASSWORD,
    firstName: "Robin",
    lastName: "Vasseur",
    birthDate: yearsAgo(19),
    role: "SCOUT",
    status: "ACTIVE",
    unit: "COMPAGNONS",
  });

  const enfantLouveteau = await seedChild({
    firstName: "Iris",
    lastName: "Vasseur",
    birthDate: yearsAgo(9),
    unit: "LOUVETEAUX",
  });

  for (const [child, age] of [
    [jeunePionnier, 16],
    [jeuneCompagnon, 19],
    [enfantLouveteau, 9],
  ] as const) {
    await db.familyLink.create({ data: { parentId: familleTestParent.id, childId: child.id } });
    familyLinks.push({ parentId: familleTestParent.id, childId: child.id });
    await db.consent.create({
      data: {
        userId: child.id,
        type: age < 18 ? "PARENTAL" : "SELF",
        privacyVersion: PRIVACY_VERSION,
        termsVersion: TERMS_VERSION,
        guardianName: age < 18 ? "Nadège Vasseur" : null,
        acceptedAt: daysFromNow(-randInt(30, 300)),
      },
    });
    await db.consent.create({
      data: {
        userId: child.id,
        type: "IMAGE_RIGHTS",
        privacyVersion: PRIVACY_VERSION,
        value: "OUI",
        acceptedAt: daysFromNow(-randInt(30, 300)),
      },
    });
  }

  jeunes.push({ id: jeunePionnier.id, unit: "PIONNIERS" }, { id: jeuneCompagnon.id, unit: "COMPAGNONS" });

  console.log("→ Création du calendrier et des présences…");

  const EVENT_TEMPLATES = [
    { name: "Réunion de branche", type: "REUNION", days: 0 },
    { name: "Sortie nature", type: "REUNION", days: 0 },
    { name: "Week-end de branche", type: "WEEK_END", days: 2 },
    { name: "Service au profit de la paroisse", type: "SERVICE", days: 0 },
    { name: "Camp d'été", type: "CAMP", days: 8 },
  ] as const;

  const events: { id: string; past: boolean }[] = [];

  // US-L03 — un camp PASSÉ, déterministe (pas tiré au hasard dans la boucle
  // ci-dessous, qui peut ne générer aucun CAMP ou un CAMP futur) : sert plus
  // bas à rattacher un lieu de camp (CampPlace) et des lignes de budget
  // (BudgetLine) à une date compatible avec un avis déjà déposé.
  const campPasse = await db.event.create({
    data: {
      name: "Camp d'été — groupe",
      type: "CAMP",
      startDate: daysFromNow(-70),
      endDate: daysFromNow(-62),
      location: "Forêt de Raismes",
      description: "Événement du jeu de données de démonstration.",
      createdById: admin.id,
      registrationOpen: false,
      requirePayment: true,
      priceCents: 12000,
      socialPriceCents: 7000,
    },
  });
  events.push({ id: campPasse.id, past: true });
  const campEventId = campPasse.id;

  for (let e = 0; e < 15; e++) {
    const tpl = pick(EVENT_TEMPLATES);
    const offset = randInt(-120, 60);
    const past = offset < 0;
    const unit = chance(0.75) ? pick(BRANCHES) : null;
    const chef = chefs.find((c) => c.unit === unit) ?? chefs[0]!;
    const priced = tpl.type === "CAMP" || tpl.type === "WEEK_END";

    const event = await db.event.create({
      data: {
        name: unit ? `${tpl.name} — ${unit.toLowerCase()}` : tpl.name,
        type: tpl.type,
        startDate: daysFromNow(offset),
        endDate: daysFromNow(offset + tpl.days),
        unit,
        location: pick(["Local du groupe", "Forêt de Raismes", "Salle paroissiale", "Bellaing"]),
        description: "Événement du jeu de données de démonstration.",
        createdById: chef.id,
        registrationOpen: !past,
        registrationDeadline: past ? null : daysFromNow(offset - 7),
        requirePayment: priced,
        priceCents: priced ? randInt(15, 220) * 100 : null,
        socialPriceCents: priced ? randInt(10, 120) * 100 : null,
      },
    });
    events.push({ id: event.id, past });

    // D-025 — on ne s'inscrit qu'aux événements qui nous concernent.
    for (const j of jeunes.filter((j) => unit === null || j.unit === unit)) {
      if (!chance(0.8)) continue;
      const response = pick(["PRESENT", "PRESENT", "PRESENT", "MAYBE", "ABSENT"] as const);
      await db.eventRegistration.create({
        data: {
          eventId: event.id,
          userId: j.id,
          response,
          status: chance(0.06) ? "WITHDRAWN" : "REGISTERED",
          paidCents: priced && response === "PRESENT" ? randInt(0, 220) * 100 : 0,
          social: chance(0.12),
          createdAt: daysFromNow(offset - randInt(8, 25)),
        },
      });

      // Le pointage n'existe que pour les événements déjà passés.
      if (past && response !== "ABSENT") {
        await db.attendance.create({
          data: {
            eventId: event.id,
            userId: j.id,
            present: chance(0.88),
            markedById: chef.id,
          },
        });
      }
    }
  }

  console.log("→ Création des lieux de camp…");

  const foret = await db.campPlace.create({
    data: {
      name: "Camping de la Forêt de Raismes",
      address: "Route forestière, 59590 Raismes",
      region: "Hauts-de-France",
      capacity: 60,
      equipmentJson: JSON.stringify(["WATER", "TOILETS", "SHOWERS", "FIREWOOD", "PARKING", "WOOD"]),
      ownerName: "Gérard Delcourt",
      // D-032 — un propriétaire avec un e-mail, pas de téléphone.
      ownerEmail: "gerard.delcourt@example.invalid",
      ownerConsentStatus: "GRANTED",
      ownerConsentDecidedAt: daysFromNow(-60),
      notes: "Point d'eau à 200m, feu autorisé toute l'année sauf sécheresse.",
      createdById: admin.id,
      // Chronologie : le lieu existe avant le camp qu'il a accueilli (-70..-62)
      // et avant les avis déposés après ce camp.
      createdAt: daysFromNow(-70),
    },
  });
  await db.campPlaceReview.createMany({
    data: [
      { placeId: foret.id, authorId: thomas.id, eventId: campEventId, rating: 5, comment: "Cadre superbe, accueil au top.", createdAt: daysFromNow(-40) },
      { placeId: foret.id, authorId: julie.id, rating: 4, comment: "Bien, mais douches un peu vétustes.", createdAt: daysFromNow(-55) },
    ],
  });

  await db.campPlace.create({
    data: {
      name: "Ferme des Tilleuls",
      address: "Chemin des Tilleuls, 59230 Bellaing",
      region: "Hauts-de-France",
      capacity: 35,
      equipmentJson: JSON.stringify(["SHELTER", "ELECTRICITY", "PARKING"]),
      ownerName: "Sylvie Wallez",
      // D-032 — un propriétaire avec un téléphone, pas d'e-mail.
      ownerPhone: "01 99 00 78 90",
      ownerConsentStatus: "PENDING",
      ownerConsentRequestedAt: daysFromNow(-5),
      createdById: julie.id,
    },
  });

  await db.campPlace.create({
    data: {
      name: "Prairie du Moulin",
      region: "Hauts-de-France",
      equipmentJson: JSON.stringify(["RIVER", "WOOD"]),
      // RGPD-09 — un refus efface le contact (cf. owner-consent-actions.ts :
      // ownerName/ownerPhone/ownerEmail passent à null à la décision REFUSED).
      // `ownerName` n'est donc PAS renseigné ici : un lieu REFUSED n'a plus de
      // contact stocké, seule la trace du refus demeure.
      ownerConsentStatus: "REFUSED",
      ownerConsentRequestedAt: daysFromNow(-90),
      ownerConsentDecidedAt: daysFromNow(-85),
      createdById: admin.id,
    },
  });

  await db.event.update({ where: { id: campEventId }, data: { campPlaceId: foret.id } });

  console.log("→ Création des tâches de planning…");

  await db.task.create({
    data: {
      title: "Préparer le matériel du camp d'été",
      assigneeId: thomas.id,
      dueDate: daysFromNow(5),
      createdById: admin.id,
    },
  });
  await db.task.create({
    data: {
      title: "Envoyer la convocation aux familles",
      assigneeId: julie.id,
      dueDate: daysFromNow(-2), // en retard, non faite
      createdById: admin.id,
    },
  });
  await db.task.create({
    data: {
      title: "Réserver le car pour le week-end",
      assigneeId: thomas.id,
      dueDate: daysFromNow(-12),
      done: true,
      doneAt: daysFromNow(-10),
      createdById: admin.id,
    },
  });
  await db.task.create({
    data: {
      title: "Acheter le pain pour la réunion",
      dueDate: daysFromNow(7),
      recurrence: "WEEKLY",
      recurrenceEvery: 1,
      createdById: julie.id,
    },
  });
  const tacheGroupe = await db.task.create({
    data: {
      title: "Ranger le local après la réunion",
      groupTask: true,
      minRequired: 2,
      createdById: admin.id,
    },
  });
  for (const chef of chefs.slice(0, 2)) {
    await db.taskSignup.create({ data: { taskId: tacheGroupe.id, userId: chef.id } });
  }

  console.log("→ Création des finances…");

  await db.socialBracket.createMany({
    data: [
      { name: "Quotient familial 1", coefficientPermille: 600, order: 0 },
      { name: "Quotient familial 2", coefficientPermille: 800, order: 1 },
      { name: "Quotient familial 3", coefficientPermille: 1000, order: 2 },
    ],
  });

  const annee = new Date().getFullYear();
  // US-F03 — échéance PASSÉE (créée bien avant elle) : sans quoi
  // `sendCampaignReminders` (campaign-scheduler.ts) ne considère jamais cette
  // campagne comme en retard et les CampaignReminder ci-dessous n'auraient rien
  // à illustrer. `dayOffset` compte des jours APRÈS l'échéance : J+7 et J+15
  // sont dus (échéance il y a 20 jours), J+30 ne l'est pas encore.
  const campaignDeadline = daysFromNow(-20);
  const campaign = await db.campaign.create({
    data: {
      name: `Cotisation ${annee}-${annee + 1}`,
      amountCents: 9500,
      secondChildCents: 8000,
      socialCents: 5000,
      installments: 3,
      deadline: campaignDeadline,
      createdAt: daysFromNow(-60),
      createdById: admin.id,
    },
  });

  // US-F01 — montant attendu par jeune (1er/2e enfant, cf. computeTiers) :
  // jamais une constante, sous peine de sur-cotiser un 2e enfant (Élise et
  // Robin, cf. familleTestParent, partagent le même parent).
  const tiers = computeTiers(campaign, jeunes.map((j) => j.id), familyLinks, new Set());
  const round100 = (cents: number) => Math.round(cents / 100) * 100;

  // Quatre situations de paiement, pour que les écrans de suivi aient des cas :
  // soldé, partiel, échelonné en retard, et rien du tout.
  const retardIds: string[] = [];
  for (const j of jeunes) {
    const situation = pick(["solde", "solde", "partiel", "retard", "rien"] as const);
    if (situation === "rien") continue;
    if (situation === "retard") retardIds.push(j.id);
    const expected = tiers.get(j.id)?.expectedCents ?? campaign.amountCents;
    const versements =
      situation === "solde"
        ? [expected]
        : situation === "partiel"
          ? [round100(expected * 0.4)]
          : [round100(expected * 0.3), round100(expected * 0.2)];
    for (const [k, amountCents] of versements.entries()) {
      await db.campaignPayment.create({
        data: {
          campaignId: campaign.id,
          userId: j.id,
          amountCents,
          method: pick(["ESPECES", "CHEQUE", "VIREMENT"] as const),
          paidAt: daysFromNow(-randInt(10, 90) - k * 30),
          recordedById: admin.id,
          note: situation === "retard" && k === 0 ? "Échelonnement accordé." : null,
        },
      });
    }
  }

  // US-F03 — un jeune en retard EXEMPTÉ de relance (échelonnement convenu à
  // l'amiable), un autre RELANCÉ deux fois (J+7 et J+15, déjà envoyées : le
  // scheduler ne doit pas les renvoyer — J+30 n'est pas encore due).
  if (retardIds[0]) {
    await db.campaignExemption.create({
      data: { campaignId: campaign.id, userId: retardIds[0] },
    });
  }
  if (retardIds[1]) {
    await db.campaignReminder.createMany({
      data: [
        { campaignId: campaign.id, userId: retardIds[1], dayOffset: 7, sentAt: daysFromNow(-13) },
        { campaignId: campaign.id, userId: retardIds[1], dayOffset: 15, sentAt: daysFromNow(-5) },
      ],
    });
  }

  console.log("→ Création des caisses…");

  const caisseGroupe = await db.cashBox.create({ data: { name: "Caisse groupe", createdById: admin.id } });
  const caisseCamp = await db.cashBox.create({ data: { name: "Caisse camp d'été", createdById: admin.id } });
  await db.cashTransaction.create({
    data: {
      cashBoxId: caisseGroupe.id,
      amountCents: 45000,
      label: "Subvention municipale",
      kind: "DEPOSIT",
      date: daysFromNow(-60),
      createdById: admin.id,
    },
  });
  await db.cashTransaction.create({
    data: {
      cashBoxId: caisseGroupe.id,
      amountCents: -8200,
      label: "Achat fournitures de bureau",
      kind: "WITHDRAWAL",
      date: daysFromNow(-20),
      createdById: admin.id,
    },
  });
  // Transfert groupe → camp : deux mouvements signés, même transferGroupId.
  const transferGroupId = `xfer_${randInt(100000, 999999)}`;
  await db.cashTransaction.createMany({
    data: [
      {
        cashBoxId: caisseGroupe.id,
        amountCents: -15000,
        label: "Transfert vers la caisse du camp d'été",
        kind: "TRANSFER",
        date: daysFromNow(-10),
        transferGroupId,
        createdById: admin.id,
      },
      {
        cashBoxId: caisseCamp.id,
        amountCents: 15000,
        label: "Transfert depuis la caisse groupe",
        kind: "TRANSFER",
        date: daysFromNow(-10),
        transferGroupId,
        createdById: admin.id,
      },
    ],
  });

  console.log("→ Création du budget prévisionnel du camp…");
  await db.budgetLine.createMany({
    data: [
      { eventId: campEventId, category: "TRANSPORT", plannedCents: 30000 },
      { eventId: campEventId, category: "NOURRITURE", plannedCents: 45000 },
      { eventId: campEventId, category: "MATERIEL", plannedCents: 10000 },
    ],
  });

  // Notes de frais : tous les statuts représentés, refus motivé compris.
  const EXPENSE_CASES = [
    { status: "PENDING", category: "NOURRITURE", amountCents: 8740 },
    { status: "PENDING", category: "TRANSPORT", amountCents: 4520 },
    { status: "APPROVED", category: "MATERIEL", amountCents: 15900 },
    { status: "APPROVED", category: "NOURRITURE", amountCents: 6310 },
    { status: "REJECTED", category: "AUTRE", amountCents: 12000 },
  ] as const;
  const eventPasse = events.find((e) => e.past)?.id ?? null;
  for (const [i, c] of EXPENSE_CASES.entries()) {
    await db.expense.create({
      data: {
        declarantId: chefs[i % chefs.length]!.id,
        amountCents: c.amountCents,
        date: daysFromNow(-randInt(5, 60)),
        category: c.category,
        eventId: eventPasse,
        note: "Dépense du jeu de données de démonstration.",
        // RECEIPT_REQUIRED_ABOVE_CENTS = 2000 : au-delà, un reçu est exigé.
        receiptUrl: c.amountCents > 2000 ? "/uploads/demo-recu.jpg" : null,
        status: c.status,
        reviewedById: c.status === "PENDING" ? null : admin.id,
        reviewedAt: c.status === "PENDING" ? null : daysFromNow(-randInt(1, 4)),
        rejectionReason:
          c.status === "REJECTED" ? "Hors périmètre du groupe : dépense personnelle." : null,
      },
    });
  }

  console.log("→ Création de la communication…");

  // Les salons viennent de `restore_default_data` (D-019) : on n'en crée pas,
  // on écrit dedans. S'il n'y en a aucun, on s'abstient plutôt que d'inventer
  // une arborescence concurrente de celle par défaut.
  const channels = await db.channel.findMany({ where: { archived: false }, take: 4 });
  const auteurs = [admin, ...chefs];
  const PHRASES = [
    "Rendez-vous samedi à 14h au local, prévoir des chaussures de marche.",
    "La liste du matériel pour le week-end est en pièce jointe.",
    "Merci aux parents qui ont assuré le transport dimanche dernier.",
    "Pensez à rapporter les tentes à sécher avant vendredi.",
    "Réunion d'équipe de maîtrise reportée à jeudi 20h30.",
    "Les inscriptions au camp d'été sont ouvertes jusqu'à la fin du mois.",
  ] as const;
  const messages: { id: string; channelId: string; authorId: string }[] = [];
  for (const channel of channels) {
    for (let m = 0; m < randInt(3, 8); m++) {
      const message = await db.message.create({
        data: {
          channelId: channel.id,
          authorId: pick(auteurs).id,
          body: pick(PHRASES),
          createdAt: daysFromNow(-randInt(1, 45)),
        },
      });
      messages.push(message);
    }
  }

  // US-C09 — quelques réactions, sur les deux premiers messages du premier salon.
  for (const message of messages.slice(0, 2)) {
    for (const reacteur of auteurs.filter((a) => a.id !== message.authorId).slice(0, 2)) {
      await db.messageReaction.create({
        data: { messageId: message.id, userId: reacteur.id, emoji: pick(["👍", "😄", "🔥"]) },
      });
    }
  }

  // US-C06 — sondage avec votes, dans le premier salon disponible.
  if (channels[0]) {
    const poll = await db.poll.create({
      data: {
        channelId: channels[0].id,
        authorId: admin.id,
        question: "Dispo pour le week-end de Toussaint ?",
        options: JSON.stringify([
          { id: "oui", label: "Oui" },
          { id: "non", label: "Non" },
          { id: "peut-etre", label: "Peut-être" },
        ]),
        closesAt: daysFromNow(10),
      },
    });
    for (const [i, votant] of auteurs.entries()) {
      await db.pollVote.create({
        data: { pollId: poll.id, userId: votant.id, optionId: i % 3 === 0 ? "oui" : i % 3 === 1 ? "non" : "peut-etre" },
      });
    }
  }

  // SAFE-02 — un signalement en attente, sur un message pris au hasard parmi
  // ceux qui ne sont pas déjà de l'admin (pour avoir un `concernedUnit` non nul).
  const messageSignalable = messages.find((m) => m.authorId !== admin.id) ?? messages[0];
  let reportReporterId: string | null = null;
  if (messageSignalable) {
    const auteurMessage = auteurs.find((a) => a.id === messageSignalable.authorId) ?? admin;
    reportReporterId = julie.id === auteurMessage.id ? thomas.id : julie.id;
    await db.report.create({
      data: {
        targetType: "CHANNEL_MESSAGE",
        targetId: messageSignalable.id,
        reporterId: reportReporterId,
        reason: "Ton inapproprié dans le salon.",
        status: "PENDING",
        concernedUnit: resolveConcernedUnit(auteurMessage),
      },
    });
  }

  console.log("→ Création de la messagerie privée (conforme SAFE-01)…");

  // Quatre cas couvrant `evaluateDmPolicy` (dm-policy.ts) : passe-droit ADMIN,
  // adultes entre eux, jeune 15-17 + chef de son unité, lien familial (quel que
  // soit l'âge). Les mêmes règles servent à l'affichage : pas de conversation
  // que l'UI refuserait de faire naviguer.
  const chefPionniers = chefs.find((c) => c.unit === "PIONNIERS")!;
  const DM_PAIRS: { a: string; b: string; bodies: [string, string] }[] = [
    { a: admin.id, b: julie.id, bodies: ["Julie, peux-tu valider la note de frais en attente ?", "C'est fait, merci !"] },
    { a: thomas.id, b: julie.id, bodies: ["On échange le matériel pour le week-end ?", "Oui, je passe demain."] },
    {
      a: chefPionniers.id,
      b: jeunePionnier.id,
      bodies: ["Élise, tu peux confirmer ta présence au week-end ?", "Oui, c'est noté !"],
    },
    {
      a: familleTestParent.id,
      b: jeunePionnier.id,
      bodies: ["Élise, n'oublie pas ton duvet pour le week-end.", "T'inquiète, il est déjà dans le sac."],
    },
  ];
  for (const { a, b, bodies } of DM_PAIRS) {
    const [userAId, userBId] = canonicalPair(a, b);
    const conversation = await db.conversation.create({ data: { userAId, userBId } });
    await db.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: a,
        body: bodies[0],
        createdAt: daysFromNow(-3),
        // Le destinataire a répondu (message suivant) : il l'a donc forcément lu.
        readAt: daysFromNow(-3),
      },
    });
    await db.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: b,
        body: bodies[1],
        createdAt: daysFromNow(-2),
        readAt: daysFromNow(-2),
      },
    });
  }

  const ANNOUNCEMENTS = [
    { title: "Inscriptions ouvertes pour le camp d'été", audience: "ALL", urgent: false },
    { title: "Réunion de rentrée : samedi 14 septembre", audience: "PARENTS", urgent: false },
    { title: "Sortie annulée — alerte météo", audience: "ALL", urgent: true },
    { title: "Appel aux volontaires pour le transport", audience: "PARENTS", urgent: false },
  ] as const;
  const announcements: { id: string }[] = [];
  for (const a of ANNOUNCEMENTS) {
    const announcement = await db.announcement.create({
      data: {
        authorId: admin.id,
        title: a.title,
        body: "Contenu de démonstration : ce texte n'a pas d'autre objet que de remplir l'écran.",
        audience: a.audience,
        urgent: a.urgent,
        createdAt: daysFromNow(-randInt(1, 30)),
      },
    });
    announcements.push(announcement);
  }
  // US-C03 — lecteurs cohérents avec l'audience : `total` (announcement-queries.ts
  // :75-76) ne compte QUE la population ciblée par l'audience, donc un lecteur
  // hors périmètre gonflerait le nombre de lus sans jamais entrer dans le total.
  // Les deux premières annonces (ALL puis PARENTS, dans l'ordre de ANNOUNCEMENTS)
  // sont lues ; les suivantes restent non lues (état par défaut).
  const [annonceAll, annoncePar] = announcements;
  if (annonceAll) {
    for (const lecteur of [thomas, julie]) {
      await db.announcementRead.create({
        data: { announcementId: annonceAll.id, userId: lecteur.id, readAt: daysFromNow(-1) },
      });
    }
  }
  if (annoncePar) {
    for (const parentId of parentIds.slice(0, 2)) {
      await db.announcementRead.create({
        data: { announcementId: annoncePar.id, userId: parentId, readAt: daysFromNow(-1) },
      });
    }
  }

  console.log("→ Création du suivi pédagogique…");

  const jeunesDe = (unit: Unit) => jeunes.filter((j) => j.unit === unit);
  const chefDe = (unit: Unit) => chefs.find((c) => c.unit === unit)?.id ?? admin.id;

  // US-S01 — référentiel d'étapes, une progression par branche de jeunes.
  const ETAPES: Record<string, string[]> = {
    FARFADETS: ["1re étape — Découverte", "2e étape — Vie d'équipe"],
    LOUVETEAUX: ["1re étape — Accueil", "2e étape — Aventure", "3e étape — Piste/Piste verte"],
    SCOUTS: ["1re étape — Accueil", "2e étape — Équipier", "3e étape — Responsable d'équipe"],
    PIONNIERS: ["1re étape — Intégration", "2e étape — Projet", "3e étape — Départ"],
    COMPAGNONS: ["1re étape — Engagement", "2e étape — Projet solidaire"],
  };
  const etapesParUnite = new Map<string, { id: string; name: string }[]>();
  for (const [unit, noms] of Object.entries(ETAPES)) {
    const liste = [];
    for (const [ordre, name] of noms.entries()) {
      liste.push(await db.progressionStep.create({ data: { unit, name, order: ordre } }));
    }
    etapesParUnite.set(unit, liste);
  }

  // US-S02 — catalogue de badges.
  const BADGES = [
    { name: "Cuisinier", icon: "🍳", units: [] as Unit[], criteria: "Préparer un repas complet pour son équipe." },
    { name: "Secouriste", icon: "🚑", units: ["SCOUTS", "PIONNIERS"] as Unit[], criteria: "Maîtriser les gestes de premiers secours." },
    { name: "Nature", icon: "🌲", units: [] as Unit[], criteria: "Reconnaître la faune et la flore locales." },
  ];
  const badgesParNom = new Map<string, { id: string }>();
  for (const b of BADGES) {
    badgesParNom.set(
      b.name,
      await db.badge.create({ data: { name: b.name, icon: b.icon, unitsJson: JSON.stringify(b.units), criteria: b.criteria } }),
    );
  }

  for (const unit of ["SCOUTS", "PIONNIERS"] as Unit[]) {
    const membres = jeunesDe(unit);
    const etapes = etapesParUnite.get(unit) ?? [];
    const auteur = chefDe(unit);
    if (membres[0] && etapes[0]) {
      // Étape confirmée (workflow à 2 chefs déjà abouti).
      await db.stepValidation.create({
        data: {
          stepId: etapes[0].id,
          userId: membres[0].id,
          status: "CONFIRMED",
          proposedById: auteur,
          confirmedById: admin.id,
          confirmedAt: daysFromNow(-15),
        },
      });
      // Objectif ATTEINT rattaché à cette étape.
      await db.pedagogicalGoal.create({
        data: {
          userId: membres[0].id,
          title: `Valider : ${etapes[0].name}`,
          stepId: etapes[0].id,
          status: "ACHIEVED",
          createdById: auteur,
          achievedAt: daysFromNow(-15),
        },
      });
      // Note de suivi (donnée sensible, US-S07).
      await db.pedagogicalNote.create({
        data: {
          userId: membres[0].id,
          authorId: auteur,
          content: "Prend de l'assurance dans l'équipe, à encourager sur la prise de parole.",
        },
      });
    }
    if (membres[1] && etapes[1]) {
      // Étape PROPOSÉE, en attente d'un 2e chef.
      await db.stepValidation.create({
        data: { stepId: etapes[1].id, userId: membres[1].id, status: "PROPOSED", proposedById: auteur },
      });
      // Objectif EN COURS, non rattaché à une étape précise cette fois.
      await db.pedagogicalGoal.create({
        data: {
          userId: membres[1].id,
          title: "Participer à l'organisation d'un jeu de piste",
          status: "IN_PROGRESS",
          dueDate: daysFromNow(30),
          createdById: auteur,
        },
      });
    }
    const badgeSecouriste = badgesParNom.get("Secouriste");
    if (membres[0] && badgeSecouriste) {
      await db.badgeAward.create({
        data: { badgeId: badgeSecouriste.id, userId: membres[0].id, awardedById: auteur, awardedAt: daysFromNow(-20) },
      });
    }
  }

  console.log("→ Création des préférences de notification…");

  await db.notificationPreference.create({ data: { userId: admin.id } });
  await db.notificationPreference.create({ data: { userId: thomas.id, pushEnabled: false } });
  await db.notificationPreference.create({ data: { userId: julie.id, emailEnabled: false } });

  console.log("→ Complément de l'historique d'audit (autres domaines)…");

  await db.auditLog.createMany({
    data: [
      {
        action: "DONATION_APPROVED",
        userId: admin.id,
        metadata: JSON.stringify({ name: "Jeu de société — Loup Garou" }),
        createdAt: daysFromNow(-3),
      },
      {
        action: "TASK_CREATED",
        userId: admin.id,
        metadata: JSON.stringify({ title: "Préparer le matériel du camp d'été" }),
        createdAt: daysFromNow(-14),
      },
      {
        action: "CASHBOX_CREATED",
        userId: admin.id,
        metadata: JSON.stringify({ name: caisseGroupe.name }),
        createdAt: daysFromNow(-60),
      },
      {
        action: "CASH_TRANSFER",
        userId: admin.id,
        metadata: JSON.stringify({ amountCents: 15000, from: caisseGroupe.name, to: caisseCamp.name }),
        createdAt: daysFromNow(-10),
      },
      {
        action: "PLACE_CREATED",
        userId: admin.id,
        metadata: JSON.stringify({ name: foret.name }),
        createdAt: daysFromNow(-70),
      },
      {
        action: "BADGE_AWARD_GRANTED",
        userId: admin.id,
        metadata: JSON.stringify({ badge: "Secouriste" }),
        createdAt: daysFromNow(-20),
      },
      ...(reportReporterId && messageSignalable
        ? [
            {
              action: "MESSAGE_REPORTED" as const,
              userId: reportReporterId,
              metadata: JSON.stringify({ messageId: messageSignalable.id }),
              createdAt: daysFromNow(-1),
            },
          ]
        : []),
      {
        action: "USER_ROLE_CHANGED",
        userId: admin.id,
        metadata: JSON.stringify({ target: "chef.farfadets@piloti.fr", added: "TRESORIER" }),
        createdAt: daysFromNow(-45),
      },
    ],
  });

  void paul;

  console.log("✓ Seed terminé.");
  console.log(`  - ${await db.user.count()} utilisateurs`);
  console.log(`  - ${await db.account.count()} comptes (mots de passe)`);
  console.log(`  - ${await db.equipment.count()} articles`);
  console.log(`  - ${await db.loan.count()} prêts`);
  console.log(`  - ${await db.incident.count()} incidents`);
  console.log(`  - ${await db.familyLink.count()} liens familiaux`);
  console.log(`  - ${await db.consent.count()} consentements`);
  console.log(`  - ${await db.event.count()} événements`);
  console.log(`  - ${await db.eventRegistration.count()} inscriptions`);
  console.log(`  - ${await db.attendance.count()} présences pointées`);
  console.log(`  - ${await db.campaignPayment.count()} paiements de cotisation`);
  console.log(`  - ${await db.campaignExemption.count()} exemptions de relance`);
  console.log(`  - ${await db.campaignReminder.count()} relances de cotisation`);
  console.log(`  - ${await db.expense.count()} notes de frais`);
  console.log(`  - ${await db.cashBox.count()} caisses`);
  console.log(`  - ${await db.cashTransaction.count()} mouvements de caisse`);
  console.log(`  - ${await db.budgetLine.count()} lignes de budget`);
  console.log(`  - ${await db.donation.count()} dons de matériel`);
  console.log(`  - ${await db.campPlace.count()} lieux de camp`);
  console.log(`  - ${await db.campPlaceReview.count()} avis sur des lieux`);
  console.log(`  - ${await db.task.count()} tâches`);
  console.log(`  - ${await db.taskSignup.count()} inscriptions à des tâches`);
  console.log(`  - ${await db.message.count()} messages de salon`);
  console.log(`  - ${await db.messageReaction.count()} réactions`);
  console.log(`  - ${await db.poll.count()} sondages`);
  console.log(`  - ${await db.pollVote.count()} votes de sondage`);
  console.log(`  - ${await db.conversation.count()} conversations privées`);
  console.log(`  - ${await db.directMessage.count()} messages privés`);
  console.log(`  - ${await db.report.count()} signalements`);
  console.log(`  - ${await db.announcement.count()} annonces`);
  console.log(`  - ${await db.announcementRead.count()} lectures d'annonce`);
  console.log(`  - ${await db.progressionStep.count()} étapes de progression`);
  console.log(`  - ${await db.badge.count()} badges au catalogue`);
  console.log(`  - ${await db.badgeAward.count()} badges attribués`);
  console.log(`  - ${await db.stepValidation.count()} validations d'étape`);
  console.log(`  - ${await db.pedagogicalGoal.count()} objectifs pédagogiques`);
  console.log(`  - ${await db.pedagogicalNote.count()} notes de suivi`);
  console.log(`  - ${await db.notificationPreference.count()} préférences de notification`);
  console.log(`  - ${await db.auditLog.count()} entrées d'audit`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`\n  Mot de passe des comptes factices : ${SEED_PASSWORD}`);
    console.log("  (généré aléatoirement — fixez SEED_PASSWORD pour le choisir)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
