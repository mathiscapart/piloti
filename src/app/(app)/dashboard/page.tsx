import {
  AlertTriangle,
  Clock,
  Package,
  Phone,
  Plus,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { WaterFootprint } from "@/components/dashboard/WaterFootprint";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/get-current-user";
import { getDashboardData } from "@/modules/inventory/queries";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
});

function daysOverdue(expectedReturn: Date): number {
  const ms = Date.now() - expectedReturn.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const {
    availableArticleCount,
    activeLoanCount,
    openIncidentCount,
    lateLoans,
  } = await getDashboardData();

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          {user.role === "ADMIN" ? "Administrateur" : `Chef${user.unit ? ` · ${user.unit}` : ""}`}
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Salut, {user.firstName} !
        </h1>
        <p className="text-trail">Voici l&apos;état du matériel aujourd&apos;hui.</p>
      </header>

      {/* Empreinte eau IA */}
      <WaterFootprint />

      {/* Actions rapides */}
      <section className="grid gap-3 md:grid-cols-3">
        <Button asChild size="lg" variant="success" className="w-full">
          <Link href="/prets/nouveau">
            <Plus className="size-4" />
            Nouveau prêt
          </Link>
        </Button>
        <Button asChild size="lg" variant="destructive" className="w-full">
          <Link href="/incidents/nouveau">
            <AlertTriangle className="size-4" />
            Signaler incident
          </Link>
        </Button>
        <Button asChild size="lg" variant="info" className="w-full">
          <Link href="/stock">
            <Package className="size-4" />
            Voir le stock
          </Link>
        </Button>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:gap-4">
        <KpiCard
          label="Articles disponibles"
          value={availableArticleCount}
          icon={Package}
          tone="forest"
        />
        <KpiCard
          label="Prêts en cours"
          value={activeLoanCount}
          icon={Truck}
          tone="sky"
        />
      </section>

      {/* Incidents ouverts — bordure rouge */}
      <section
        className={
          openIncidentCount > 0
            ? "flex items-center gap-4 rounded-2xl border-l-4 border-brick bg-snow p-5 shadow-card"
            : "flex items-center gap-4 rounded-2xl bg-snow p-5 shadow-card"
        }
      >
        <div
          className={
            openIncidentCount > 0
              ? "rounded-xl bg-brick-soft p-3 text-brick-ink"
              : "rounded-xl bg-forest-soft p-3 text-forest-ink"
          }
        >
          <AlertTriangle className="size-6" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-trail">
            Incidents
          </p>
          <p className="font-bold text-earth">
            {openIncidentCount === 0
              ? "Aucun incident en cours"
              : openIncidentCount === 1
                ? "1 incident ouvert"
                : `${openIncidentCount} incidents ouverts`}
          </p>
        </div>
        {openIncidentCount > 0 ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/incidents">Voir</Link>
          </Button>
        ) : null}
      </section>

      {/* Attention requise — prêts en retard */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-earth">Attention requise</h2>
          {lateLoans.length > 0 ? (
            <span className="text-sm font-bold text-brick">
              {lateLoans.length} en retard
            </span>
          ) : null}
        </div>

        {lateLoans.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Aucun prêt en retard"
            description="Tout le matériel emprunté est dans les temps."
          />
        ) : (
          <ul className="space-y-3">
            {lateLoans.map((loan) => {
              const days = daysOverdue(loan.expectedReturn);
              return (
                <li
                  key={loan.id}
                  className="rounded-2xl border-l-4 border-brick bg-snow p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-earth">
                        {loan.equipment.name}
                      </p>
                      <p className="text-sm text-trail">
                        {loan.borrower.firstName} {loan.borrower.lastName}
                        {loan.eventName ? ` · ${loan.eventName}` : ""}
                      </p>
                      <p className="mt-1 text-sm font-bold text-brick">
                        Retour prévu le {DATE_FMT.format(loan.expectedReturn)}
                        {days > 0 ? ` · ${days} j de retard` : ""}
                      </p>
                    </div>
                    {loan.borrower.phone ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={`tel:${loan.borrower.phone.replace(/\s/g, "")}`}>
                          <Phone className="size-4" />
                          Appeler
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
