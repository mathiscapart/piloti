import "server-only";

import { db } from "@/lib/db";

// Rattachement familial — lecture des liens d'un membre et listes de comptes
// rattachables (pour les sélecteurs d'ajout, réservés à user.manage).

const MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  image: true,
  unit: true,
} as const;

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

// Les liens d'un membre : ses enfants (s'il est parent) et ses parents (s'il
// est jeune).
export async function getFamilyForMember(userId: string) {
  const [asParent, asChild] = await Promise.all([
    db.familyLink.findMany({
      where: { parentId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, child: { select: MEMBER_SELECT } },
    }),
    db.familyLink.findMany({
      where: { childId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, parent: { select: MEMBER_SELECT } },
    }),
  ]);

  return {
    children: asParent.map((l) => ({ linkId: l.id, user: l.child })),
    parents: asChild.map((l) => ({ linkId: l.id, user: l.parent })),
  };
}

export type MemberFamily = Awaited<ReturnType<typeof getFamilyForMember>>;

// Jeunes (rôle SCOUT) actifs non encore rattachés à ce parent.
export async function listLinkableChildren(parentId: string) {
  const [candidates, links] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE", roles: { contains: "SCOUT" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, unit: true, roles: true },
    }),
    db.familyLink.findMany({
      where: { parentId },
      select: { childId: true },
    }),
  ]);
  const linked = new Set(links.map((l) => l.childId));
  return candidates
    .filter((u) => hasRole(u.roles, "SCOUT") && u.id !== parentId && !linked.has(u.id))
    .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, unit: u.unit }));
}

// Parents (rôle PARENT) actifs non encore rattachés à ce jeune.
export async function listLinkableParents(childId: string) {
  const [candidates, links] = await Promise.all([
    db.user.findMany({
      where: { status: "ACTIVE", roles: { contains: "PARENT" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, unit: true, roles: true },
    }),
    db.familyLink.findMany({
      where: { childId },
      select: { parentId: true },
    }),
  ]);
  const linked = new Set(links.map((l) => l.parentId));
  return candidates
    .filter((u) => hasRole(u.roles, "PARENT") && u.id !== childId && !linked.has(u.id))
    .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, unit: u.unit }));
}

export type LinkableUser = Awaited<ReturnType<typeof listLinkableChildren>>[number];

// Les enfants rattachés à un parent (pour l'inscription aux événements, US-P04).
export async function getChildrenOf(parentId: string) {
  const links = await db.familyLink.findMany({
    where: { parentId },
    orderBy: { createdAt: "asc" },
    select: { child: { select: MEMBER_SELECT } },
  });
  return links.map((l) => l.child);
}

// Vérifie qu'un compte est bien rattaché comme enfant d'un parent (autorisation).
export async function isChildOf(parentId: string, childId: string): Promise<boolean> {
  const link = await db.familyLink.findUnique({
    where: { parentId_childId: { parentId, childId } },
    select: { id: true },
  });
  return link !== null;
}
