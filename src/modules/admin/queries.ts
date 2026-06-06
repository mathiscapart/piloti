import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export async function listPendingUsers() {
  return db.user.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      unit: true,
      phone: true,
      requestedRole: true,
      createdAt: true,
    },
  });
}

// Utilisateurs gérables (tout sauf PENDING/REJECTED — ces deux états sont gérés
// via /admin/inscriptions). On expose ACTIVE et SUSPENDED ici.
export async function listManageableUsers() {
  return db.user.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    orderBy: [{ status: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      roles: true,
      status: true,
      unit: true,
      phone: true,
      createdAt: true,
    },
  });
}

// ----------------------------------------------------------------------------
// Audit log timeline (paginé + filtres)
// ----------------------------------------------------------------------------

export interface AuditFilters {
  action?: string;
  userId?: string;
  equipmentId?: string;
}

const PAGE_SIZE = 50;

export async function listAuditLog(filters: AuditFilters & { page?: number } = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.userId) where.userId = filters.userId;
  if (filters.equipmentId) where.equipmentId = filters.equipmentId;

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        equipment: { select: { id: true, name: true } },
        loan: { select: { id: true } },
        incident: { select: { id: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

export type AuditLogPage = Awaited<ReturnType<typeof listAuditLog>>;
export type AuditLogItem = AuditLogPage["items"][number];

// Actions distinctes pour peupler le filtre
export async function listAuditActions() {
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    orderBy: { action: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}

// Users qui ont au moins une entrée audit (pour peupler le filtre)
export async function listAuditUsers() {
  const userIds = await db.auditLog.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });
  if (userIds.length === 0) return [];
  return db.user.findMany({
    where: { id: { in: userIds.map((u) => u.userId) } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
}
