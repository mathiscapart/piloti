import { Award } from "lucide-react";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { UNITS } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, scopedUnits } from "@/lib/permissions";
import { listBadges } from "@/modules/pedagogy/referential";

import { AwardForm } from "./AwardForm";

function hasRole(rolesJson: string, role: string): boolean {
  try {
    return (JSON.parse(rolesJson) as string[]).includes(role);
  } catch {
    return false;
  }
}

export default async function AwardPage() {
  const user = await getCurrentUser();
  if (!can(user, "pedago.manage")) redirect("/dashboard");

  // Périmètre d'unité : un chef n'attribue de badge qu'aux jeunes de sa branche.
  // Le filtre est ici côté requête (et non dans un garde) : la page propose une
  // sélection, autant ne pas y faire figurer des jeunes que l'action refusera.
  // Périmètre complet (ADMIN/RG) → aucun filtre, pour ne pas exclure au passage
  // les jeunes sans unité renseignée.
  const visibles = scopedUnits(user, UNITS);
  const unitFilter =
    visibles.length === UNITS.length ? {} : { unit: { in: visibles } };

  const [badges, candidates] = await Promise.all([
    listBadges(),
    db.user.findMany({
      where: { status: "ACTIVE", roles: { contains: "SCOUT" }, ...unitFilter },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, image: true, unit: true, roles: true },
    }),
  ]);

  const jeunes = candidates
    .filter((u) => hasRole(u.roles, "SCOUT"))
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      image: u.image,
      unit: u.unit,
    }));

  // US-S05 — qui possède déjà quoi. `awardBadge` écarte les doublons en
  // silence : sans cette information, l'écran laisse cocher des jeunes qui ont
  // déjà le badge et annonce ensuite un nombre d'attributions faux.
  const attributions = await db.badgeAward.findMany({
    where: { userId: { in: jeunes.map((j) => j.id) } },
    select: { badgeId: true, userId: true },
  });
  const dejaAttribue: Record<string, string[]> = {};
  for (const a of attributions) {
    (dejaAttribue[a.badgeId] ??= []).push(a.userId);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Award className="size-3.5" />
          Suivi pédagogique
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Attribuer un badge
        </h1>
        <p className="text-sm text-trail">
          Choisis un badge et coche les jeunes concernés (après une activité, un
          atelier…).
        </p>
      </header>

      <AwardForm badges={badges} jeunes={jeunes} dejaAttribue={dejaAttribue} />
    </div>
  );
}
