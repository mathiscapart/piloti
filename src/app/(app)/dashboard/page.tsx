import {
  AlertTriangle,
  Clock,
  Gift,
  ListTodo,
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
import { ROLE_LABEL, type Role } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import { getDashboardData } from "@/modules/inventory/queries";
import { listOpenGroupTasks } from "@/modules/planning/tasks";
import { buildTaskVMs } from "@/modules/planning/task-vm";

import { TaskList } from "../planning/taches/TaskList";

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

  // US-32 — chaque widget est filtré par sa permission, comme sa page dédiée.
  // Les prêts en retard exposent nom + téléphone de l'emprunteur (PII) → gardés
  // derrière loan.view (jamais visibles d'un parent / jeune).
  const canStock = can(user, "equipment.view");
  const canLoans = can(user, "loan.view");
  const canIncidents = can(user, "incident.view");
  const isStaff = canStock || canLoans || canIncidents;
  const data = isStaff ? await getDashboardData() : null;
  const lateLoans = canLoans ? (data?.lateLoans ?? []) : [];

  const roles = effectiveRoles(user);
  const roleLabel =
    roles.length > 0 ? (ROLE_LABEL[roles[0] as Role] ?? roles[0]) : "Membre";

  // US-P11 — tâches de groupe ouvertes : visibles par tout le monde.
  const groupTasks = await listOpenGroupTasks();
  const groupTaskVms = buildTaskVMs(groupTasks, {
    userId: user.id,
    canManage: can(user, "task.manage"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          {roleLabel}
          {user.unit ? ` · ${user.unit}` : ""}
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Salut, {user.firstName} !
        </h1>
        <p className="text-trail">
          {isStaff
            ? "Voici l'état du matériel aujourd'hui."
            : "Ravi de te voir !"}
        </p>
      </header>

      {/* Empreinte eau IA */}
      <WaterFootprint />

      {/* Actions rapides — filtrées par rôle ; « Faire un don » ouvert à tous. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {can(user, "loan.create") ? (
          <Button asChild size="lg" variant="success" className="w-full">
            <Link href="/prets/nouveau">
              <Plus className="size-4" />
              Nouveau prêt
            </Link>
          </Button>
        ) : null}
        {can(user, "incident.report") ? (
          <Button asChild size="lg" variant="destructive" className="w-full">
            <Link href="/incidents/nouveau">
              <AlertTriangle className="size-4" />
              Signaler incident
            </Link>
          </Button>
        ) : null}
        {can(user, "equipment.view") ? (
          <Button asChild size="lg" variant="info" className="w-full">
            <Link href="/stock">
              <Package className="size-4" />
              Voir le stock
            </Link>
          </Button>
        ) : null}
        <Button asChild size="lg" className="w-full">
          <Link href="/dons/nouveau">
            <Gift className="size-4" />
            Faire un don
          </Link>
        </Button>
      </section>

      {/* KPIs — chacun selon la permission de sa page. */}
      {canStock || canLoans ? (
        <section className="grid grid-cols-2 gap-3 md:gap-4">
          {canStock ? (
            <KpiCard
              label="Articles disponibles"
              value={data?.availableArticleCount ?? 0}
              icon={Package}
              tone="forest"
            />
          ) : null}
          {canLoans ? (
            <KpiCard
              label="Prêts en cours"
              value={data?.activeLoanCount ?? 0}
              icon={Truck}
              tone="sky"
            />
          ) : null}
        </section>
      ) : null}

      {/* Incidents ouverts — bordure rouge (réservé à incident.view) */}
      {canIncidents ? (
      <section
        className={
          (data?.openIncidentCount ?? 0) > 0
            ? "flex items-center gap-4 rounded-2xl border-l-4 border-brick bg-snow p-5 shadow-card"
            : "flex items-center gap-4 rounded-2xl bg-snow p-5 shadow-card"
        }
      >
        <div
          className={
            (data?.openIncidentCount ?? 0) > 0
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
            {(data?.openIncidentCount ?? 0) === 0
              ? "Aucun incident en cours"
              : data?.openIncidentCount === 1
                ? "1 incident ouvert"
                : `${data?.openIncidentCount} incidents ouverts`}
          </p>
        </div>
        {(data?.openIncidentCount ?? 0) > 0 ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/incidents">Voir</Link>
          </Button>
        ) : null}
      </section>
      ) : null}

      {/* Attention requise — prêts en retard (PII : réservé à loan.view) */}
      {canLoans ? (
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
      ) : null}

      {/* US-P11 — tâches du groupe ouvertes à l'inscription (tout le monde). */}
      {groupTaskVms.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-1.5 text-lg font-bold text-earth">
              <ListTodo className="size-5 text-forest" />
              Tâches du groupe
            </h2>
            <Link
              href="/planning/taches"
              className="text-sm font-bold text-forest hover:underline"
            >
              Toutes →
            </Link>
          </div>
          <TaskList tasks={groupTaskVms} />
        </section>
      ) : null}

      {/* Utilisateur sans rôle métier (parent / jeune / membre du local). */}
      {!isStaff ? (
        <section className="rounded-2xl bg-snow p-6 shadow-card">
          <h2 className="font-bold text-earth">Bienvenue sur Piloti</h2>
          <p className="mt-1 text-sm text-trail">
            Retrouve les annonces du groupe dans la messagerie, et propose du
            matériel via « Faire un don ».
          </p>
        </section>
      ) : null}

    </div>
  );
}
