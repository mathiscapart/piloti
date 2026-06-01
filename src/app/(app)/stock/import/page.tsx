import { ArrowLeft, ShieldOff, Upload } from "lucide-react";
import Link from "next/link";

import { ImportClient } from "@/components/equipment/ImportClient";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";

export default async function ImportEquipmentPage() {
  const user = await getCurrentUser();
  if (!can(user, "equipment.create")) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
        <div className="rounded-full bg-brick-soft p-4 text-brick-ink">
          <ShieldOff className="size-8" />
        </div>
        <h1 className="text-2xl font-black text-earth">Accès refusé</h1>
        <p className="text-trail">L&apos;import est réservé aux responsables matériel.</p>
      </div>
    );
  }

  const [categories, existing] = await Promise.all([
    db.category.findMany({
      where: { archived: false },
      select: { slug: true, label: true },
    }),
    db.equipment.findMany({ select: { name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/stock"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour au stock
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
          <Upload className="size-7 text-forest" />
          Importer l&apos;inventaire
        </h1>
        <p className="text-trail">
          Télécharge le gabarit, complète-le, puis colle ou charge le CSV.
          L&apos;aperçu signale les erreurs et doublons avant l&apos;import.
        </p>
      </header>

      <ImportClient
        categories={categories}
        existingNames={existing.map((e) => e.name)}
      />
    </div>
  );
}
