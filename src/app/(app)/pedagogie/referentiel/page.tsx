import { GraduationCap } from "lucide-react";
import { redirect } from "next/navigation";

import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listBadges, listSteps } from "@/modules/pedagogy/referential";

import { BadgesManager } from "./BadgesManager";
import { StepsManager } from "./StepsManager";

export default async function ReferentialPage() {
  const user = await getCurrentUser();
  if (!can(user, "pedago.referential")) redirect("/dashboard");

  const [steps, badges] = await Promise.all([listSteps(), listBadges()]);

  const stepsByUnit = UNITS.map((u) => ({
    unit: u,
    label: UNIT_LABEL[u as Unit],
    steps: steps
      .filter((s) => s.unit === u)
      .map((s) => ({ id: s.id, name: s.name, description: s.description })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <GraduationCap className="size-3.5" />
          Suivi pédagogique
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">Référentiels</h1>
        <p className="text-sm text-trail">
          Étapes de progression par branche et catalogue de badges. Ils
          alimentent la fiche progression de chaque jeune.
        </p>
      </header>

      <StepsManager groups={stepsByUnit} />
      <BadgesManager badges={badges} />
    </div>
  );
}
