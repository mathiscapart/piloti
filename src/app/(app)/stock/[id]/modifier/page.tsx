import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EquipmentForm } from "@/components/equipment/EquipmentForm";
import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import { updateEquipment } from "@/modules/inventory/actions";
import { listCategories } from "@/modules/inventory/queries";
import { db } from "@/lib/db";

import { ArchiveButton } from "./archive-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireCan("equipment.update");
  const [eq, categories] = await Promise.all([
    db.equipment.findUnique({ where: { id } }),
    listCategories(),
  ]);
  if (!eq) notFound();

  // Server Action curryfiée avec l'id (Next.js Server Actions bind-friendly)
  const action = updateEquipment.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href={`/stock/${id}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour à la fiche
        </Link>
        <h1 className="text-3xl font-black text-earth">Modifier l&apos;article</h1>
        <p className="text-trail">
          Les changements sont tracés dans le journal d&apos;audit.
        </p>
      </header>

      <EquipmentForm
        action={action}
        categories={categories}
        initial={{
          name: eq.name,
          category: eq.category,
          totalQty: eq.totalQty,
          condition: eq.condition,
          location: eq.location,
          photo: eq.photo,
          notes: eq.notes,
          baseWeightKg: eq.baseWeightKg,
        }}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
      />

      {can(user, "equipment.archive") && !eq.archived ? (
        <section className="space-y-2 rounded-2xl border border-brick/30 bg-brick-soft/30 p-5">
          <h2 className="font-bold text-brick-ink">Zone administrateur</h2>
          <p className="text-sm text-earth">
            L&apos;archivage masque l&apos;article du catalogue mais conserve
            son historique. Action réservée aux administrateurs.
          </p>
          <ArchiveButton id={id} />
        </section>
      ) : null}
    </div>
  );
}
