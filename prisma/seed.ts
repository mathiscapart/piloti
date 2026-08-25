import "dotenv/config";

import { randomBytes } from "node:crypto";

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import type { AccountStatus, Role, Unit } from "../src/lib/enums";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal/versions";

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
      roles: JSON.stringify([input.role]),
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
    email: "thomas.martin@sgdf.fr",
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
    email: "julie.bernard@sgdf.fr",
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
    email: "paul.durand@sgdf.fr",
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

  // Un chef par branche de jeunes, en plus de l'équipe créée plus haut.
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
    });
    chefs.push({ id: chef.id, unit });
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

  console.log("→ Création du calendrier et des présences…");

  const EVENT_TEMPLATES = [
    { name: "Réunion de branche", type: "REUNION", days: 0 },
    { name: "Sortie nature", type: "REUNION", days: 0 },
    { name: "Week-end de branche", type: "WEEK_END", days: 2 },
    { name: "Service au profit de la paroisse", type: "SERVICE", days: 0 },
    { name: "Camp d'été", type: "CAMP", days: 8 },
  ] as const;

  const events: { id: string; past: boolean }[] = [];
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

  console.log("→ Création des finances…");

  await db.socialBracket.createMany({
    data: [
      { name: "Quotient familial 1", coefficientPermille: 600, order: 0 },
      { name: "Quotient familial 2", coefficientPermille: 800, order: 1 },
      { name: "Quotient familial 3", coefficientPermille: 1000, order: 2 },
    ],
  });

  const annee = new Date().getFullYear();
  const campaign = await db.campaign.create({
    data: {
      name: `Cotisation ${annee}-${annee + 1}`,
      amountCents: 9500,
      secondChildCents: 8000,
      socialCents: 5000,
      installments: 3,
      deadline: daysFromNow(45),
      createdById: admin.id,
    },
  });

  // Quatre situations de paiement, pour que les écrans de suivi aient des cas :
  // soldé, partiel, échelonné en retard, et rien du tout.
  for (const j of jeunes) {
    const situation = pick(["solde", "solde", "partiel", "retard", "rien"] as const);
    if (situation === "rien") continue;
    const versements =
      situation === "solde" ? [9500] : situation === "partiel" ? [3500] : [3000, 2000];
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

  // Notes de frais : tous les statuts représentés, refus motivé compris.
  const EXPENSE_CASES = [
    { status: "PENDING", category: "ALIMENTATION", amountCents: 8740 },
    { status: "PENDING", category: "TRANSPORT", amountCents: 4520 },
    { status: "APPROVED", category: "MATERIEL", amountCents: 15900 },
    { status: "APPROVED", category: "ALIMENTATION", amountCents: 6310 },
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
  for (const channel of channels) {
    for (let m = 0; m < randInt(3, 8); m++) {
      await db.message.create({
        data: {
          channelId: channel.id,
          authorId: pick(auteurs).id,
          body: pick(PHRASES),
          createdAt: daysFromNow(-randInt(1, 45)),
        },
      });
    }
  }

  const ANNOUNCEMENTS = [
    { title: "Inscriptions ouvertes pour le camp d'été", audience: "ALL", urgent: false },
    { title: "Réunion de rentrée : samedi 14 septembre", audience: "PARENTS", urgent: false },
    { title: "Sortie annulée — alerte météo", audience: "ALL", urgent: true },
    { title: "Appel aux volontaires pour le transport", audience: "PARENTS", urgent: false },
  ] as const;
  for (const a of ANNOUNCEMENTS) {
    await db.announcement.create({
      data: {
        authorId: admin.id,
        title: a.title,
        body: "Contenu de démonstration : ce texte n'a pas d'autre objet que de remplir l'écran.",
        audience: a.audience,
        urgent: a.urgent,
        createdAt: daysFromNow(-randInt(1, 30)),
      },
    });
  }

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
  console.log(`  - ${await db.expense.count()} notes de frais`);
  console.log(`  - ${await db.message.count()} messages de salon`);
  console.log(`  - ${await db.announcement.count()} annonces`);
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
