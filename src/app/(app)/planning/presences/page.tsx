import { ArrowLeft, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { UserAvatar } from "@/components/ui/user-avatar";
import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getUnitAttendanceDashboard } from "@/modules/planning/stats";

import { PrintButton } from "./PrintButton";

interface PageProps {
  searchParams: Promise<{ unit?: string }>;
}

export default async function AttendanceDashboardPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "member.view")) redirect("/dashboard");

  const { unit } = await searchParams;
  const fromQuery =
    unit && (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : null;
  const fromUser =
    user.unit && (UNITS as readonly string[]).includes(user.unit)
      ? (user.unit as Unit)
      : null;
  const selectedUnit: Unit = fromQuery ?? fromUser ?? UNITS[0];

  const dashboard = await getUnitAttendanceDashboard(selectedUnit);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href="/planning"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour au planning
        </Link>
        <PrintButton />
      </div>

      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Users className="size-3.5" />
          Bilan des présences
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {UNIT_LABEL[selectedUnit] ?? selectedUnit}
        </h1>
      </header>

      {/* Sélecteur d'unité (masqué à l'impression). */}
      <form method="GET" className="print:hidden">
        <select
          name="unit"
          defaultValue={selectedUnit}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-earth sm:w-72"
          // Soumission auto au changement via le bouton ci-dessous pour le no-JS.
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u as Unit]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-2 h-10 rounded-full bg-forest px-4 text-sm font-bold text-snow hover:bg-forest/90"
        >
          Voir
        </button>
      </form>

      {/* Indicateurs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-snow p-4 text-center shadow-card">
          <p className="text-2xl font-black text-earth">
            {dashboard.averageRate !== null ? `${dashboard.averageRate}%` : "—"}
          </p>
          <p className="text-xs text-trail">Taux moyen</p>
        </div>
        <div className="rounded-2xl bg-snow p-4 text-center shadow-card">
          <p className="text-2xl font-black text-earth">{dashboard.eventCount}</p>
          <p className="text-xs text-trail">Événements pointés</p>
        </div>
        <div className="rounded-2xl bg-snow p-4 text-center shadow-card">
          <p
            className={cn(
              "text-2xl font-black",
              dashboard.atRiskCount > 0 ? "text-brick" : "text-earth",
            )}
          >
            {dashboard.atRiskCount}
          </p>
          <p className="text-xs text-trail">À risque</p>
        </div>
      </div>

      {/* Tableau par jeune */}
      {dashboard.rows.length === 0 ? (
        <p className="text-sm text-trail">
          Aucun jeune actif dans cette branche.
        </p>
      ) : (
        <ul className="divide-y divide-stone/40 overflow-hidden rounded-2xl bg-snow shadow-card">
          {dashboard.rows.map((r) => (
            <li key={r.user.id}>
              <Link
                href={`/membres/${r.user.id}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-sand/40"
              >
                <UserAvatar
                  image={r.user.image}
                  firstName={r.user.firstName}
                  lastName={r.user.lastName}
                  className="size-9 print:hidden"
                />
                <span className="min-w-0 flex-1 truncate font-medium text-earth">
                  {r.user.firstName} {r.user.lastName}
                </span>
                {r.atRisk ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brick-soft px-2 py-0.5 text-xs font-bold text-brick-ink">
                    <TriangleAlert className="size-3" />
                    {r.consecutiveAbsences} abs.
                  </span>
                ) : null}
                <span className="shrink-0 text-sm text-trail">
                  {r.present}/{r.total}
                </span>
                <span
                  className={cn(
                    "w-12 shrink-0 text-right text-sm font-bold",
                    r.rate === null
                      ? "text-trail"
                      : r.rate >= 70
                        ? "text-forest"
                        : r.rate >= 40
                          ? "text-sun-ink"
                          : "text-brick",
                  )}
                >
                  {r.rate !== null ? `${r.rate}%` : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
