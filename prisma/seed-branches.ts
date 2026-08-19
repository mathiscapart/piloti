import "dotenv/config";

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import type { Unit } from "../src/lib/enums";

// Jeu de données de développement pour exercer le PÉRIMÈTRE D'UNITÉ (D-024) :
// des jeunes dans trois branches, des événements passés pointés et à pointer,
// et un référentiel pédagogique — sans quoi les écrans de progression sont
// vides et la règle « un chef n'agit que sur sa branche » n'est pas testable.
//
// Contrairement à `seed.ts`, ce script est ADDITIF et IDEMPOTENT : aucun
// `deleteMany`, chaque objet est cherché avant d'être créé. On peut donc le
// relancer sur une base de travail sans rien perdre.
//
//   pnpm db:seed:branches
//
// Il s'appuie sur les chefs déjà seedés : Thomas Martin (PIONNIERS) et
// Julie Bernard (SCOUTS). Les Louveteaux n'ont volontairement AUCUN chef :
// c'est la branche témoin, celle sur laquelle personne ne doit pouvoir écrire
// en dehors d'un ADMIN ou du responsable de groupe.

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY_MS);

const MOT_DE_PASSE = "PilotiJeune2024!";

interface JeuneInput {
  firstName: string;
  lastName: string;
  unit: Unit;
  // Année de naissance cohérente avec la tranche d'âge de la branche
  // (`birthDateSchema` refuse en dessous de 5 ans, cf. D-023).
  birthYear: number;
}

const JEUNES: JeuneInput[] = [
  // Louveteaux-Jeannettes (8-11 ans) — branche sans chef attitré.
  { firstName: "Léa", lastName: "Petit", unit: "LOUVETEAUX", birthYear: 2016 },
  { firstName: "Hugo", lastName: "Roux", unit: "LOUVETEAUX", birthYear: 2016 },
  { firstName: "Manon", lastName: "Girard", unit: "LOUVETEAUX", birthYear: 2017 },
  { firstName: "Nathan", lastName: "Moreau", unit: "LOUVETEAUX", birthYear: 2018 },
  // Scouts-Guides (11-14 ans) — branche de Julie Bernard.
  { firstName: "Camille", lastName: "Lefèvre", unit: "SCOUTS", birthYear: 2013 },
  { firstName: "Lucas", lastName: "Garnier", unit: "SCOUTS", birthYear: 2013 },
  { firstName: "Inès", lastName: "Fontaine", unit: "SCOUTS", birthYear: 2014 },
  { firstName: "Gabriel", lastName: "Chevalier", unit: "SCOUTS", birthYear: 2014 },
  { firstName: "Jade", lastName: "Robin", unit: "SCOUTS", birthYear: 2015 },
  // Pionniers-Caravelles (14-17 ans) — branche de Thomas Martin.
  { firstName: "Théo", lastName: "Masson", unit: "PIONNIERS", birthYear: 2010 },
  { firstName: "Chloé", lastName: "Blanchard", unit: "PIONNIERS", birthYear: 2010 },
  { firstName: "Maxime", lastName: "Perrin", unit: "PIONNIERS", birthYear: 2011 },
  { firstName: "Sarah", lastName: "Dumas", unit: "PIONNIERS", birthYear: 2011 },
  { firstName: "Antoine", lastName: "Leroy", unit: "PIONNIERS", birthYear: 2012 },
  // Frère de Léa Petit (cf. PARENT) : 16 ans, donc au-dessus de MIN_LOGIN_AGE.
  // Il a un compte à lui, là où sa sœur Louveteaux n'en a pas — c'est le
  // contraste que la fratrie sert à exercer (US-CM-04).
  { firstName: "Tom", lastName: "Petit", unit: "PIONNIERS", birthYear: 2010 },
];

// Second chef sur les SCOUTS. Sans lui, chaque branche n'a qu'un seul chef et
// le workflow « validation à 2 chefs » (US-S04) ne peut se conclure qu'avec
// l'ADMIN — on ne saurait pas distinguer « refusé parce qu'une autre branche »
// de « refusé parce que le même chef ». Avec Marc, les deux chemins sont
// exerçables : il confirme ce que Julie a proposé, Thomas (Pionniers) non.
const CHEF_RENFORT = {
  email: "marc.lambert@sgdf.fr",
  password: "PilotiChef2024!",
  firstName: "Marc",
  lastName: "Lambert",
  unit: "SCOUTS" as Unit,
  birthDate: new Date("1988-09-21"),
};

// Parent d'une Louveteaux. Sans lui, aucun compte PARENT ni aucun `FamilyLink`
// n'existe en développement : tout le parcours parental est intestable —
// répondre à une invitation pour son enfant (US-P04), consulter sa progression
// (US-S10), recevoir les notifications qui lui sont destinées.
const PARENT = {
  email: "sophie.petit@parent.piloti.fr",
  password: "PilotiParent2024!",
  firstName: "Sophie",
  lastName: "Petit",
  birthDate: new Date("1986-04-03"),
  // Rattaché aux enfants portant ces prénom + nom (cf. JEUNES). Deux branches
  // et deux régimes : une Louveteaux trop jeune pour un compte, un Pionnier de
  // 16 ans qui se connecte lui-même.
  enfants: [
    { firstName: "Léa", lastName: "Petit" },
    { firstName: "Tom", lastName: "Petit" },
  ],
};

// Adresse e-mail dérivée du nom : accents retirés, espaces en tirets.
function emailDe(j: JeuneInput): string {
  const slug = (s: string) =>
    s
      .normalize("NFD") // sépare les accents pour les retirer juste après
      .replace(/\p{Diacritic}/gu, "") // retire les accents une fois séparés
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  return `${slug(j.firstName)}.${slug(j.lastName)}@jeune.piloti.fr`;
}

/**
 * Crée un compte jeune s'il n'existe pas déjà. Même chemin que `seed.ts` :
 * better-auth pose le hash du mot de passe et la row `Account`, puis on écrit
 * les champs `input: false` (`role`/`roles`, `status`, `unit`, `birthDate`).
 */
async function creerJeune(input: JeuneInput) {
  const email = emailDe(input);
  const existant = await db.user.findUnique({ where: { email } });
  if (existant) return existant;

  await auth.api.signUpEmail({
    body: {
      email,
      password: MOT_DE_PASSE,
      name: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });
  return db.user.update({
    where: { email },
    data: {
      role: "SCOUT",
      roles: JSON.stringify(["SCOUT"]),
      status: "ACTIVE",
      emailVerified: true,
      unit: input.unit,
      birthDate: new Date(`${input.birthYear}-05-15`),
    },
  });
}

interface EventInput {
  name: string;
  type: string;
  unit: Unit | null;
  debutJours: number;
  finJours: number;
  // US-P04 — sans `inscriptionsOuvertes`, `rsvpEvent` refuse et le bloc
  // d'inscription de la fiche n'est même pas rendu : un jeune ne voit AUCUN
  // bouton. C'est le défaut du modèle (`registrationOpen @default(false)`), il
  // faut donc au moins un événement ouvert pour exercer le parcours.
  inscriptionsOuvertes?: boolean;
  // Jours avant le début, pour la date limite d'inscription (US-P06).
  limiteJours?: number;
}

const EVENEMENTS: EventInput[] = [
  // Passés ET pointés plus bas : alimentent le bilan des présences, qui ne
  // compte que les événements dont `endDate` est dépassée.
  { name: "Réunion Louveteaux — rentrée", type: "REUNION", unit: "LOUVETEAUX", debutJours: -21, finJours: -21 },
  { name: "Réunion Scouts — rentrée", type: "REUNION", unit: "SCOUTS", debutJours: -21, finJours: -21 },
  { name: "Réunion Pionniers — rentrée", type: "REUNION", unit: "PIONNIERS", debutJours: -21, finJours: -21 },
  // Événement de GROUPE (`unit: null`) : le cas qui doit rester ouvert à tous
  // les chefs, quelle que soit leur branche.
  { name: "Journée de groupe", type: "SERVICE", unit: null, debutJours: -14, finJours: -14 },
  // Passés mais NON pointés : c'est là qu'on exerce `setAttendance` à la main,
  // et donc le refus sur une branche qui n'est pas la sienne.
  { name: "Réunion Louveteaux — jeu de piste", type: "REUNION", unit: "LOUVETEAUX", debutJours: -4, finJours: -4 },
  { name: "Réunion Scouts — préparation camp", type: "REUNION", unit: "SCOUTS", debutJours: -3, finJours: -3 },
  { name: "Réunion Pionniers — conseil d'unité", type: "REUNION", unit: "PIONNIERS", debutJours: -3, finJours: -3 },
  // À VENIR, inscriptions OUVERTES : c'est ici que se teste le parcours du
  // jeune (répondre présent/absent/peut-être) et la vue chef des réponses.
  { name: "Week-end Pionniers — Toussaint", type: "WEEK_END", unit: "PIONNIERS", debutJours: 21, finJours: 23, inscriptionsOuvertes: true, limiteJours: 7 },
  { name: "Week-end Scouts — Toussaint", type: "WEEK_END", unit: "SCOUTS", debutJours: 21, finJours: 23, inscriptionsOuvertes: true, limiteJours: 7 },
  { name: "Sortie Louveteaux — automne", type: "REUNION", unit: "LOUVETEAUX", debutJours: 14, finJours: 14, inscriptionsOuvertes: true, limiteJours: 5 },
  // Ouvert à tout le groupe ET aux inscriptions : le jeune d'une branche doit
  // pouvoir s'y inscrire comme les autres.
  { name: "Fête de groupe", type: "SERVICE", unit: null, debutJours: 30, finJours: 30, inscriptionsOuvertes: true, limiteJours: 10 },
];

// Étapes de progression par branche (US-S01). Noms neutres et ordonnés : le but
// est d'avoir de la matière à valider, pas de reproduire le référentiel SGDF.
const ETAPES: Record<string, string[]> = {
  LOUVETEAUX: ["1re étape — Découverte", "2e étape — Participation", "3e étape — Responsabilité"],
  SCOUTS: ["1re étape — Accueil", "2e étape — Équipier", "3e étape — Responsable d'équipe", "4e étape — Aîné"],
  PIONNIERS: ["1re étape — Intégration", "2e étape — Projet", "3e étape — Pilotage", "4e étape — Départ"],
};

const BADGES: { name: string; icon: string; units: Unit[]; criteria: string }[] = [
  { name: "Cuisinier", icon: "🍳", units: [], criteria: "Préparer un repas complet pour son équipe." },
  { name: "Secouriste", icon: "🚑", units: ["SCOUTS", "PIONNIERS"], criteria: "Maîtriser les gestes de premiers secours." },
  { name: "Nature", icon: "🌲", units: [], criteria: "Reconnaître la faune et la flore locales." },
  { name: "Froissartage", icon: "🪵", units: ["SCOUTS", "PIONNIERS"], criteria: "Réaliser un ouvrage en bois assemblé." },
  { name: "Explorateur", icon: "🧭", units: ["LOUVETEAUX"], criteria: "S'orienter avec une carte et une boussole." },
];

async function main() {
  // Garde-fou : ce script crée des comptes ACTIVE dont les mots de passe sont
  // en clair dans le dépôt (public). Contrairement à `seed.ts`, qui commence
  // par un `deleteMany` et se refuse donc de lui-même ailleurs qu'en dev,
  // celui-ci est additif : il s'exécuterait sans erreur ni signal sur une base
  // de production. D'où ce refus explicite.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "seed-branches : jeu de données de développement uniquement, refus en production.",
    );
  }

  console.log("→ Jeu de données multi-branches (additif, idempotent)…");

  // ── Chefs déjà présents : ils signent les pointages et les propositions ────
  const [thomas, julie, admin] = await Promise.all([
    db.user.findUnique({ where: { email: "thomas.martin@sgdf.fr" } }),
    db.user.findUnique({ where: { email: "julie.bernard@sgdf.fr" } }),
    db.user.findUnique({ where: { email: "admin@piloti.fr" } }),
  ]);
  if (!thomas || !julie || !admin) {
    throw new Error(
      "Chefs de référence introuvables — lance d'abord `pnpm db:seed` sur une base vide.",
    );
  }
  // Qui « signe » les données d'une branche : les Louveteaux n'ayant pas de
  // chef, c'est l'admin qui joue ce rôle pour eux.
  const chefDe: Record<string, string> = {
    LOUVETEAUX: admin.id,
    SCOUTS: julie.id,
    PIONNIERS: thomas.id,
  };

  // ── Second chef SCOUTS (cf. CHEF_RENFORT) ─────────────────────────────────
  let marc = await db.user.findUnique({ where: { email: CHEF_RENFORT.email } });
  if (!marc) {
    await auth.api.signUpEmail({
      body: {
        email: CHEF_RENFORT.email,
        password: CHEF_RENFORT.password,
        name: `${CHEF_RENFORT.firstName} ${CHEF_RENFORT.lastName}`,
        firstName: CHEF_RENFORT.firstName,
        lastName: CHEF_RENFORT.lastName,
      },
    });
    marc = await db.user.update({
      where: { email: CHEF_RENFORT.email },
      data: {
        role: "CHEF",
        roles: JSON.stringify(["CHEF"]),
        status: "ACTIVE",
        emailVerified: true,
        unit: CHEF_RENFORT.unit,
        birthDate: CHEF_RENFORT.birthDate,
      },
    });
    console.log(`  chef de renfort créé : ${CHEF_RENFORT.email}`);
  }

  // ── Jeunes ────────────────────────────────────────────────────────────────
  const jeunes: (JeuneInput & { row: { id: string } })[] = [];
  for (const input of JEUNES) {
    jeunes.push({ ...input, row: await creerJeune(input) });
  }
  // ── Parent + lien familial ────────────────────────────────────────────────
  let parent = await db.user.findUnique({ where: { email: PARENT.email } });
  if (!parent) {
    await auth.api.signUpEmail({
      body: {
        email: PARENT.email,
        password: PARENT.password,
        name: `${PARENT.firstName} ${PARENT.lastName}`,
        firstName: PARENT.firstName,
        lastName: PARENT.lastName,
      },
    });
    parent = await db.user.update({
      where: { email: PARENT.email },
      data: {
        role: "PARENT",
        roles: JSON.stringify(["PARENT"]),
        status: "ACTIVE",
        emailVerified: true,
        // Un parent n'appartient à aucune branche : `unit` reste null, ce qui
        // vérifie au passage qu'un compte sans unité reste parfaitement utilisable.
        unit: null,
        birthDate: PARENT.birthDate,
      },
    });
    console.log(`  parent créé : ${PARENT.email}`);
  }

  for (const attendu of PARENT.enfants) {
    const enfant = jeunes.find(
      (j) => j.firstName === attendu.firstName && j.lastName === attendu.lastName,
    );
    if (!enfant) continue;
    const lien = await db.familyLink.findFirst({
      where: { parentId: parent.id, childId: enfant.row.id },
    });
    if (!lien) {
      await db.familyLink.create({
        data: { parentId: parent.id, childId: enfant.row.id },
      });
      console.log(
        `  lien familial : ${PARENT.firstName} → ${enfant.firstName} ${enfant.lastName} (${enfant.unit})`,
      );
    }
  }

  const parUnite = (unit: Unit) => jeunes.filter((j) => j.unit === unit);
  console.log(`  ${jeunes.length} jeunes (créés ou déjà présents)`);

  // ── Événements ────────────────────────────────────────────────────────────
  const evenements = new Map<string, { id: string; unit: string | null }>();
  for (const e of EVENEMENTS) {
    const existant = await db.event.findFirst({ where: { name: e.name } });
    const row =
      existant ??
      (await db.event.create({
        data: {
          name: e.name,
          type: e.type,
          unit: e.unit,
          startDate: daysFromNow(e.debutJours),
          endDate: daysFromNow(e.finJours),
          location: "Local du groupe",
          createdById: e.unit ? chefDe[e.unit] : admin.id,
          registrationOpen: e.inscriptionsOuvertes ?? false,
          registrationDeadline:
            e.inscriptionsOuvertes && e.limiteJours !== undefined
              ? daysFromNow(e.debutJours - e.limiteJours)
              : null,
        },
      }));
    evenements.set(e.name, { id: row.id, unit: row.unit });
  }
  const ouverts = EVENEMENTS.filter((e) => e.inscriptionsOuvertes).length;
  console.log(`  ${evenements.size} événements (dont ${ouverts} ouverts aux inscriptions)`);

  // ── Présences pointées sur les événements de rentrée + la journée de groupe
  // Une absence par branche : sans variété, le taux de présence affiche 100 %
  // partout et le bilan ne prouve rien.
  const aPointer = [
    "Réunion Louveteaux — rentrée",
    "Réunion Scouts — rentrée",
    "Réunion Pionniers — rentrée",
    "Journée de groupe",
  ];
  let pointages = 0;
  for (const nom of aPointer) {
    const ev = evenements.get(nom);
    if (!ev) continue;
    // Événement de groupe : tout le monde ; sinon, les jeunes de la branche.
    const concernes = ev.unit ? parUnite(ev.unit as Unit) : jeunes;
    for (const [i, j] of concernes.entries()) {
      const present = i % 4 !== 3; // un jeune sur quatre absent
      await db.attendance.upsert({
        where: { eventId_userId: { eventId: ev.id, userId: j.row.id } },
        create: {
          eventId: ev.id,
          userId: j.row.id,
          present,
          markedById: chefDe[j.unit] ?? admin.id,
        },
        update: {},
      });
      pointages += 1;
    }
  }
  console.log(`  ${pointages} présences pointées`);

  // ── Inscriptions ─────────────────────────────────────────────────────────
  // UNIQUEMENT sur les événements ouverts créés ci-dessus. Viser tous les
  // événements futurs, comme le faisait la première version, posait des
  // inscriptions sur des événements dont `registrationOpen` est faux : la fiche
  // ne rend alors ni le contrôle d'inscription ni la liste des réponses, et ces
  // lignes restent invisibles. On laisse aussi tranquilles les événements créés
  // à la main dans l'app, qui ne sont pas à nous.
  let inscriptions = 0;
  const futurs = EVENEMENTS.filter((e) => e.inscriptionsOuvertes)
    .map((e) => evenements.get(e.name))
    .filter((ev): ev is { id: string; unit: string | null } => ev !== undefined);
  for (const ev of futurs) {
    const concernes = ev.unit ? parUnite(ev.unit as Unit) : jeunes;
    for (const [i, j] of concernes.entries()) {
      await db.eventRegistration.upsert({
        where: { eventId_userId: { eventId: ev.id, userId: j.row.id } },
        create: {
          eventId: ev.id,
          userId: j.row.id,
          // Un peu de variété : la majorité présents, un « peut-être », un absent.
          response: i % 5 === 4 ? "ABSENT" : i % 3 === 2 ? "MAYBE" : "PRESENT",
        },
        update: {},
      });
      inscriptions += 1;
    }
  }
  console.log(`  ${inscriptions} inscriptions aux événements à venir`);

  // ── Référentiel pédagogique (US-S01/S02) ──────────────────────────────────
  const etapesParUnite = new Map<string, { id: string; name: string }[]>();
  for (const [unit, noms] of Object.entries(ETAPES)) {
    const liste = [];
    for (const [ordre, name] of noms.entries()) {
      const existant = await db.progressionStep.findFirst({ where: { unit, name } });
      liste.push(
        existant ??
          (await db.progressionStep.create({
            data: { unit, name, order: ordre, description: null },
          })),
      );
    }
    etapesParUnite.set(unit, liste);
  }
  console.log(
    `  ${[...etapesParUnite.values()].flat().length} étapes de progression sur 3 branches`,
  );

  const badgesParNom = new Map<string, { id: string }>();
  for (const b of BADGES) {
    const existant = await db.badge.findFirst({ where: { name: b.name } });
    badgesParNom.set(
      b.name,
      existant ??
        (await db.badge.create({
          data: {
            name: b.name,
            icon: b.icon,
            unitsJson: JSON.stringify(b.units),
            criteria: b.criteria,
          },
        })),
    );
  }
  // Quelques badges DÉJÀ attribués : l'écran d'attribution grise les jeunes qui
  // les possèdent (`awardBadge` écarte les doublons en silence, cf. AwardForm).
  // Sans ces lignes, cet état ne se voit jamais en développement.
  let attributions = 0;
  for (const unit of ["LOUVETEAUX", "SCOUTS", "PIONNIERS"] as Unit[]) {
    const membres = parUnite(unit);
    const badge = badgesParNom.get("Cuisinier");
    if (!badge || membres.length === 0) continue;
    for (const j of membres.slice(0, 2)) {
      await db.badgeAward.upsert({
        where: { badgeId_userId: { badgeId: badge.id, userId: j.row.id } },
        create: { badgeId: badge.id, userId: j.row.id, awardedById: chefDe[unit] },
        update: {},
      });
      attributions += 1;
    }
  }
  console.log(
    `  ${BADGES.length} badges au catalogue, ${attributions} déjà attribués`,
  );

  // ── Matière pédagogique : une étape validée, une EN ATTENTE de confirmation
  // Le cas « proposée » est le plus intéressant pour tester le périmètre : la
  // 2e validation ne doit pouvoir venir que d'un autre chef de LA MÊME branche.
  let validations = 0;
  for (const unit of ["LOUVETEAUX", "SCOUTS", "PIONNIERS"] as Unit[]) {
    const etapes = etapesParUnite.get(unit) ?? [];
    const membres = parUnite(unit);
    if (etapes.length === 0 || membres.length === 0) continue;
    const auteur = chefDe[unit];

    // 1re étape confirmée pour les deux premiers jeunes de la branche.
    for (const j of membres.slice(0, 2)) {
      await db.stepValidation.upsert({
        where: { stepId_userId: { stepId: etapes[0].id, userId: j.row.id } },
        create: {
          stepId: etapes[0].id,
          userId: j.row.id,
          status: "CONFIRMED",
          proposedById: auteur,
          confirmedById: admin.id,
          confirmedAt: daysFromNow(-10),
        },
        update: {},
      });
      validations += 1;
    }

    // 2e étape PROPOSÉE (en attente d'un 2e chef) pour le premier jeune.
    if (etapes[1]) {
      await db.stepValidation.upsert({
        where: { stepId_userId: { stepId: etapes[1].id, userId: membres[0].row.id } },
        create: {
          stepId: etapes[1].id,
          userId: membres[0].row.id,
          status: "PROPOSED",
          proposedById: auteur,
        },
        update: {},
      });
      validations += 1;
    }

    // Une note de suivi (donnée sensible, US-S07) sur le premier jeune.
    const dejaNote = await db.pedagogicalNote.findFirst({
      where: { userId: membres[0].row.id },
    });
    if (!dejaNote) {
      await db.pedagogicalNote.create({
        data: {
          userId: membres[0].row.id,
          authorId: auteur,
          content:
            "Prend de l'assurance dans l'équipe, à encourager sur la prise de parole en conseil.",
        },
      });
    }
  }
  console.log(`  ${validations} validations d'étape (dont 3 en attente de confirmation)`);

  console.log("\n✓ Terminé. Comptes jeunes : mot de passe commun");
  console.log(`  ${MOT_DE_PASSE} — ex. ${emailDe(JEUNES[0])}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
