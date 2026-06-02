import { CornerDownLeft, Droplets, Phone } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoanListItem } from "@/modules/inventory/queries";

import { DryingDialog, type DryingContactOption } from "./DryingDialog";
import { LoanStatusBadge } from "./LoanStatusBadge";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function daysOverdue(expectedReturn: Date): number {
  const ms = Date.now() - expectedReturn.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function isLoanLate(loan: LoanListItem): boolean {
  return (
    loan.status === "RETARD" ||
    (loan.status === "ACTIF" && loan.expectedReturn < new Date())
  );
}

/**
 * US-32 — affiche un prêt groupé : l'emprunteur et l'événement une seule fois,
 * puis une ligne par article (chacun avec sa date de retour, son statut et ses
 * actions de retour / séchage). Un prêt mono-article (legacy, sans groupId)
 * s'affiche comme un groupe d'un seul article.
 */
export function LoanGroupCard({
  loans,
  dryableCategories,
  dryingContacts,
}: {
  loans: LoanListItem[];
  dryableCategories: Set<string>;
  dryingContacts: DryingContactOption[];
}) {
  const head = loans[0];
  const anyLate = loans.some(isLoanLate);
  const allReturned = loans.every((l) => l.status === "RETOURNE");

  return (
    <article
      className={cn(
        "rounded-2xl bg-snow p-4 shadow-card",
        anyLate && "border-l-4 border-brick",
      )}
    >
      {/* En-tête commun : emprunteur + événement + contact */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* US-14 — nom cliquable → fiche membre (matériel détenu + contact) */}
          <Link
            href={`/membres/${head.borrower.id}`}
            className="font-bold text-earth hover:text-forest"
          >
            {head.borrower.firstName} {head.borrower.lastName}
          </Link>
          <p className="text-sm text-trail">
            {head.eventName ? `${head.eventName} · ` : ""}
            {loans.length} article{loans.length > 1 ? "s" : ""}
            {" · "}sortie le {DATE_FMT.format(head.startDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allReturned ? (
            <span className="inline-flex items-center rounded-full bg-stone px-2.5 py-0.5 text-xs font-bold text-earth">
              Clôturé
            </span>
          ) : null}
          {head.borrower.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${head.borrower.phone.replace(/\s/g, "")}`}>
                <Phone className="size-4" />
                Appeler
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Une ligne par article du prêt */}
      <ul className="mt-3 space-y-2 border-t border-stone/50 pt-3">
        {loans.map((loan) => {
          const late = isLoanLate(loan);
          const overdue = late ? daysOverdue(loan.expectedReturn) : 0;
          const canAct = loan.status === "ACTIF" || loan.status === "RETARD";
          const canDry =
            canAct && dryableCategories.has(loan.equipment.category);
          return (
            <li
              key={loan.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/stock/${loan.equipment.id}`}
                    className="font-bold text-earth hover:text-forest"
                  >
                    {loan.equipment.name}
                  </Link>
                  {loan.quantity > 1 ? (
                    <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-earth">
                      ×{loan.quantity}
                    </span>
                  ) : null}
                  <LoanStatusBadge status={loan.status} />
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-sm",
                    late ? "font-bold text-brick" : "text-trail",
                  )}
                >
                  Retour {late ? "était" : "prévu"} le{" "}
                  {DATE_FMT.format(loan.expectedReturn)}
                  {overdue > 0 ? ` · ${overdue} j de retard` : ""}
                </p>
                {loan.status === "SECHAGE" && loan.dryingLocation ? (
                  <p className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-full bg-sky-soft px-2.5 py-0.5 text-xs font-bold text-sky-ink">
                    <Droplets className="size-3" />
                    Séchage : {loan.dryingLocation}
                    {/* US-23 — responsable rattaché à un compte */}
                    {loan.dryingContact ? (
                      <>
                        {" · "}
                        {loan.dryingContact.firstName}{" "}
                        {loan.dryingContact.lastName}
                        {loan.dryingContact.phone ? (
                          <a
                            href={`tel:${loan.dryingContact.phone.replace(/\s/g, "")}`}
                            className="underline"
                          >
                            ({loan.dryingContact.phone})
                          </a>
                        ) : null}
                      </>
                    ) : loan.dryingPersonName ? (
                      <>
                        {" · "}
                        {loan.dryingPersonName}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
                {canDry ? (
                  <DryingDialog loanId={loan.id} contacts={dryingContacts} />
                ) : null}
                {loan.status !== "RETOURNE" ? (
                  <Button asChild size="sm">
                    <Link href={`/prets/${loan.id}/retour`}>
                      <CornerDownLeft className="size-4" />
                      Retourner
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
