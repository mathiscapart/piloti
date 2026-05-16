import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listBorrowableEquipment,
  listBorrowers,
} from "@/modules/inventory/queries";

import { Step1Select } from "./step1-select";
import { Step2Details } from "./step2-details";

interface PageProps {
  searchParams: Promise<{
    step?: string;
    q?: string;
    equipmentId?: string | string[];
  }>;
}

export default async function NewLoanPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const step = params.step === "2" ? 2 : 1;
  const search = (params.q ?? "").trim();

  // Normalise equipmentId en string[]
  const selectedIds = Array.isArray(params.equipmentId)
    ? params.equipmentId
    : params.equipmentId
      ? [params.equipmentId]
      : [];

  // Step 2 sans sélection → reretour étape 1
  if (step === 2 && selectedIds.length === 0) {
    redirect("/prets/nouveau");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/prets"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux prêts
        </Link>
        <h1 className="text-3xl font-black text-earth">Nouveau prêt</h1>

        <ProgressBar step={step} />
      </header>

      {step === 1 ? <Step1Page search={search} preselected={selectedIds} /> : <Step2Page selectedIds={selectedIds} />}
    </div>
  );
}

async function Step1Page({
  search,
  preselected,
}: {
  search: string;
  preselected: string[];
}) {
  const equipment = await listBorrowableEquipment(search);
  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-earth">
          Étape 1 — Choisir le matériel
        </h2>
        <p className="text-sm text-trail">
          Coche un ou plusieurs articles. Les articles déjà prêtés ou en
          réparation sont grisés.
        </p>
      </div>
      <Step1Select
        equipment={equipment}
        preselected={preselected}
        initialSearch={search}
      />
    </>
  );
}

async function Step2Page({ selectedIds }: { selectedIds: string[] }) {
  const [allEquipment, borrowers] = await Promise.all([
    listBorrowableEquipment(),
    listBorrowers(),
  ]);
  const selectedEquipment = allEquipment.filter((eq) =>
    selectedIds.includes(eq.id),
  );

  if (selectedEquipment.length === 0) {
    // IDs invalides → on renvoie au step 1
    return (
      <div className="rounded-2xl bg-snow p-6 shadow-card">
        <p className="text-sm text-earth">
          Sélection invalide. Recommence le choix du matériel.
        </p>
        <Link
          href="/prets/nouveau"
          className="mt-3 inline-block font-bold text-forest hover:underline"
        >
          ← Reprendre l&apos;étape 1
        </Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-earth">
          Étape 2 — Emprunteur & dates
        </h2>
        <p className="text-sm text-trail">
          Renseigne qui emprunte et pour combien de temps.
        </p>
      </div>
      <Step2Details
        selectedEquipment={selectedEquipment}
        borrowers={borrowers}
      />
    </>
  );
}

function ProgressBar({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Étape ${step} sur 2`}>
      <div className="h-1.5 flex-1 rounded-full bg-sky" />
      <div
        className={`h-1.5 flex-1 rounded-full ${step === 2 ? "bg-sky" : "bg-stone"}`}
      />
      <span className="text-xs font-bold text-trail">
        {step}/2
      </span>
    </div>
  );
}
