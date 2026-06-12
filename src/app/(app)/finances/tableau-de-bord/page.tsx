import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  getFinancialDashboard,
  getFinancialYears,
} from "@/modules/finance/dashboard";
import { formatEuros } from "@/modules/finance/format";

const MONTHS = [
  "janv",
  "févr",
  "mars",
  "avr",
  "mai",
  "juin",
  "juil",
  "août",
  "sept",
  "oct",
  "nov",
  "déc",
];

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

export default async function FinancialDashboardPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");

  const { year } = await searchParams;
  const now = new Date().getUTCFullYear();
  const selectedYear = year && /^\d{4}$/.test(year) ? Number(year) : now;

  const [data, years] = await Promise.all([
    getFinancialDashboard(selectedYear),
    getFinancialYears(),
  ]);
  if (!years.includes(selectedYear)) years.unshift(selectedYear);

  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.cents));
  const maxMonth = Math.max(
    1,
    ...data.byMonth.flatMap((m) => [m.inCents, m.outCents]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
            <Wallet className="size-3.5" />
            Finances
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Tableau de bord
          </h1>
        </div>
        <div className="flex gap-1 rounded-full bg-sand p-1">
          {years.map((y) => (
            <Link
              key={y}
              href={{ pathname: "/finances/tableau-de-bord", query: { year: y } }}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-bold transition-colors",
                y === selectedYear ? "bg-snow text-earth shadow-sm" : "text-trail",
              )}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      {/* Indicateurs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <p className="flex items-center gap-1 text-lg font-black text-forest md:text-2xl">
            <TrendingUp className="size-4" />
            {formatEuros(data.encaissedCents)}
          </p>
          <p className="text-xs text-trail">Encaissé</p>
        </div>
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <p className="flex items-center gap-1 text-lg font-black text-brick md:text-2xl">
            <TrendingDown className="size-4" />
            {formatEuros(data.disbursedCents)}
          </p>
          <p className="text-xs text-trail">Décaissé</p>
        </div>
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <p
            className={cn(
              "text-lg font-black md:text-2xl",
              data.netCents >= 0 ? "text-earth" : "text-brick",
            )}
          >
            {formatEuros(data.netCents)}
          </p>
          <p className="text-xs text-trail">Net</p>
        </div>
      </div>

      {data.netCents < 0 ? (
        <p className="rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm font-medium text-brick-ink">
          ⚠️ Les sorties dépassent les entrées sur {selectedYear}.
        </p>
      ) : null}

      <p className="text-xs text-trail">
        « Net » = encaissé − décaissé sur l&apos;année. Ce n&apos;est pas un
        solde bancaire (gestion par caisses à venir).
      </p>

      {/* Évolution mensuelle */}
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Évolution mensuelle</h2>
        <div className="flex items-end justify-between gap-1">
          {data.byMonth.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 items-end gap-0.5">
                <div
                  className="w-2 rounded-t bg-forest"
                  style={{ height: `${(m.inCents / maxMonth) * 100}%` }}
                  title={`Entrées : ${formatEuros(m.inCents)}`}
                />
                <div
                  className="w-2 rounded-t bg-brick"
                  style={{ height: `${(m.outCents / maxMonth) * 100}%` }}
                  title={`Sorties : ${formatEuros(m.outCents)}`}
                />
              </div>
              <span className="text-[10px] text-trail">{MONTHS[m.month]}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-trail">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-forest" /> Entrées
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-brick" /> Sorties
          </span>
        </div>
      </section>

      {/* Répartition des dépenses par catégorie */}
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Dépenses par catégorie</h2>
        {data.byCategory.length === 0 ? (
          <p className="text-sm text-trail">Aucune dépense remboursée.</p>
        ) : (
          <ul className="space-y-2">
            {data.byCategory.map((c) => (
              <li key={c.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-earth">
                    {EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ??
                      c.category}
                  </span>
                  <span className="font-bold text-earth">
                    {formatEuros(c.cents)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sand">
                  <div
                    className="h-full rounded-full bg-sky"
                    style={{ width: `${(c.cents / maxCat) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
