import { CalendarDays, ListTodo, MapPin, Plus, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  UNITS,
  UNIT_LABEL,
  type EventType,
  type Unit,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { formatEventRange, monthKey, monthLabel } from "@/modules/planning/format";
import { listEvents, type EventListItem } from "@/modules/planning/queries";
import { listOpenTasksPreview } from "@/modules/planning/tasks";

const TYPE_TONE: Record<EventType, string> = {
  REUNION: "bg-sky-soft text-sky-ink",
  WEEK_END: "bg-forest-soft text-forest-ink",
  CAMP: "bg-sun-soft text-sun-ink",
  SERVICE: "bg-sand text-earth",
};

interface PageProps {
  searchParams: Promise<{ unit?: string; type?: string; scope?: string }>;
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "event.view")) redirect("/dashboard");
  const canManage = can(user, "event.manage");

  const { unit, type, scope } = await searchParams;
  const unitFilter = unit && (UNITS as readonly string[]).includes(unit) ? unit : "";
  const typeFilter =
    type && (EVENT_TYPES as readonly string[]).includes(type) ? type : "";
  const past = scope === "past";

  const [events, openTasks] = await Promise.all([
    listEvents({
      unit: unitFilter || undefined,
      type: typeFilter || undefined,
      scope: past ? "past" : "upcoming",
    }),
    listOpenTasksPreview(5),
  ]);

  // Regroupement par mois (ordre déjà fixé par la requête).
  const groups: { key: string; label: string; items: EventListItem[] }[] = [];
  for (const ev of events) {
    const key = monthKey(ev.startDate);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: monthLabel(ev.startDate), items: [] };
      groups.push(group);
    }
    group.items.push(ev);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
            <CalendarDays className="size-3.5" />
            Planning
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Événements
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "member.view") ? (
            <Button asChild variant="outline">
              <Link href="/planning/presences">
                <Users className="size-4" />
                Bilan présences
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button asChild>
              <Link href="/planning/nouveau">
                <Plus className="size-4" />
                Nouvel événement
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {/* US-P10 — aperçu des tâches à faire (vue complète : /planning/taches). */}
      {openTasks.length > 0 ? (
        <section className="space-y-2 rounded-2xl bg-snow p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 font-bold text-earth">
              <ListTodo className="size-4 text-forest" />
              À faire
            </h2>
            <Link
              href="/planning/taches"
              className="text-sm font-bold text-forest hover:underline"
            >
              Voir tout →
            </Link>
          </div>
          <ul className="space-y-1">
            {openTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 text-sm text-earth"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-forest" />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.assignee ? (
                  <span className="shrink-0 text-xs text-trail">
                    {t.assignee.firstName}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Filtres (GET, côté serveur) : à-venir/passés, branche, type. */}
      <form
        method="GET"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex gap-1 rounded-full bg-sand p-1">
          {[
            { v: "", label: "À venir" },
            { v: "past", label: "Passés" },
          ].map((opt) => {
            const active = (opt.v === "past") === past;
            return (
              <Link
                key={opt.v || "upcoming"}
                href={{
                  pathname: "/planning",
                  query: {
                    ...(unitFilter ? { unit: unitFilter } : {}),
                    ...(typeFilter ? { type: typeFilter } : {}),
                    ...(opt.v ? { scope: opt.v } : {}),
                  },
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                  active ? "bg-snow text-earth shadow-sm" : "text-trail",
                )}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
        <select
          name="unit"
          defaultValue={unitFilter}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-earth"
        >
          <option value="">Toutes les branches</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u as Unit]}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={typeFilter}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-earth"
        >
          <option value="">Tous les types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t as EventType]}
            </option>
          ))}
        </select>
        {past ? <input type="hidden" name="scope" value="past" /> : null}
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-forest px-5 text-sm font-bold text-snow transition-colors hover:bg-forest/90"
        >
          Filtrer
        </button>
      </form>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={past ? "Aucun événement passé" : "Aucun événement à venir"}
          description={
            canManage
              ? "Créez un premier événement pour alimenter le calendrier du groupe."
              : "Le calendrier est vide pour le moment."
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-trail">
                {group.label}
              </h2>
              <ul className="space-y-2">
                {group.items.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={`/planning/${ev.id}`}
                      className="flex items-start gap-3 rounded-2xl bg-snow p-4 shadow-card transition-colors hover:bg-sand/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-bold",
                              TYPE_TONE[ev.type as EventType] ?? "bg-sand text-earth",
                            )}
                          >
                            {EVENT_TYPE_LABEL[ev.type as EventType] ?? ev.type}
                          </span>
                          {ev.unit ? (
                            <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-earth">
                              {UNIT_LABEL[ev.unit as Unit] ?? ev.unit}
                            </span>
                          ) : (
                            <span className="text-xs text-trail">Tout le groupe</span>
                          )}
                        </div>
                        <p className="mt-1 truncate font-bold text-earth">
                          {ev.name}
                        </p>
                        <p className="text-sm text-trail">
                          {formatEventRange(ev.startDate, ev.endDate)}
                        </p>
                        {ev.location ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-trail">
                            <MapPin className="size-3.5" />
                            {ev.location}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
