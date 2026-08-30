import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";

// Agrégateur du tableau de bord.
//
// Ce module ne possède aucune donnée : il lit celles des autres domaines pour
// répondre à une seule question — « qu'est-ce qui attend une action de moi ? ».
// C'est la seule raison d'être d'un tableau de bord, et c'est ce qui justifie
// un module transverse plutôt qu'une requête par domaine appelée depuis la page.
//
// RÈGLE — chaque élément est conditionné à une permission. On ne compte jamais
// ce que l'utilisateur n'a pas le droit de voir : afficher « 3 signalements en
// attente » à quelqu'un qui ne peut pas les ouvrir est au mieux inutile, au
// pire une fuite d'information sur l'activité de modération.

/** Un point d'attention actionnable : un compte, un libellé, une destination. */
export interface ActionItem {
  key: string;
  count: number;
  label: string;
  href: string;
  /** `urgent` = rouge ; `attention` = ambre ; `info` = neutre. */
  tone: "urgent" | "attention" | "info";
}

const pluriel = (n: number, singulier: string, pluriel: string) =>
  `${n} ${n > 1 ? pluriel : singulier}`;

/**
 * Ce qui attend une action de l'utilisateur, tous domaines confondus.
 *
 * Les comptages partent en une seule transaction : sur SQLite, une dizaine de
 * requêtes séquentielles sur le chemin critique du tableau de bord se sentent.
 * On ne demande QUE les compteurs autorisés — un `can()` faux ne coûte même pas
 * la requête.
 */
export async function getActionItems(user: CurrentUser): Promise<ActionItem[]> {
  const veut = {
    expenses: can(user, "expense.manage"),
    incidents: can(user, "incident.view"),
    reports: can(user, "moderation.review"),
    accounts: can(user, "user.approve"),
    places: can(user, "place.owner_contact.view"),
    imageRights: can(user, "member.image_rights.manage"),
    attendance: can(user, "event.manage"),
  };

  const maintenant = new Date();

  const [
    expenses,
    incidentsBloquants,
    reports,
    accounts,
    places,
    sansDroitImage,
    evenementsNonPointes,
  ] = await db.$transaction([
    veut.expenses
      ? db.expense.count({ where: { status: "PENDING" } })
      : db.expense.count({ where: { id: "" } }),
    veut.incidents
      ? db.incident.count({ where: { resolvedAt: null, severity: "BLOQUANT" } })
      : db.incident.count({ where: { id: "" } }),
    veut.reports
      ? db.report.count({ where: { status: "PENDING" } })
      : db.report.count({ where: { id: "" } }),
    veut.accounts
      ? db.user.count({ where: { status: "PENDING" } })
      : db.user.count({ where: { id: "" } }),
    // RGPD-09 — un lieu dont le propriétaire n'a pas répondu garde un contact
    // masqué et inutilisable. Sans rappel ici, personne ne cliquera jamais
    // « Envoyer la demande » et l'obligation d'information restera lettre morte.
    veut.places
      ? db.campPlace.count({
          where: { archived: false, ownerConsentStatus: "PENDING", ownerEmail: { not: null } },
        })
      : db.campPlace.count({ where: { id: "" } }),
    // US-C08 — jeunes sans position enregistrée sur le droit à l'image. La
    // question se pose AVANT le camp où l'on prend des photos, pas après.
    veut.imageRights
      ? db.user.count({
          where: {
            status: "ACTIVE",
            role: "SCOUT",
            consents: { none: { type: "IMAGE_RIGHTS" } },
          },
        })
      : db.user.count({ where: { id: "" } }),
    // Événements passés dont personne n'a fait l'appel.
    veut.attendance
      ? db.event.count({
          where: { endDate: { lt: maintenant }, attendances: { none: {} } },
        })
      : db.event.count({ where: { id: "" } }),
  ]);

  const items: ActionItem[] = [];
  const pousser = (
    autorise: boolean,
    n: number,
    key: string,
    label: string,
    href: string,
    tone: ActionItem["tone"],
  ) => {
    if (autorise && n > 0) items.push({ key, count: n, label, href, tone });
  };

  pousser(veut.incidents, incidentsBloquants, "incidents",
    pluriel(incidentsBloquants, "incident bloquant", "incidents bloquants"),
    "/incidents", "urgent");

  pousser(veut.accounts, accounts, "comptes",
    pluriel(accounts, "compte en attente de validation", "comptes en attente de validation"),
    "/admin/utilisateurs", "attention");

  pousser(veut.reports, reports, "moderation",
    pluriel(reports, "signalement à traiter", "signalements à traiter"),
    "/moderation", "urgent");

  pousser(veut.expenses, expenses, "notes",
    pluriel(expenses, "note de frais à valider", "notes de frais à valider"),
    "/finances/notes", "attention");

  pousser(veut.attendance, evenementsNonPointes, "presences",
    pluriel(evenementsNonPointes, "événement passé sans appel", "événements passés sans appel"),
    "/planning/presences", "info");

  pousser(veut.imageRights, sansDroitImage, "image",
    pluriel(sansDroitImage, "jeune sans droit à l'image renseigné", "jeunes sans droit à l'image renseigné"),
    "/membres", "info");

  pousser(veut.places, places, "lieux",
    pluriel(places, "propriétaire de lieu à solliciter", "propriétaires de lieux à solliciter"),
    "/lieux", "info");

  return items;
}

export interface NextEvent {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  location: string | null;
  unit: string | null;
  registrationOpen: boolean;
  registeredCount: number;
  /** Réponse de l'utilisateur, `null` s'il ne s'est pas prononcé. */
  myResponse: string | null;
}

/**
 * Le prochain événement qui CONCERNE l'utilisateur.
 *
 * Deux périmètres, et la distinction compte.
 *
 * Pour un MEMBRE, on applique D-025 : un événement d'unité ne concerne que sa
 * branche, ceux du groupe entier concernent tout le monde. Lui montrer le
 * week-end d'une autre branche serait du bruit — il ne peut pas s'y inscrire.
 *
 * Pour qui ORGANISE (`event.manage`), aucun filtre d'unité : un chef ou un
 * responsable de groupe a besoin de voir ce qui arrive, y compris hors de sa
 * branche. D-025 régit le périmètre des INSCRIPTIONS, pas celui de la
 * visibilité de ceux qui pilotent — les confondre affichait « rien à venir » à
 * un administrateur alors que deux événements approchaient.
 */
export async function getNextEvent(user: CurrentUser): Promise<NextEvent | null> {
  if (!can(user, "event.view")) return null;
  const organise = can(user, "event.manage");

  const ev = await db.event.findFirst({
    where: {
      endDate: { gte: new Date() },
      ...(organise
        ? {}
        : { OR: [{ unit: null }, ...(user.unit ? [{ unit: user.unit }] : [])] }),
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true, name: true, startDate: true, endDate: true,
      location: true, unit: true, registrationOpen: true,
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      registrations: {
        where: { userId: user.id },
        select: { response: true },
        take: 1,
      },
    },
  });
  if (!ev) return null;

  return {
    id: ev.id, name: ev.name, startDate: ev.startDate, endDate: ev.endDate,
    location: ev.location, unit: ev.unit, registrationOpen: ev.registrationOpen,
    registeredCount: ev._count.registrations,
    myResponse: ev.registrations[0]?.response ?? null,
  };
}

export interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  unit: string | null;
  /** Position sur le droit à l'image, `null` si jamais renseignée. */
  imageRights: string | null;
}

/**
 * Les enfants rattachés au parent connecté.
 *
 * Un parent voyait jusqu'ici un encart « Bienvenue » qui le renvoyait ailleurs,
 * alors que l'application connaît ses enfants. On lui montre ce qui le concerne
 * réellement, et ce qu'il est le seul à pouvoir compléter.
 */
export async function getMyChildren(user: CurrentUser): Promise<ChildSummary[]> {
  const liens = await db.familyLink.findMany({
    where: { parentId: user.id },
    select: {
      child: {
        select: {
          id: true, firstName: true, lastName: true, unit: true,
          consents: {
            where: { type: "IMAGE_RIGHTS" },
            orderBy: { acceptedAt: "desc" },
            select: { value: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return liens.map(({ child }) => ({
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    unit: child.unit,
    imageRights: child.consents[0]?.value ?? null,
  }));
}
