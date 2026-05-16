import { Plus, Truck } from "lucide-react";
import Link from "next/link";

import { LoanCard } from "@/components/loans/LoanCard";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { listLoans, listCategories, type LoanFilter } from "@/modules/inventory/queries";

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

  const [loans, categories] = await Promise.all([
    listLoans(filter),
    listCategories(),
  ]);
  const dryableCategories = new Set(
    categories.filter((c) => c.canDry).map((c) => c.slug),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-earth md:text-4xl">Prêts</h1>
          <p className="text-trail">
            {loans.length} prêt{loans.length > 1 ? "s" : ""}
            {filter !== "all"
              ? ` · ${FILTERS.find((f) => f.value === filter)?.label}`
              : ""}
          </p>
        </div>
        <Link
          href="/prets/nouveau"
          className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-bold text-snow shadow-sm transition-colors hover:bg-forest/90"
        >
          <Plus className="size-4" />
          Nouveau prêt
        </Link>
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
          {loans.map((loan) => (
            <li key={loan.id}>
              <LoanCard loan={loan} dryableCategories={dryableCategories} />
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
