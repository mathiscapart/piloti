import "dotenv/config";

import { randomBytes } from "node:crypto";

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import type { AccountStatus, Role, Unit } from "../src/lib/enums";

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
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY_MS);

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

  // Ordre inverse des FK
  await db.auditLog.deleteMany();
  await db.incident.deleteMany();
  await db.loan.deleteMany();
  await db.equipment.deleteMany();
  await db.event.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.verification.deleteMany();
  await db.user.deleteMany();

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

  void paul;

  console.log("✓ Seed terminé.");
  console.log(`  - ${await db.user.count()} utilisateurs`);
  console.log(`  - ${await db.account.count()} comptes (mots de passe)`);
  console.log(`  - ${await db.equipment.count()} articles`);
  console.log(`  - ${await db.loan.count()} prêts`);
  console.log(`  - ${await db.incident.count()} incidents`);
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
