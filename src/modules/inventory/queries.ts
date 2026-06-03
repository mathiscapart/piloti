import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ACTIVE_LOAN_STATUSES } from "@/lib/enums";

// Days ahead used to flag loans as "coming due soon" on the dashboard.
const UPCOMING_DUE_DAYS = 3;

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------

export async function getDashboardData() {
  const [equipmentList, activeLoanCount, openIncidentCount, lateLoans] =
    await Promise.all([
      db.equipment.findMany({
        where: { archived: false },
        select: {
          id: true,
          totalQty: true,
          loans: {
            where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
            select: { quantity: true },
          },
        },
      }),
      db.loan.count({
        where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
      }),
      db.incident.count({
        where: { resolvedAt: null },
      }),
      db.loan.findMany({
        where: {
          OR: [
            { status: "RETARD" },
            { AND: [{ status: "ACTIF" }, { expectedReturn: { lt: new Date() } }] },
          ],
        },
        orderBy: { expectedReturn: "asc" },
        select: {
          id: true,
          expectedReturn: true,
          eventName: true,
          equipment: { select: { name: true } },
          borrower: { select: { firstName: true, lastName: true, phone: true } },
        },
      }),
    ]);

  const availableArticleCount = equipmentList.filter((eq) => {
    const loanedQty = eq.loans.reduce((sum, l) => sum + l.quantity, 0);
    return loanedQty < eq.totalQty;
  }).length;

  return {
    availableArticleCount,
    activeLoanCount,
    openIncidentCount,
    lateLoans,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

// ----------------------------------------------------------------------------
// Catalogue (liste)
// ----------------------------------------------------------------------------

export interface ListEquipmentOpts {
  search?: string;
  category?: string;
  includeArchived?: boolean;
}

export async function listEquipment(opts: ListEquipmentOpts = {}) {
  const where: Prisma.EquipmentWhereInput = {};
  if (!opts.includeArchived) where.archived = false;
  if (opts.search && opts.search.trim().length > 0) {
    where.name = { contains: opts.search.trim() };
  }
  if (opts.category) {
    // US-24 : filtrer par une catégorie parente inclut ses sous-catégories.
    const children = await db.category.findMany({
      where: { parentSlug: opts.category },
      select: { slug: true },
    });
    const slugs = [opts.category, ...children.map((c) => c.slug)];
    where.category = { in: slugs };
  }

  const equipment = await db.equipment.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      condition: true,
      location: true,
      photo: true,
      totalQty: true,
      archived: true,
      loans: {
        where: { status: { in: [...ACTIVE_LOAN_STATUSES] } },
        select: { quantity: true },
      },
      incidents: {
        where: { resolvedAt: null },
        select: { id: true },
      },
    },
  });

  return equipment.map((eq) => {
    const loanedQty = eq.loans.reduce((sum, loan) => sum + loan.quantity, 0);
    return {
      id: eq.id,
      name: eq.name,
      category: eq.category,
      condition: eq.condition,
      location: eq.location,
      photo: eq.photo,
      totalQty: eq.totalQty,
      archived: eq.archived,
      loanedQty,
      availableQty: Math.max(0, eq.totalQty - loanedQty),
      openIncidentCount: eq.incidents.length,
    };
  });
}

export type EquipmentListItem = Awaited<ReturnType<typeof listEquipment>>[number];

// ----------------------------------------------------------------------------
// Catalogue (détail)
// ----------------------------------------------------------------------------

export async function getEquipmentDetail(id: string) {
  const eq = await db.equipment.findUnique({
    where: { id },
    include: {
      loans: {
        orderBy: { startDate: "desc" },
        take: 30,
        include: {
          borrower: { select: { firstName: true, lastName: true } },
          returnedBy: { select: { firstName: true, lastName: true } },
        },
      },
      incidents: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          reporter: { select: { firstName: true, lastName: true } },
          resolvedBy: { select: { firstName: true, lastName: true } },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!eq) return null;

  const activeLoans = eq.loans.filter((l) =>
    ACTIVE_LOAN_STATUSES.includes(l.status as (typeof ACTIVE_LOAN_STATUSES)[number]),
  );
  const loanedQty = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);
  const inRepairQty = eq.condition === "A_REPARER" || eq.condition === "HORS_SERVICE" ? eq.totalQty : 0;
  const availableQty = Math.max(0, eq.totalQty - loanedQty - inRepairQty);

  return {
    ...eq,
    stats: {
      totalQty: eq.totalQty,
      availableQty,
      loanedQty,
      inRepairQty,
    },
    openIncidentCount: eq.incidents.filter((i) => !i.resolvedAt).length,
  };
}

export type EquipmentDetail = NonNullable<
  Awaited<ReturnType<typeof getEquipmentDetail>>
>;

// ----------------------------------------------------------------------------
// Categories
// ----------------------------------------------------------------------------

// US-31 — par défaut on masque les catégories archivées (listes de choix :
// stock, formulaire article, prêt…). L'admin passe `includeArchived: true`.
export async function listCategories(opts: { includeArchived?: boolean } = {}) {
  return db.category.findMany({
    where: opts.includeArchived ? undefined : { archived: false },
    orderBy: [{ order: "asc" }, { label: "asc" }],
  });
}

export type CategoryRow = Awaited<ReturnType<typeof listCategories>>[number];

// US-24 — arborescence : catégories parentes (parentSlug null) triées, chacune
// avec ses sous-catégories triées. « Autre » est repoussée en dernier (US-31).
export async function listCategoryTree(opts: { includeArchived?: boolean } = {}) {
  const all = await db.category.findMany({
    where: opts.includeArchived ? undefined : { archived: false },
    orderBy: [{ order: "asc" }, { label: "asc" }],
  });

  const roots = all.filter((c) => c.parentSlug === null);
  const childrenOf = (slug: string) => all.filter((c) => c.parentSlug === slug);

  const tree = roots
    .map((root) => ({ ...root, children: childrenOf(root.slug) }))
    // « Autre » (réceptacle par défaut, US-31) toujours en dernier.
    .sort((a, b) => (a.slug === "AUTRE" ? 1 : 0) - (b.slug === "AUTRE" ? 1 : 0));

  return tree;
}

export type CategoryTreeNode = Awaited<
  ReturnType<typeof listCategoryTree>
>[number];

// ----------------------------------------------------------------------------
// Loans — liste & détail
// ----------------------------------------------------------------------------

export type LoanFilter = "all" | "retard" | "bientot" | "sechage" | "actifs";

export async function listLoans(filter: LoanFilter = "all") {
  const now = new Date();
  const inNDays = new Date(now.getTime() + UPCOMING_DUE_DAYS * 24 * 60 * 60 * 1000);

  const where: Prisma.LoanWhereInput = {};

  switch (filter) {
    case "retard":
      where.OR = [
        { status: "RETARD" },
        { AND: [{ status: "ACTIF" }, { expectedReturn: { lt: now } }] },
      ];
      break;
    case "bientot":
      where.status = "ACTIF";
      where.expectedReturn = { gte: now, lte: inNDays };
      break;
    case "sechage":
      where.status = "SECHAGE";
      break;
    case "actifs":
      where.status = { in: ["ACTIF", "RETARD", "SECHAGE"] };
      break;
    case "all":
    default:
      // No filter: returns all statuses including RETOURNE (closed loans).
      break;
  }

  const loans = await db.loan.findMany({
    where,
    orderBy: [{ expectedReturn: "asc" }],
    include: {
      equipment: { select: { id: true, name: true, category: true } },
      borrower: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
      // US-23 — contact de séchage rattaché à un compte (pour identifier/joindre).
      dryingContact: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
    },
  });

  return loans;
}

export type LoanListItem = Awaited<ReturnType<typeof listLoans>>[number];

export async function getLoanDetail(id: string) {
  return db.loan.findUnique({
    where: { id },
    include: {
      equipment: {
        select: {
          id: true,
          name: true,
          category: true,
          condition: true,
          baseWeightKg: true,
        },
      },
      borrower: {
        select: { firstName: true, lastName: true, phone: true },
      },
      returnedBy: { select: { firstName: true, lastName: true } },
    },
  });
}

// US-20 — normalise une chaîne pour une recherche insensible à la casse ET aux
// accents (SQLite `LIKE` ne gère pas les accents). « Tenté » == « tente ».
function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Équipement sélectionnable dans le wizard. Inclut tout (archived false),
// marque comme "déjà en cours" ceux qui sont HORS_SERVICE/A_REPARER ou dont la
// quantité disponible est nulle.
// US-12 — si `period` est fourni, la disponibilité est calculée pour CETTE
// période : seuls les prêts actifs qui chevauchent [start, end] consomment du
// stock (un article rendu avant ou prêté après reste disponible). Sans période,
// on retombe sur "tous les prêts actifs" (comportement historique).
export async function listBorrowableEquipment(
  search?: string,
  period?: { start: Date; end: Date },
) {
  const equipment = await db.equipment.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      condition: true,
      totalQty: true,
      photo: true,
      location: true,
      loans: {
        where: period
          ? {
              status: { in: [...ACTIVE_LOAN_STATUSES] },
              startDate: { lte: period.end },
              expectedReturn: { gte: period.start },
            }
          : { status: { in: [...ACTIVE_LOAN_STATUSES] } },
        select: { quantity: true },
      },
    },
  });

  // US-20 — recherche par nom ET catégorie (slug + libellé), insensible à la
  // casse et aux accents. Filtré en mémoire pour le support des accents ; le
  // volume d'inventaire d'un groupe reste modeste.
  const term = normalizeSearch(search ?? "");
  let rows = equipment;
  if (term.length > 0) {
    const categories = await db.category.findMany({
      select: { slug: true, label: true },
    });
    const labelBySlug = new Map(categories.map((c) => [c.slug, c.label]));
    rows = equipment.filter((eq) => {
      const haystack = normalizeSearch(
        `${eq.name} ${eq.category} ${labelBySlug.get(eq.category) ?? ""}`,
      );
      return haystack.includes(term);
    });
  }

  return rows.map((eq) => {
    const loanedQty = eq.loans.reduce((sum, loan) => sum + loan.quantity, 0);
    const availableQty = Math.max(0, eq.totalQty - loanedQty);
    const isBroken =
      eq.condition === "A_REPARER" || eq.condition === "HORS_SERVICE";
    return {
      id: eq.id,
      name: eq.name,
      category: eq.category,
      condition: eq.condition,
      totalQty: eq.totalQty,
      photo: eq.photo,
      location: eq.location,
      availableQty,
      disabled: availableQty <= 0 || isBroken,
      disabledReason: isBroken
        ? eq.condition === "HORS_SERVICE"
          ? "Hors service"
          : "À réparer"
        : availableQty <= 0
          ? period
            ? "Indispo ces dates"
            : "Déjà prêté"
          : undefined,
    };
  });
}

export type BorrowableEquipment = Awaited<
  ReturnType<typeof listBorrowableEquipment>
>[number];

// Utilisateurs candidats à devenir emprunteur. ACTIVE only.
export async function listBorrowers() {
  return db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      unit: true,
    },
  });
}

export type BorrowerOption = Awaited<ReturnType<typeof listBorrowers>>[number];

// US-14 — fiche d'un membre + le matériel qu'il détient actuellement (prêts
// actifs), pour le contacter rapidement.
export async function getMemberDetail(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      unit: true,
      role: true,
      roles: true,
      status: true,
      // US-26 — profil parent enrichi
      profession: true,
      skills: true,
      availability: true,
      helpNotes: true,
      skillsConsent: true,
    },
  });
  if (!user) return null;

  const loans = await db.loan.findMany({
    where: { borrowerId: id, status: { in: [...ACTIVE_LOAN_STATUSES] } },
    orderBy: [{ expectedReturn: "asc" }],
    include: {
      equipment: { select: { id: true, name: true, category: true } },
    },
  });

  return { user, loans };
}

export type MemberDetail = NonNullable<
  Awaited<ReturnType<typeof getMemberDetail>>
>;

// US-26 — annuaire des compétences : parents AYANT CONSENTI (RGPD), filtrables
// par profession / compétences / disponibilités. Réservé aux Responsables de
// Groupe (vérifié côté page via la permission member.directory).
export async function listParentDirectory(search?: string) {
  // US-32 — rôles unifiés : on filtre les comptes dont `roles` contient PARENT
  // (JSON), en mémoire (volume modeste).
  const candidates = await db.user.findMany({
    where: {
      status: "ACTIVE",
      skillsConsent: true,
      roles: { contains: "PARENT" },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      roles: true,
      profession: true,
      skills: true,
      availability: true,
    },
  });
  // `contains` sur le JSON est une présélection ; on confirme l'appartenance.
  const parents = candidates
    .filter((p) => {
      try {
        return (JSON.parse(p.roles) as string[]).includes("PARENT");
      } catch {
        return false;
      }
    })
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      profession: p.profession,
      skills: p.skills,
      availability: p.availability,
    }));

  const term = normalizeSearch(search ?? "");
  if (term.length === 0) return parents;
  return parents.filter((p) =>
    normalizeSearch(
      `${p.profession ?? ""} ${p.skills ?? ""} ${p.availability ?? ""}`,
    ).includes(term),
  );
}

export type ParentDirectoryEntry = Awaited<
  ReturnType<typeof listParentDirectory>
>[number];

// ----------------------------------------------------------------------------
// Incidents — liste & détail
// ----------------------------------------------------------------------------

export type IncidentStatusFilter = "open" | "resolved" | "all";
export type IncidentSeverityFilter = "all" | "BLOQUANT" | "GENANT" | "MINEUR";

export async function listIncidents(opts: {
  status?: IncidentStatusFilter;
  severity?: IncidentSeverityFilter;
} = {}) {
  const where: Prisma.IncidentWhereInput = {};
  if (opts.status === "open") where.resolvedAt = null;
  if (opts.status === "resolved") where.resolvedAt = { not: null };
  if (opts.severity && opts.severity !== "all") where.severity = opts.severity;

  return db.incident.findMany({
    where,
    orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    include: {
      equipment: { select: { id: true, name: true, category: true } },
      reporter: { select: { firstName: true, lastName: true } },
      resolvedBy: { select: { firstName: true, lastName: true } },
    },
  });
}

export type IncidentListItem = Awaited<ReturnType<typeof listIncidents>>[number];

// ----------------------------------------------------------------------------
// Donations (US-25)
// ----------------------------------------------------------------------------

export type DonationStatusFilter = "pending" | "processed" | "all";

export async function listDonations(filter: DonationStatusFilter = "pending") {
  const where: Prisma.DonationWhereInput = {};
  if (filter === "pending") where.status = "PENDING";
  if (filter === "processed") where.status = { in: ["APPROVED", "REJECTED"] };

  return db.donation.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
  });
}

export type DonationListItem = Awaited<ReturnType<typeof listDonations>>[number];

export async function countPendingDonations() {
  return db.donation.count({ where: { status: "PENDING" } });
}
