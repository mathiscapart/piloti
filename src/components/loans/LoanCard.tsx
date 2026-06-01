import { CornerDownLeft, Droplets, Phone } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoanListItem } from "@/modules/inventory/queries";

import { DryingDialog } from "./DryingDialog";
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

export function LoanCard({
  loan,
  dryableCategories,
}: {
  loan: LoanListItem;
  dryableCategories: Set<string>;
}) {
  const isLate =
    loan.status === "RETARD" ||
    (loan.status === "ACTIF" && loan.expectedReturn < new Date());
  const overdue = isLate ? daysOverdue(loan.expectedReturn) : 0;
  const canAct = loan.status === "ACTIF" || loan.status === "RETARD";
  const canDry = canAct && dryableCategories.has(loan.equipment.category);

  return (
    <article
      className={cn(
        "rounded-2xl bg-snow p-4 shadow-card",
        isLate && "border-l-4 border-brick",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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

          <p className="mt-0.5 text-sm text-trail">
            <span className="font-bold text-earth">
              {loan.borrower.firstName} {loan.borrower.lastName}
            </span>
            {loan.eventName ? ` · ${loan.eventName}` : ""}
          </p>

          <p
            className={cn(
              "mt-1 text-sm",
              isLate ? "font-bold text-brick" : "text-trail",
            )}
          >
            Retour {isLate ? "était" : "prévu"} le{" "}
            {DATE_FMT.format(loan.expectedReturn)}
            {overdue > 0 ? ` · ${overdue} j de retard` : ""}
          </p>

          {loan.status === "SECHAGE" && loan.dryingLocation ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-soft px-2.5 py-0.5 text-xs font-bold text-sky-ink">
              <Droplets className="size-3" />
              Séchage : {loan.dryingLocation}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 md:flex-shrink-0">
          {loan.borrower.phone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${loan.borrower.phone.replace(/\s/g, "")}`}>
                <Phone className="size-4" />
                Appeler
              </a>
            </Button>
          ) : null}
          {canDry ? <DryingDialog loanId={loan.id} /> : null}
          {loan.status !== "RETOURNE" ? (
            <Button asChild size="sm">
              <Link href={`/prets/${loan.id}/retour`}>
                <CornerDownLeft className="size-4" />
                Retourner
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
