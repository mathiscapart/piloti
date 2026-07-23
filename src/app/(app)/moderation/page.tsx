import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { REPORT_STATUS_LABEL } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import { cn } from "@/lib/utils";
import { listReports, type ReportStatusFilter } from "@/modules/communication/moderation-queries";

import { ModerationActions } from "./ModerationActions";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const FILTERS: { value: ReportStatusFilter; label: string }[] = [
  { value: "PENDING", label: "En attente" },
  { value: "RESOLVED", label: "Résolus" },
  { value: "DISMISSED", label: "Rejetés" },
  { value: "all", label: "Tous" },
];

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-sun-soft text-sun-ink",
  RESOLVED: "bg-forest-soft text-forest-ink",
  DISMISSED: "bg-stone text-earth",
};

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

// SAFE-02 — file de modération : signalements sur les messages (salon + DM).
// Consultation : CHEF + RESPONSABLE_GROUPE (`moderation.view`). Traitement
// (masquer / résoudre / rejeter) : CHEF (`moderation.review`).
export default async function ModerationPage({ searchParams }: PageProps) {
  const user = await requireCan("moderation.view");
  const canReview = can(user, "moderation.review");
  const params = await searchParams;
  const filter: ReportStatusFilter =
    params.filter === "RESOLVED" || params.filter === "DISMISSED" || params.filter === "all"
      ? params.filter
      : "PENDING";

  const reports = await listReports(filter);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
          <ShieldAlert className="size-7 text-brick" />
          Modération
        </h1>
        <p className="text-trail">
          {canReview
            ? "Traitez les signalements sur les messages (salons et messagerie privée)."
            : "Consultez les signalements (lecture seule)."}
        </p>
      </header>

      <nav aria-label="Filtre" className="inline-flex flex-wrap rounded-full bg-snow p-1 shadow-card">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "PENDING" ? "/moderation" : `/moderation?filter=${f.value}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              filter === f.value ? "bg-forest text-snow" : "text-trail hover:bg-sand",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Aucun signalement"
          description={
            filter === "PENDING"
              ? "Aucun signalement en attente de traitement."
              : "Aucun résultat dans ce filtre."
          }
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="space-y-3 rounded-2xl bg-snow p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-earth">Signalé par {r.reporterName}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        STATUS_TONE[r.status] ?? "bg-stone text-earth",
                      )}
                    >
                      {REPORT_STATUS_LABEL[r.status]}
                    </span>
                    {r.target?.hidden ? (
                      <span className="rounded-full bg-stone px-2 py-0.5 text-xs font-bold text-earth">
                        Déjà masqué
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-trail">
                    {DATE_FMT.format(r.createdAt)}
                    {r.moderatorName
                      ? ` · traité par ${r.moderatorName}${r.resolvedAt ? ` le ${DATE_FMT.format(r.resolvedAt)}` : ""}`
                      : ""}
                  </p>
                  {r.reason ? (
                    <p className="mt-1 rounded-lg bg-sand px-3 py-2 text-sm text-earth">
                      Motif : {r.reason}
                    </p>
                  ) : null}
                  {r.target ? (
                    <div className="mt-2 rounded-lg border border-stone/60 px-3 py-2">
                      <p className="text-xs font-bold text-trail">
                        {r.target.context} · {r.target.authorName}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-earth">
                        {r.target.body}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs italic text-trail">
                      Message introuvable (peut-être déjà supprimé).
                    </p>
                  )}
                  {r.resolution ? (
                    <p className="mt-1 text-xs font-medium text-forest-ink">
                      Résolution : {r.resolution}
                    </p>
                  ) : null}
                </div>
              </div>

              {canReview && r.status === "PENDING" && r.target ? (
                <ModerationActions
                  reportId={r.id}
                  targetType={r.targetType}
                  targetId={r.targetId}
                  alreadyHidden={r.target.hidden}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
