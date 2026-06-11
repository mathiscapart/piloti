import { ArrowLeft, CalendarDays } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { formatEventRange } from "@/modules/planning/format";
import { getAttendanceRoster } from "@/modules/planning/queries";

import { AttendanceList } from "./AttendanceList";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AttendancePage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "event.manage")) redirect(`/planning/${id}`);

  const data = await getAttendanceRoster(id);
  if (!data) notFound();
  const { event, roster } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={`/planning/${event.id}`}
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour à l&apos;événement
      </Link>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <CalendarDays className="size-3.5" />
          Pointage des présences
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {event.name}
        </h1>
        <p className="text-sm text-trail">
          {formatEventRange(event.startDate, event.endDate)}
        </p>
      </header>

      <section className="rounded-2xl bg-snow p-5 shadow-card">
        <AttendanceList eventId={event.id} roster={roster} />
      </section>
    </div>
  );
}
