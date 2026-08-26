import { CalendarDays, MapPin, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { UNIT_LABEL, type Unit } from "@/lib/enums";
import type { NextEvent } from "@/modules/dashboard/queries";

// Le prochain événement qui concerne l'utilisateur — l'information la plus
// consultée d'un groupe scout, et pourtant absente du tableau de bord jusqu'ici.

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

const REPONSES: Record<string, { texte: string; classe: string }> = {
  PRESENT: { texte: "Tu es inscrit", classe: "bg-forest-soft text-forest-ink" },
  MAYBE: { texte: "Tu as répondu « peut-être »", classe: "bg-fire-soft text-fire-ink" },
  ABSENT: { texte: "Tu as répondu absent", classe: "bg-snow text-trail" },
};

export function NextEventCard({ event }: { event: NextEvent }) {
  const memeJour = event.startDate.toDateString() === event.endDate.toDateString();
  const reponse = event.myResponse ? REPONSES[event.myResponse] : null;

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-trail">
            Prochain rendez-vous
          </p>
          <h2 className="mt-1 truncate text-lg font-bold text-earth">{event.name}</h2>
        </div>
        {event.unit ? (
          <span className="shrink-0 rounded-full bg-forest-soft px-2.5 py-1 text-xs font-medium text-forest-ink">
            {UNIT_LABEL[event.unit as Unit] ?? event.unit}
          </span>
        ) : null}
      </div>

      <dl className="space-y-1.5 text-sm text-earth">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-trail" />
          <dd>
            {JOUR.format(event.startDate)}
            {memeJour
              ? ` · ${HEURE.format(event.startDate)}`
              : ` → ${JOUR.format(event.endDate)}`}
          </dd>
        </div>
        {event.location ? (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-trail" />
            <dd className="truncate">{event.location}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-trail" />
          <dd>
            {event.registeredCount} inscrit{event.registeredCount > 1 ? "s" : ""}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {reponse ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${reponse.classe}`}>
            {reponse.texte}
          </span>
        ) : event.registrationOpen ? (
          // Pas encore répondu et les inscriptions sont ouvertes : c'est
          // l'action attendue, elle passe devant la simple consultation.
          <Button asChild size="sm">
            <Link href={`/planning/${event.id}`}>Répondre à l&apos;invitation</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={`/planning/${event.id}`}>Voir le détail</Link>
        </Button>
      </div>
    </section>
  );
}
