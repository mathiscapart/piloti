import { AlertTriangle, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { IncidentCard } from "@/components/incidents/IncidentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { INCIDENT_SEVERITIES } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  listIncidents,
  type IncidentSeverityFilter,
  type IncidentStatusFilter,
} from "@/modules/inventory/queries";
import { SEVERITY_LABEL } from "@/modules/inventory/types";

const SEVERITY_CHOICES: { value: IncidentSeverityFilter; label: string; tone?: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "BLOQUANT", label: SEVERITY_LABEL.BLOQUANT, tone: "bg-brick text-snow" },
  { value: "GENANT", label: SEVERITY_LABEL.GENANT, tone: "bg-fire text-snow" },
  { value: "MINEUR", label: SEVERITY_LABEL.MINEUR, tone: "bg-sun text-earth" },
];

const STATUS_CHOICES: { value: IncidentStatusFilter; label: string }[] = [
  { value: "open", label: "Ouverts" },
  { value: "resolved", label: "Résolus" },
  { value: "all", label: "Tous" },
];

interface PageProps {
  searchParams: Promise<{ status?: string; severity?: string }>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status: IncidentStatusFilter =
    params.status === "resolved" || params.status === "all"
      ? params.status
      : "open";
  const severity: IncidentSeverityFilter =
    params.severity === "BLOQUANT" ||
    params.severity === "GENANT" ||
    params.severity === "MINEUR"
      ? (params.severity as IncidentSeverityFilter)
      : "all";

  const user = await getCurrentUser();
  // Réservé aux rôles qui peuvent consulter les incidents (matériel + déclarants).
  if (!can(user, "incident.view")) redirect("/dashboard");
  const incidents = await listIncidents({ status, severity });
  const canResolve = can(user, "incident.resolve");

  const buildHref = (overrides: Partial<{ status: string; severity: string }>) => {
    const p = new URLSearchParams();
    const s = overrides.status ?? status;
    const sev = overrides.severity ?? severity;
    if (s !== "open") p.set("status", s);
    if (sev !== "all") p.set("severity", sev);
    return p.toString() ? `/incidents?${p.toString()}` : "/incidents";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="text-3xl font-black text-earth md:text-4xl">Incidents</h1>
        <p className="text-trail">
          {incidents.length} incident{incidents.length > 1 ? "s" : ""}
        </p>
      </header>

      {/* Toggle statut ouvert / résolu / tous */}
      <nav aria-label="Statut" className="inline-flex rounded-full bg-snow p-1 shadow-card">
        {STATUS_CHOICES.map((s) => (
          <Link
            key={s.value}
            href={buildHref({ status: s.value })}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              status === s.value
                ? "bg-forest text-snow"
                : "text-trail hover:bg-sand",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* Chips sévérité */}
      <nav aria-label="Gravité" className="flex gap-2 overflow-x-auto pb-1">
        {SEVERITY_CHOICES.map((c) => {
          const active = severity === c.value;
          return (
            <Link
              key={c.value}
              href={buildHref({ severity: c.value })}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                active
                  ? c.tone ?? "bg-forest text-snow"
                  : "bg-snow text-earth shadow-card hover:bg-sand",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {incidents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Aucun incident"
          description={
            status === "open"
              ? "Pas d'incident ouvert dans ce filtre — le matériel se porte bien."
              : "Aucun résultat dans ce filtre."
          }
        />
      ) : (
        <ul className="space-y-3">
          {incidents.map((inc) => (
            <li key={inc.id}>
              <IncidentCard incident={inc} canResolve={canResolve} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/incidents/nouveau"
        aria-label="Signaler un incident"
        className="fixed bottom-28 right-5 z-20 flex size-14 items-center justify-center rounded-full bg-brick text-snow shadow-elevated transition-colors hover:bg-brick/90 md:bottom-8 md:right-8"
      >
        <Plus className="size-6" />
      </Link>

      <p className="sr-only">{INCIDENT_SEVERITIES.length} niveaux de gravité disponibles</p>
    </div>
  );
}
