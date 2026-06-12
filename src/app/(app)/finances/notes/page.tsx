import { Plus, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_STATUS_LABEL,
  REIMBURSEMENT_METHOD_LABEL,
  type ExpenseCategory,
  type ExpenseStatus,
  type ReimbursementMethod,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/modules/finance/format";
import {
  getExpenseSummary,
  listExpenses,
  type ExpenseStatusFilter,
} from "@/modules/finance/queries";

import { ExpenseActions } from "./ExpenseActions";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const STATUS_TONE: Record<ExpenseStatus, string> = {
  PENDING: "bg-sun-soft text-sun-ink",
  APPROVED: "bg-sky-soft text-sky-ink",
  REIMBURSED: "bg-forest-soft text-forest-ink",
  REJECTED: "bg-brick-soft text-brick-ink",
};

const TABS: { value: ExpenseStatusFilter; label: string }[] = [
  { value: "pending", label: "À traiter" },
  { value: "processed", label: "Traitées" },
  { value: "all", label: "Toutes" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "expense.view")) redirect("/dashboard");
  const canManage = can(user, "expense.manage");
  const canCreate = can(user, "expense.create");

  const { status } = await searchParams;
  const statusFilter: ExpenseStatusFilter =
    status === "processed" || status === "all" ? status : "pending";

  const [expenses, summary] = await Promise.all([
    listExpenses({
      scope: canManage ? "all" : "mine",
      viewerId: user.id,
      status: statusFilter,
    }),
    canManage ? getExpenseSummary() : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
            <Wallet className="size-3.5" />
            Finances
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Notes de frais
          </h1>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/finances/notes/nouvelle">
              <Plus className="size-4" />
              Déclarer une note
            </Link>
          </Button>
        ) : null}
      </header>

      {summary ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-snow p-4 shadow-card">
            <p className="text-2xl font-black text-earth">
              {summary.pendingCount}
            </p>
            <p className="text-xs text-trail">
              À traiter · {formatEuros(summary.pendingCents)}
            </p>
          </div>
          <div className="rounded-2xl bg-snow p-4 shadow-card">
            <p className="text-2xl font-black text-earth">
              {formatEuros(summary.toReimburseCents)}
            </p>
            <p className="text-xs text-trail">
              À rembourser ({summary.toReimburseCount})
            </p>
          </div>
        </div>
      ) : null}

      {/* Filtres de statut */}
      <div className="flex gap-1 rounded-full bg-sand p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={{ pathname: "/finances/notes", query: { status: tab.value } }}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
              statusFilter === tab.value
                ? "bg-snow text-earth shadow-sm"
                : "text-trail",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aucune note de frais"
          description={
            canCreate
              ? "Déclare une dépense que tu as avancée pour être remboursé."
              : "Aucune note de frais pour ce filtre."
          }
        />
      ) : (
        <ul className="space-y-3">
          {expenses.map((e) => (
            <li key={e.id} className="space-y-2 rounded-2xl bg-snow p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black text-earth">
                      {formatEuros(e.amountCents)}
                    </span>
                    <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-bold text-earth">
                      {EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ??
                        e.category}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        STATUS_TONE[e.status as ExpenseStatus],
                      )}
                    >
                      {EXPENSE_STATUS_LABEL[e.status as ExpenseStatus] ?? e.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-trail">
                    {DATE_FMT.format(e.date)}
                    {e.event ? ` · ${e.event.name}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                  {canManage ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-trail">
                      <UserAvatar
                        image={e.declarant.image}
                        firstName={e.declarant.firstName}
                        lastName={e.declarant.lastName}
                        className="size-5 text-[9px]"
                      />
                      {e.declarant.firstName} {e.declarant.lastName}
                    </p>
                  ) : null}
                </div>
                {e.receiptUrl ? (
                  <a
                    href={e.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-xs font-bold text-earth hover:bg-sand/70"
                  >
                    <Receipt className="size-3.5" />
                    Reçu
                  </a>
                ) : null}
              </div>

              {e.status === "REJECTED" && e.rejectionReason ? (
                <p className="rounded-md bg-brick-soft px-3 py-1.5 text-xs text-brick-ink">
                  Refusée : {e.rejectionReason}
                </p>
              ) : null}
              {e.status === "REIMBURSED" ? (
                <p className="text-xs font-medium text-forest-ink">
                  Remboursée
                  {e.reimbursementMethod
                    ? ` · ${REIMBURSEMENT_METHOD_LABEL[e.reimbursementMethod as ReimbursementMethod] ?? e.reimbursementMethod}`
                    : ""}
                </p>
              ) : null}

              {canManage ? <ExpenseActions id={e.id} status={e.status} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
