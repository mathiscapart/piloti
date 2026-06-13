import { Scale, Wallet } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { listBrackets } from "@/modules/finance/brackets";

import { BracketsAdmin } from "./BracketsAdmin";

export default async function BracketsPage() {
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");
  const canManage = can(user, "campaign.manage");

  const brackets = await listBrackets();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Wallet className="size-3.5" />
          Finances
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Tranches de quotient familial
        </h1>
        <p className="text-sm text-trail">
          Définies une fois pour le groupe. Chaque famille est rangée dans une
          tranche, appliquée automatiquement aux événements et aux cotisations.
        </p>
      </header>

      {brackets.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Aucune tranche"
          description="Crée tes tranches (T1, T2…) avec leur coefficient (en % du tarif plein). Les familles modestes paient moins, les plus aisées un peu plus pour équilibrer."
        />
      ) : null}

      <BracketsAdmin brackets={brackets} canManage={canManage} />
    </div>
  );
}
