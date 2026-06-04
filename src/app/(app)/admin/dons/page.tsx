import { Gift } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { requireCan } from "@/lib/require-can";
import { cn } from "@/lib/utils";
import {
  listCategories,
  listDonations,
  type DonationStatusFilter,
} from "@/modules/inventory/queries";
import {
  CONDITION_LABEL,
  DONATION_STATUS_LABEL,
} from "@/modules/inventory/types";

import { DonationReviewActions } from "./donation-review-actions";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const FILTERS: { value: DonationStatusFilter; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "processed", label: "Traités" },
  { value: "all", label: "Tous" },
];

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-sun-soft text-sun-ink",
  APPROVED: "bg-forest-soft text-forest-ink",
  REJECTED: "bg-brick-soft text-brick-ink",
};

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminDonationsPage({ searchParams }: PageProps) {
  // US-32 — validation des dons : RESPONSABLE_MATERIEL (+ ADMIN).
  await requireCan("donation.review");
  const params = await searchParams;
  const filter: DonationStatusFilter =
    params.filter === "processed" || params.filter === "all"
      ? params.filter
      : "pending";

  const [donations, categories] = await Promise.all([
    listDonations(filter),
    listCategories({ includeArchived: true }),
  ]);
  const labelOf = (slug: string) =>
    categories.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-earth">
            <Gift className="size-7 text-forest" />
            Dons
          </h1>
          <p className="text-trail">
            Validez les propositions de don avant leur entrée dans le stock.
          </p>
        </div>
        <Link
          href="/dons/nouveau"
          className="text-sm font-bold text-forest hover:underline"
        >
          + Proposer un don
        </Link>
      </header>

      <nav aria-label="Filtre" className="inline-flex rounded-full bg-snow p-1 shadow-card">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "pending" ? "/admin/dons" : `/admin/dons?filter=${f.value}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              filter === f.value ? "bg-forest text-snow" : "text-trail hover:bg-sand",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {donations.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="Aucun don"
          description={
            filter === "pending"
              ? "Aucune proposition en attente de validation."
              : "Aucun don dans ce filtre."
          }
        />
      ) : (
        <ul className="space-y-3">
          {donations.map((d) => (
            <li key={d.id} className="space-y-3 rounded-2xl bg-snow p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-earth">{d.name}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        STATUS_TONE[d.status] ?? "bg-stone text-earth",
                      )}
                    >
                      {DONATION_STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-trail">
                    {labelOf(d.category)} · ×{d.quantity} ·{" "}
                    {CONDITION_LABEL[d.condition as keyof typeof CONDITION_LABEL] ??
                      d.condition}
                  </p>
                  <p className="text-xs text-trail">
                    {d.donorName ? `Don de ${d.donorName} · ` : ""}
                    proposé le {DATE_FMT.format(d.createdAt)}
                    {d.dropoffDate
                      ? ` · dépôt prévu le ${DATE_FMT.format(d.dropoffDate)}`
                      : ""}
                  </p>
                  {d.note ? (
                    <p className="mt-1 rounded-lg bg-sand px-3 py-2 text-sm text-earth">
                      {d.note}
                    </p>
                  ) : null}
                  {d.status === "REJECTED" && d.rejectedReason ? (
                    <p className="mt-1 text-xs font-medium text-brick-ink">
                      Motif du refus : {d.rejectedReason}
                    </p>
                  ) : null}
                </div>
              </div>

              {d.status === "PENDING" ? <DonationReviewActions id={d.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
