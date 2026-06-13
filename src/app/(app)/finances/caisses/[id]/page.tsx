import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getCashBox } from "@/modules/finance/cashbox";
import { formatEuros } from "@/modules/finance/format";

import { AddMovementForm } from "../AddMovementForm";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CashBoxDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");
  const canManage = can(user, "campaign.manage");

  const data = await getCashBox(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href="/finances/caisses"
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour aux caisses
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {data.box.name}
        </h1>
        <span
          className={cn(
            "text-2xl font-black tabular-nums",
            data.balanceCents < 0 ? "text-brick" : "text-forest",
          )}
        >
          {formatEuros(data.balanceCents)}
        </span>
      </header>

      {canManage ? <AddMovementForm cashBoxId={data.box.id} /> : null}

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-earth">Grand livre</h2>
        {data.transactions.length === 0 ? (
          <p className="text-sm text-trail">Aucun mouvement.</p>
        ) : (
          <ul className="divide-y divide-stone/40 overflow-hidden rounded-2xl bg-snow shadow-card">
            {data.transactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-earth">
                    {t.label}
                  </p>
                  <p className="text-xs text-trail">{DATE_FMT.format(t.date)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-bold tabular-nums",
                    t.amountCents < 0 ? "text-brick" : "text-forest",
                  )}
                >
                  {t.amountCents >= 0 ? "+" : ""}
                  {formatEuros(t.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
