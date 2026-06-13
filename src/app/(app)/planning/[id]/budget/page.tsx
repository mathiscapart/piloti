import { ArrowLeft, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { getEventBudget } from "@/modules/finance/budget";
import { formatEuros } from "@/modules/finance/format";

import { BudgetManager } from "./BudgetManager";
import { EventPaymentRow } from "./EventPaymentRow";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EventBudgetPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!can(user, "budget.view")) redirect(`/planning/${id}`);
  const canManage = can(user, "budget.manage");

  const data = await getEventBudget(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={`/planning/${id}`}
        className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
      >
        <ArrowLeft className="size-4" />
        Retour à l&apos;événement
      </Link>

      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Wallet className="size-3.5" />
          Budget & finances
        </p>
        <h1 className="text-2xl font-black text-earth md:text-3xl">
          {data.event.name}
        </h1>
      </header>

      <BudgetManager
        eventId={data.event.id}
        price={data.price}
        rows={data.budgetRows}
        totalPlanned={data.totalPlanned}
        totalActual={data.totalActual}
        attendeeCount={data.attendeeCount}
        costPerYouthCents={data.costPerYouthCents}
        marginCents={data.marginCents}
        canManage={canManage}
      />

      {/* Encaissement des inscriptions (si l'événement est payant) */}
      {data.price > 0 ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-earth">Encaissements</h2>
            <span className="text-sm font-bold text-forest">
              {formatEuros(data.collectedCents)} /{" "}
              {formatEuros(data.expectedRevenueCents)}
            </span>
          </div>
          {data.registrations.length === 0 ? (
            <p className="text-sm text-trail">
              Aucun inscrit confirmé pour le moment.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.registrations.map((r) => (
                <EventPaymentRow
                  key={r.user.id}
                  eventId={data.event.id}
                  userId={r.user.id}
                  firstName={r.user.firstName}
                  lastName={r.user.lastName}
                  image={r.user.image}
                  paidCents={r.paidCents}
                  dueCents={r.dueCents}
                  priceCents={data.price}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
