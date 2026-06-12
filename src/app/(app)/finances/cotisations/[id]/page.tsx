import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { UNIT_LABEL, type Unit } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { getCampaignDetail } from "@/modules/finance/campaigns";
import { formatEuros } from "@/modules/finance/format";

import { RecordPaymentRow } from "../RecordPaymentRow";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");
  const canManage = can(user, "campaign.manage");

  const data = await getCampaignDetail(id);
  if (!data) notFound();
  const { campaign, rows, stats } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/finances/cotisations"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour aux cotisations
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {campaign.name}
        </h1>
        <p className="text-sm text-trail">
          {formatEuros(campaign.amountCents)} / jeune ·{" "}
          {campaign.unit
            ? (UNIT_LABEL[campaign.unit as Unit] ?? campaign.unit)
            : "Tout le groupe"}
          {campaign.deadline
            ? ` · échéance ${DATE_FMT.format(campaign.deadline)}`
            : ""}
        </p>
      </header>

      {/* Indicateurs */}
      <div className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold text-earth">
            {stats.pct}% encaissé
          </span>
          <span className="text-sm text-trail">
            {stats.paidCount}/{stats.total} à jour
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-forest"
            style={{ width: `${Math.min(100, stats.pct)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-black text-earth">
              {formatEuros(stats.collectedCents)}
            </p>
            <p className="text-xs text-trail">Encaissé</p>
          </div>
          <div>
            <p className="font-black text-earth">
              {formatEuros(stats.expectedCents)}
            </p>
            <p className="text-xs text-trail">Attendu</p>
          </div>
          <div>
            <p className="font-black text-brick">
              {formatEuros(stats.remainingCents)}
            </p>
            <p className="text-xs text-trail">Reste</p>
          </div>
        </div>
      </div>

      {/* Suivi par jeune */}
      {rows.length === 0 ? (
        <p className="text-sm text-trail">
          Aucun jeune actif dans ce périmètre.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <RecordPaymentRow
              key={r.user.id}
              campaignId={campaign.id}
              userId={r.user.id}
              firstName={r.user.firstName}
              lastName={r.user.lastName}
              image={r.user.image}
              paidCents={r.paidCents}
              expectedCents={campaign.amountCents}
              status={r.status}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
