import { ArrowLeft, CalendarDays, MapPin, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  EVENT_TYPE_LABEL,
  UNIT_LABEL,
  type EventType,
  type Unit,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { formatEventRange } from "@/modules/planning/format";
import { getEvent } from "@/modules/planning/queries";

import { DeleteEventButton } from "../DeleteEventButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "event.view")) redirect("/dashboard");

  const event = await getEvent(id);
  if (!event) notFound();
  const canManage = can(user, "event.manage");

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/planning"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour au planning
      </Link>

      <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-soft px-2.5 py-0.5 text-xs font-bold text-sky-ink">
            {EVENT_TYPE_LABEL[event.type as EventType] ?? event.type}
          </span>
          <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-bold text-earth">
            {event.unit
              ? (UNIT_LABEL[event.unit as Unit] ?? event.unit)
              : "Tout le groupe"}
          </span>
        </div>

        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {event.name}
        </h1>

        <p className="flex items-center gap-2 text-sm font-medium text-earth">
          <CalendarDays className="size-4 text-trail" />
          {formatEventRange(event.startDate, event.endDate)}
        </p>
        {event.location ? (
          <p className="flex items-center gap-2 text-sm text-earth">
            <MapPin className="size-4 text-trail" />
            {event.location}
          </p>
        ) : null}

        {event.description ? (
          <p className="whitespace-pre-wrap border-t border-stone/50 pt-4 text-sm text-earth">
            {event.description}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2 border-t border-stone/50 pt-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/planning/${event.id}/modifier`}>
                <Pencil className="size-4" />
                Modifier
              </Link>
            </Button>
            <DeleteEventButton eventId={event.id} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
