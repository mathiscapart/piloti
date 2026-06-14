import "server-only";

import { db } from "@/lib/db";

// US-S01/S02 — référentiels : étapes de progression (par branche) et catalogue
// de badges. Lecture.

function parseUnits(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function listSteps(unit?: string) {
  return db.progressionStep.findMany({
    where: { archived: false, ...(unit ? { unit } : {}) },
    orderBy: [{ unit: "asc" }, { order: "asc" }],
  });
}

export interface BadgeVM {
  id: string;
  name: string;
  icon: string | null;
  criteria: string | null;
  units: string[];
}

export async function listBadges(): Promise<BadgeVM[]> {
  const badges = await db.badge.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });
  return badges.map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    criteria: b.criteria,
    units: parseUnits(b.unitsJson),
  }));
}

// Badges proposés pour une branche donnée (ceux sans restriction OU incluant l'unité).
export async function listBadgesForUnit(unit: string | null): Promise<BadgeVM[]> {
  const badges = await listBadges();
  if (!unit) return badges;
  return badges.filter((b) => b.units.length === 0 || b.units.includes(unit));
}
