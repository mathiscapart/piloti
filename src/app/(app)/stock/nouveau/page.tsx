import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { EquipmentForm } from "@/components/equipment/EquipmentForm";
import { requireCan } from "@/lib/require-can";
import { createEquipment } from "@/modules/inventory/actions";
import { listCategories } from "@/modules/inventory/queries";

export default async function NewEquipmentPage() {
  await requireCan("equipment.create");
  const categories = await listCategories();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/stock"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour au stock
        </Link>
        <h1 className="text-3xl font-black text-earth">Nouvel article</h1>
        <p className="text-trail">
          Ajoute un article au catalogue. Toutes les modifications sont
          tracées dans le journal d&apos;audit.
        </p>
      </header>

      <EquipmentForm
        action={createEquipment}
        categories={categories}
        submitLabel="Créer l'article"
        pendingLabel="Création…"
      />
    </div>
  );
}
