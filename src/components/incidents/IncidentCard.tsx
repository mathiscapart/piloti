import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { IncidentPhotos } from "@/components/incidents/IncidentPhotos";
import { ResolveDialog } from "@/components/incidents/ResolveDialog";
import { cn } from "@/lib/utils";
import {
  INCIDENT_TYPE_LABEL,
} from "@/lib/incident-categories";
import type { IncidentListItem } from "@/modules/inventory/queries";
import { SEVERITY_LABEL } from "@/modules/inventory/types";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const SEVERITY_TONE: Record<string, string> = {
  BLOQUANT: "bg-brick-soft text-brick-ink",
  GENANT: "bg-fire-soft text-fire-ink",
  MINEUR: "bg-sun-soft text-sun-ink",
};

const SEVERITY_BORDER: Record<string, string> = {
  BLOQUANT: "border-brick",
  GENANT: "border-fire",
  MINEUR: "border-sun",
};

export function IncidentCard({
  incident,
  canResolve,
}: {
  incident: IncidentListItem;
  canResolve: boolean;
}) {
  const types = JSON.parse(incident.types) as string[];
  const photos = JSON.parse(incident.photos) as string[];
  const resolved = !!incident.resolvedAt;

  return (
    <article
      className={cn(
        "rounded-2xl bg-snow p-4 shadow-card",
        !resolved && `border-l-4 ${SEVERITY_BORDER[incident.severity]}`,
        resolved && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                SEVERITY_TONE[incident.severity] ?? "bg-stone text-earth",
              )}
            >
              {SEVERITY_LABEL[
                incident.severity as keyof typeof SEVERITY_LABEL
              ] ?? incident.severity}
            </span>
            {resolved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-forest-soft px-2.5 py-0.5 text-xs font-bold text-forest-ink">
                <CheckCircle2 className="size-3" />
                Résolu
              </span>
            ) : null}
            <Link
              href={`/stock/${incident.equipment.id}`}
              className="font-bold text-earth hover:text-forest"
            >
              {incident.equipment.name}
            </Link>
          </div>

          <ul className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <li
                key={t}
                className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-earth"
              >
                {INCIDENT_TYPE_LABEL[t] ?? t}
              </li>
            ))}
          </ul>

          {incident.notes ? (
            <p className="text-sm text-earth">{incident.notes}</p>
          ) : null}

          <IncidentPhotos photos={photos} />

          <p className="text-xs text-trail">
            Signalé par {incident.reporter.firstName}{" "}
            {incident.reporter.lastName} · {DATE_FMT.format(incident.createdAt)}
            {resolved && incident.resolvedBy && incident.resolvedAt ? (
              <>
                {" · "}
                résolu par {incident.resolvedBy.firstName}{" "}
                {incident.resolvedBy.lastName} le{" "}
                {DATE_FMT.format(incident.resolvedAt)}
                {incident.resolvedNote ? ` — ${incident.resolvedNote}` : ""}
              </>
            ) : null}
          </p>
        </div>

        {!resolved && canResolve ? (
          <ResolveDialog incidentId={incident.id} />
        ) : null}
      </div>
    </article>
  );
}
