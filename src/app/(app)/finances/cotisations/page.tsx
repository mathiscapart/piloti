import { CreditCard, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { UNIT_LABEL, type Unit } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { formatEuros } from "@/modules/finance/format";
import { listCampaigns } from "@/modules/finance/campaigns";

import { CampaignForm } from "./CampaignForm";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");
  const canManage = can(user, "campaign.manage");

  const campaigns = await listCampaigns();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Wallet className="size-3.5" />
          Finances
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Cotisations
        </h1>
      </header>

      {canManage ? (
        <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
          <h2 className="font-bold text-earth">Nouvelle campagne</h2>
          <CampaignForm />
        </section>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Aucune campagne"
          description="Lance une campagne de cotisation pour demander un paiement aux familles."
        />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/finances/cotisations/${c.id}`}
                className="block space-y-1 rounded-2xl bg-snow p-4 shadow-card transition-colors hover:bg-sand/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-earth">{c.name}</span>
                  <span className="text-sm font-bold text-forest">
                    {formatEuros(c.collectedCents)} encaissés
                  </span>
                </div>
                <p className="text-xs text-trail">
                  {formatEuros(c.amountCents)} / jeune ·{" "}
                  {c.unit ? (UNIT_LABEL[c.unit as Unit] ?? c.unit) : "Tout le groupe"}
                  {c.deadline ? ` · échéance ${DATE_FMT.format(c.deadline)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
