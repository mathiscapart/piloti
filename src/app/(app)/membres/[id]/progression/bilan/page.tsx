import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { isChildOf } from "@/modules/family/queries";
import { getProgression } from "@/modules/pedagogy/progression";
import {
  CONSECUTIVE_ABSENCE_THRESHOLD,
  getMemberAttendanceStats,
} from "@/modules/planning/stats";

import { PrintButton } from "../../../../planning/presences/PrintButton";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BilanPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  const isStaff = can(user, "pedago.view");
  const isSelf = user.id === id;
  const isParent = !isStaff && !isSelf ? await isChildOf(user.id, id) : false;
  if (!isStaff && !isSelf && !isParent) redirect("/dashboard");

  // Bilan : pas de notes sensibles (US-S07 reste interne à l'équipe).
  const [data, attendance] = await Promise.all([
    getProgression(id, false),
    getMemberAttendanceStats(id),
  ]);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-black text-earth">Bilan pédagogique</h1>
        <PrintButton />
      </div>

      <article className="space-y-6 rounded-2xl bg-snow p-6 shadow-card print:rounded-none print:p-0 print:shadow-none">
        <header className="border-b border-stone/50 pb-3">
          <h2 className="text-2xl font-black text-earth">
            {data.jeune.firstName} {data.jeune.lastName}
          </h2>
          <p className="text-sm text-trail">
            Bilan édité le {DATE_FMT.format(new Date())}
          </p>
        </header>

        <section className="space-y-2">
          <h3 className="font-bold text-earth">Progression</h3>
          <p className="text-sm text-earth">
            {data.confirmedCount} / {data.totalSteps} étape
            {data.totalSteps > 1 ? "s" : ""} validée
            {data.confirmedCount > 1 ? "s" : ""}.
          </p>
          <ul className="space-y-1">
            {data.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span>
                  {s.status === "CONFIRMED" ? "✅" : s.status === "PROPOSED" ? "🟡" : "⬜️"}
                </span>
                <span className={s.status === "CONFIRMED" ? "font-bold text-earth" : "text-trail"}>
                  {s.name}
                </span>
              </li>
            ))}
            {data.steps.length === 0 ? (
              <li className="text-sm text-trail">Aucune étape pour la branche.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold text-earth">Badges ({data.badges.length})</h3>
          {data.badges.length === 0 ? (
            <p className="text-sm text-trail">Aucun badge.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {data.badges.map((b) => (
                <li
                  key={b.awardId}
                  className="rounded-full border border-stone/50 px-3 py-1 text-sm text-earth"
                >
                  {b.icon ?? "🏅"} {b.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-bold text-earth">Objectifs</h3>
          {data.goals.length === 0 ? (
            <p className="text-sm text-trail">Aucun objectif.</p>
          ) : (
            <ul className="space-y-1">
              {data.goals.map((g) => (
                <li key={g.id} className="text-sm text-earth">
                  {g.status === "ACHIEVED" ? "✅" : "•"} {g.title}
                  {g.target ? ` — ${g.target}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1">
          <h3 className="font-bold text-earth">Présence</h3>
          {!attendance || attendance.total === 0 ? (
            <p className="text-sm text-trail">Aucun pointage enregistré.</p>
          ) : (
            <p className="text-sm text-earth">
              Présent à {attendance.present}/{attendance.total} événements pointés
              {attendance.rate !== null ? ` (${attendance.rate}%)` : ""}.
              {attendance.atRisk
                ? ` ⚠️ ${attendance.consecutiveAbsences} absences consécutives (seuil ${CONSECUTIVE_ABSENCE_THRESHOLD}).`
                : ""}
            </p>
          )}
        </section>
      </article>
    </div>
  );
}
