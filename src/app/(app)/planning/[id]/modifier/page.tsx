import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listPlaceOptions } from "@/modules/camp/places";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { updateEvent } from "@/modules/planning/actions";
import { toDatetimeLocal } from "@/modules/planning/format";
import { getEvent } from "@/modules/planning/queries";

import { EventForm } from "../../EventForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEventPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) redirect("/planning");

  const event = await getEvent(id);
  if (!event) notFound();

  const places = await listPlaceOptions();
  const action = updateEvent.bind(null, event.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={`/planning/${event.id}`}
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour à l&apos;événement
      </Link>
      <h1 className="text-3xl font-black text-earth md:text-4xl">
        Modifier l&apos;événement
      </h1>
      <section className="rounded-2xl bg-snow p-5 shadow-card">
        <EventForm
          action={action}
          submitLabel="Enregistrer les modifications"
          places={places}
          defaults={{
            name: event.name,
            type: event.type,
            startDate: toDatetimeLocal(event.startDate),
            endDate: toDatetimeLocal(event.endDate),
            unit: event.unit ?? "",
            location: event.location ?? "",
            description: event.description ?? "",
            campPlaceId: event.campPlaceId ?? "",
            registrationOpen: event.registrationOpen,
            registrationDeadline: event.registrationDeadline
              ? toDatetimeLocal(event.registrationDeadline)
              : "",
          }}
        />
      </section>
    </div>
  );
}
