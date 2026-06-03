import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { IncidentForm } from "@/components/incidents/IncidentForm";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/require-can";

interface PageProps {
  searchParams: Promise<{ equipmentId?: string; loanId?: string }>;
}

export default async function NewIncidentPage({ searchParams }: PageProps) {
  await requireCan("incident.report");
  const params = await searchParams;

  const equipment = await db.equipment.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux incidents
        </Link>
        <h1 className="text-3xl font-black text-earth">
          Signaler un incident
        </h1>
        <p className="text-trail">
          Décris le problème, joins des photos si possible. Plus c&apos;est
          précis, plus la réparation est rapide.
        </p>
      </header>

      <IncidentForm
        equipment={equipment}
        preselectedEquipmentId={params.equipmentId}
        loanId={params.loanId}
      />
    </div>
  );
}
