import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  MapPin,
  Package,
  Pencil,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  EVENT_TYPE_LABEL,
  RSVP_LABEL,
  RSVP_RESPONSES,
  UNIT_LABEL,
  type EventType,
  type RsvpResponse,
  type Unit,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getChildrenOf } from "@/modules/family/queries";
import { formatEventRange } from "@/modules/planning/format";
import {
  getAttendanceCount,
  getEventLoans,
  getEventWithRegistrations,
} from "@/modules/planning/queries";

import { DeleteEventButton } from "../DeleteEventButton";
import { RsvpControl } from "../RsvpControl";

const DEADLINE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const RSVP_TONE: Record<RsvpResponse, string> = {
  PRESENT: "text-forest-ink",
  ABSENT: "text-brick-ink",
  MAYBE: "text-sun-ink",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "event.view")) redirect("/dashboard");

  const data = await getEventWithRegistrations(id, user.id);
  if (!data) notFound();
  const { event, registrations, reminders, myResponse } = data;
  const canManage = can(user, "event.manage");

  const deadlinePassed =
    event.registrationDeadline != null &&
    event.registrationDeadline < new Date();

  // US-P04 + rattachement familial : un parent peut inscrire ses enfants.
  const myChildren = event.registrationOpen
    ? await getChildrenOf(user.id)
    : [];
  const childRsvps = myChildren.map((child) => ({
    child,
    response:
      registrations.find((r) => r.user.id === child.id)?.response ?? null,
  }));

  // US-P07 — résumé de présence (pour les chefs).
  const attendanceCount = canManage ? await getAttendanceCount(event.id) : 0;

  // US-F04/F05 — accès au budget de l'événement.
  const canViewBudget = can(user, "budget.view");

  // US-P12 — matériel mobilisé (prêts rattachés), pour qui peut voir les prêts.
  const canViewLoans = can(user, "loan.view");
  const eventLoans = canViewLoans ? await getEventLoans(event.id) : [];
  // Incohérence de dates : le prêt ne chevauche pas la fenêtre de l'événement.
  const isLoanIncoherent = (l: (typeof eventLoans)[number]) =>
    l.expectedReturn < event.startDate || l.startDate > event.endDate;

  // Regroupement des réponses par type (pour la vue chef).
  const byResponse = (r: RsvpResponse) =>
    registrations.filter((reg) => reg.response === r);

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

        {canManage || canViewBudget ? (
          <div className="flex flex-wrap gap-2 border-t border-stone/50 pt-4">
            {canManage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/planning/${event.id}/presences`}>
                  <ClipboardCheck className="size-4" />
                  Pointer les présences
                  {attendanceCount > 0 ? ` (${attendanceCount})` : ""}
                </Link>
              </Button>
            ) : null}
            {canViewBudget ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/planning/${event.id}/budget`}>
                  <Wallet className="size-4" />
                  Budget & finances
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/planning/${event.id}/modifier`}>
                  <Pencil className="size-4" />
                  Modifier
                </Link>
              </Button>
            ) : null}
            {canManage ? <DeleteEventButton eventId={event.id} /> : null}
          </div>
        ) : null}
      </section>

      {/* US-P04 — inscriptions */}
      {event.registrationOpen ? (
        <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-earth">Inscription</h2>
            {event.registrationDeadline ? (
              <span
                className={cn(
                  "text-xs font-medium",
                  deadlinePassed ? "text-brick" : "text-trail",
                )}
              >
                {deadlinePassed ? "Clôturée le " : "Jusqu'au "}
                {DEADLINE_FMT.format(event.registrationDeadline)}
              </span>
            ) : null}
          </div>

          {deadlinePassed ? (
            <p className="text-sm text-trail">
              Les inscriptions sont closes.
              {myResponse
                ? ` Votre réponse : ${RSVP_LABEL[myResponse as RsvpResponse]}.`
                : ""}
            </p>
          ) : (
            <>
              <p className="text-sm text-trail">Indiquez votre présence :</p>
              <RsvpControl eventId={event.id} current={myResponse} />

              {childRsvps.length > 0 ? (
                <div className="space-y-3 border-t border-stone/50 pt-3">
                  <p className="text-sm font-medium text-earth">
                    Inscrire mes enfants :
                  </p>
                  {childRsvps.map(({ child, response }) => (
                    <div key={child.id} className="space-y-1.5">
                      <p className="text-sm font-bold text-earth">
                        {child.firstName} {child.lastName}
                      </p>
                      <RsvpControl
                        eventId={event.id}
                        current={response}
                        forUserId={child.id}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* Vue chef : liste des réponses. */}
      {canManage && event.registrationOpen ? (
        <section className="space-y-4 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-trail" />
            <h2 className="font-bold text-earth">
              Réponses ({registrations.length})
            </h2>
          </div>

          {registrations.length === 0 ? (
            <p className="text-sm text-trail">Aucune réponse pour le moment.</p>
          ) : (
            <div className="space-y-4">
              {RSVP_RESPONSES.map((r) => {
                const list = byResponse(r);
                if (list.length === 0) return null;
                return (
                  <div key={r} className="space-y-2">
                    <h3
                      className={cn(
                        "text-sm font-bold",
                        RSVP_TONE[r as RsvpResponse],
                      )}
                    >
                      {RSVP_LABEL[r as RsvpResponse]} ({list.length})
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {list.map((reg) => (
                        <li
                          key={reg.user.id}
                          className="flex items-center gap-2 rounded-full bg-sand px-2 py-1"
                        >
                          <UserAvatar
                            image={reg.user.image}
                            firstName={reg.user.firstName}
                            lastName={reg.user.lastName}
                            className="size-6 text-[10px]"
                          />
                          <span className="text-sm font-medium text-earth">
                            {reg.user.firstName} {reg.user.lastName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {reminders.length > 0 ? (
            <div className="space-y-1 border-t border-stone/50 pt-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-trail">
                Relancés ({reminders.length})
              </h3>
              <p className="text-sm text-trail">
                {reminders
                  .map((r) => `${r.user.firstName} ${r.user.lastName}`)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* US-P12 — matériel mobilisé (prêts rattachés). */}
      {canViewLoans && eventLoans.length > 0 ? (
        <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-trail" />
            <h2 className="font-bold text-earth">
              Matériel mobilisé ({eventLoans.length})
            </h2>
          </div>
          <ul className="space-y-2">
            {eventLoans.map((l) => {
              const incoherent = isLoanIncoherent(l);
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sand/60 p-3 text-sm"
                >
                  <Link
                    href={`/stock/${l.equipment.id}`}
                    className="font-bold text-earth hover:text-forest"
                  >
                    {l.equipment.name}
                  </Link>
                  {l.quantity > 1 ? (
                    <span className="rounded-full bg-snow px-2 py-0.5 text-xs font-bold text-earth">
                      ×{l.quantity}
                    </span>
                  ) : null}
                  <span className="text-trail">
                    · {l.borrower.firstName} {l.borrower.lastName}
                  </span>
                  {incoherent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brick-soft px-2 py-0.5 text-xs font-bold text-brick-ink">
                      <TriangleAlert className="size-3" />
                      Dates hors événement
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
