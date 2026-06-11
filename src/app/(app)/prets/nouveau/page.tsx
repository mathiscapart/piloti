import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import {
  listBorrowableEquipment,
  listBorrowers,
  listCategories,
} from "@/modules/inventory/queries";
import { listEvents } from "@/modules/planning/queries";

import { Step1Details } from "./step1-details";
import { Step2Select } from "./step2-select";

// Emprunteur courant (jeune : prêt pour lui-même uniquement).
interface SelfBorrower {
  id: string;
  label: string;
}

interface PageProps {
  searchParams: Promise<{
    step?: string;
    q?: string;
    equipmentId?: string | string[];
    borrowerId?: string;
    startDate?: string;
    expectedReturn?: string;
    eventName?: string;
    eventId?: string;
  }>;
}

export default async function NewLoanPage({ searchParams }: PageProps) {
  const user = await requireCan("loan.create");
  // US-32 — un gestionnaire (loan.view) emprunte pour n'importe qui ; un jeune
  // (loan.create via sa branche) emprunte uniquement pour lui-même.
  const isManager = can(user, "loan.view");
  const self: SelfBorrower = {
    id: user.id,
    label: `${user.firstName} ${user.lastName}`,
  };

  const params = await searchParams;
  const step = params.step === "2" ? 2 : 1;
  const search = (params.q ?? "").trim();

  const selectedIds = Array.isArray(params.equipmentId)
    ? params.equipmentId
    : params.equipmentId
      ? [params.equipmentId]
      : [];

  const details = {
    // Jeune : l'emprunteur est forcé à lui-même (on ignore l'URL).
    borrowerId: isManager ? (params.borrowerId ?? "") : self.id,
    startDate: params.startDate ?? "",
    expectedReturn: params.expectedReturn ?? "",
    eventName: params.eventName ?? "",
    eventId: params.eventId ?? "",
  };

  // US-12 — l'étape 2 (sélection) a besoin de l'emprunteur ET des dates pour
  // calculer la disponibilité sur la période. Sans elles → retour à l'étape 1.
  if (
    step === 2 &&
    (!details.borrowerId || !details.startDate || !details.expectedReturn)
  ) {
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

      {step === 1 ? (
        <Step1Page details={details} isManager={isManager} self={self} />
      ) : (
        <Step2Page
          search={search}
          preselected={selectedIds}
          details={details}
          isManager={isManager}
          self={self}
        />
      )}
    </div>
  );
}

async function Step1Page({
  details,
  isManager,
  self,
}: {
  details: {
    borrowerId: string;
    startDate: string;
    expectedReturn: string;
    eventName: string;
    eventId: string;
  };
  isManager: boolean;
  self: SelfBorrower;
}) {
  // Jeune : pas d'accès à l'annuaire des membres → on ne charge pas la liste.
  // US-P12 — événements à venir, pour rattacher le prêt (lien optionnel).
  const [borrowers, events] = await Promise.all([
    isManager ? listBorrowers() : Promise.resolve(null),
    listEvents({ scope: "upcoming" }),
  ]);
  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-earth">
          {isManager ? "Étape 1 — Emprunteur & dates" : "Étape 1 — Dates"}
        </h2>
        <p className="text-sm text-trail">
          {isManager
            ? "Renseigne qui emprunte et pour quelle période. La disponibilité du matériel sera calculée sur ces dates."
            : "Choisis la période. Le prêt sera créé à ton nom."}
        </p>
      </div>
      <Step1Details
        borrowers={borrowers}
        details={details}
        self={self}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
      />
    </>
  );
}

async function Step2Page({
  search,
  preselected,
  details,
  isManager,
  self,
}: {
  search: string;
  preselected: string[];
  details: {
    borrowerId: string;
    startDate: string;
    expectedReturn: string;
    eventName: string;
    eventId: string;
  };
  isManager: boolean;
  self: SelfBorrower;
}) {
  const period = {
    start: new Date(details.startDate),
    end: new Date(details.expectedReturn),
  };
  // US-20 — on charge TOUT le matériel disponible sur la période ; le filtrage
  // par recherche est instantané côté client (cf. Step2Select), sans rechargement.
  // Jeune : on ne charge pas l'annuaire (emprunteur = lui-même).
  const [equipment, borrowers, categories] = await Promise.all([
    listBorrowableEquipment(undefined, period),
    isManager ? listBorrowers() : Promise.resolve(null),
    listCategories(),
  ]);
  const borrowerLabel = isManager
    ? (() => {
        const b = borrowers?.find((x) => x.id === details.borrowerId);
        return b ? `${b.firstName} ${b.lastName}` : "";
      })()
    : self.label;
  const categoryLabels = Object.fromEntries(
    categories.map((c) => [c.slug, c.label]),
  );

  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-earth">
          Étape 2 — Choisir le matériel
        </h2>
        <p className="text-sm text-trail">
          Coche les articles. La disponibilité affichée tient compte des dates
          choisies. Chaque article peut avoir sa propre date de retour.
        </p>
      </div>
      <Step2Select
        equipment={equipment}
        categoryLabels={categoryLabels}
        preselected={preselected}
        initialSearch={search}
        details={details}
        borrowerLabel={borrowerLabel}
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
      <span className="text-xs font-bold text-trail">{step}/2</span>
    </div>
  );
}
