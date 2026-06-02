import { Plus, Truck } from "lucide-react";
import Link from "next/link";

import { LoanGroupCard } from "@/components/loans/LoanGroupCard";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  listLoans,
  listCategories,
  listBorrowers,
  type LoanFilter,
  type LoanListItem,
} from "@/modules/inventory/queries";

const FILTERS: { value: LoanFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "retard", label: "En retard" },
  { value: "bientot", label: "Bientôt dus" },
  { value: "sechage", label: "Séchage" },
];

const VALID_FILTERS = new Set<LoanFilter>(FILTERS.map((f) => f.value));

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function PretsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.filter ?? "all";
  const filter: LoanFilter = VALID_FILTERS.has(raw as LoanFilter)
    ? (raw as LoanFilter)
    : "all";

  const [loans, categories, borrowers] = await Promise.all([
    listLoans(filter),
    listCategories(),
    listBorrowers(),
  ]);
  const dryableCategories = new Set(
    categories.filter((c) => c.canDry).map((c) => c.slug),
  );
  // US-23 — comptes proposés comme responsable de séchage.
  const dryingContacts = borrowers.map((b) => ({
    id: b.id,
    firstName: b.firstName,
    lastName: b.lastName,
  }));

  // US-32 — regroupe les lignes par `groupId` (prêt groupé). Un prêt legacy
  // sans groupId forme son propre groupe (clé = son id). L'ordre suit celui de
  // listLoans (par date de retour), via la 1re ligne rencontrée de chaque groupe.
  const groups = new Map<string, LoanListItem[]>();
  for (const loan of loans) {
    const key = loan.groupId ?? loan.id;
    const existing = groups.get(key);
    if (existing) existing.push(loan);
    else groups.set(key, [loan]);
  }
  const groupedLoans = [...groups.values()];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-black text-earth md:text-4xl">Prêts</h1>
        <p className="text-trail">
          {groupedLoans.length} prêt{groupedLoans.length > 1 ? "s" : ""}
          {filter !== "all"
            ? ` · ${FILTERS.find((f) => f.value === filter)?.label}`
            : ""}
        </p>
      </header>

      <nav
        aria-label="Filtres prêts"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const isRetard = f.value === "retard";
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/prets" : `/prets?filter=${f.value}`}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                active
                  ? isRetard
                    ? "bg-brick text-snow"
                    : "bg-forest text-snow"
                  : "bg-snow text-earth shadow-card hover:bg-sand",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {loans.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={filter === "all" ? "Aucun prêt enregistré" : "Aucun prêt dans ce filtre"}
          description={
            filter === "all"
              ? "Enregistre un prêt depuis le bouton « Nouveau prêt »."
              : "Essaie un autre filtre."
          }
        />
      ) : (
        <ul className="space-y-3">
          {groupedLoans.map((group) => (
            <li key={group[0].groupId ?? group[0].id}>
              <LoanGroupCard
                loans={group}
                dryableCategories={dryableCategories}
                dryingContacts={dryingContacts}
              />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/prets/nouveau"
        aria-label="Nouveau prêt"
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-20 flex size-14 items-center justify-center rounded-full bg-forest text-snow shadow-elevated transition-colors hover:bg-forest/90 md:bottom-8 md:right-8"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}
