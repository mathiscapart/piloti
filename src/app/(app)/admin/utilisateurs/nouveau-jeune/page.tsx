import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { requireCan } from "@/lib/require-can";
import { listActiveParents } from "@/modules/family/queries";

import { ChildAccountForm } from "./ChildAccountForm";

// US-CM-01 — création d'un compte enfant sans connexion (Farfadets/
// Louveteaux). Réservé à user.approve (SECRÉTAIRE + ADMIN), comme la
// validation des inscriptions.
export default async function NouveauJeunePage() {
  await requireCan("user.approve");
  const parents = await listActiveParents();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div>
        <Link
          href="/admin/utilisateurs"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux utilisateurs
        </Link>
      </div>

      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Administration
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Nouveau compte enfant
        </h1>
        <p className="text-trail">
          Pour les Farfadets et Louveteaux-Jeannettes, trop jeunes pour se
          connecter eux-mêmes : le compte est géré par un parent, à rattacher
          ensuite depuis la fiche membre.
        </p>
      </header>

      <ChildAccountForm parents={parents} />
    </div>
  );
}
