import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LoanStatusBadge } from "@/components/loans/LoanStatusBadge";
import { ReturnForm } from "@/components/loans/ReturnForm";
import { db } from "@/lib/db";
import { getLoanDetail } from "@/modules/inventory/queries";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReturnLoanPage({ params }: PageProps) {
  const { id } = await params;
  const loan = await getLoanDetail(id);
  if (!loan) notFound();

  // US-17 — la catégorie de l'article peut imposer une pesée au retour.
  const category = await db.category.findUnique({
    where: { slug: loan.equipment.category },
    select: { requireWeighing: true },
  });

  // US-18 — poids de référence = dernière pesée connue, sinon poids de base.
  let referenceWeight = loan.equipment.baseWeightKg;
  if (category?.requireWeighing) {
    const lastWeighing = await db.loan.findFirst({
      where: {
        equipmentId: loan.equipment.id,
        returnWeightKg: { not: null },
        NOT: { id: loan.id },
      },
      orderBy: { returnedAt: "desc" },
      select: { returnWeightKg: true },
    });
    if (lastWeighing?.returnWeightKg != null) {
      referenceWeight = lastWeighing.returnWeightKg;
    }
  }
  if (loan.status === "RETOURNE") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 md:px-8 md:py-10">
        <Link
          href="/prets"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux prêts
        </Link>
        <div className="rounded-2xl bg-snow p-6 shadow-card">
          <p className="font-bold text-earth">Ce prêt est déjà clôturé.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Link
          href="/prets"
          className="inline-flex items-center gap-1 text-sm font-bold text-trail hover:text-earth"
        >
          <ArrowLeft className="size-4" />
          Retour aux prêts
        </Link>
        <h1 className="text-3xl font-black text-earth">Retour de matériel</h1>
        <p className="text-trail">
          Indique l&apos;état du matériel. S&apos;il est abîmé, un signalement
          sera créé automatiquement à la suite.
        </p>
      </header>

      <section className="rounded-2xl bg-snow p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={`/stock/${loan.equipment.id}`}
              className="font-bold text-earth hover:text-forest"
            >
              {loan.equipment.name}
            </Link>
            <p className="text-sm text-trail">
              Emprunté par {loan.borrower.firstName} {loan.borrower.lastName}
              {loan.eventName ? ` · ${loan.eventName}` : ""}
            </p>
            <p className="text-sm text-trail">
              Du {DATE_FMT.format(loan.startDate)} au{" "}
              {DATE_FMT.format(loan.expectedReturn)}
            </p>
          </div>
          <LoanStatusBadge status={loan.status} />
        </div>
      </section>

      <ReturnForm
        loanId={loan.id}
        quantity={loan.quantity}
        requireWeighing={category?.requireWeighing ?? false}
        baseWeightKg={referenceWeight}
      />
    </div>
  );
}
