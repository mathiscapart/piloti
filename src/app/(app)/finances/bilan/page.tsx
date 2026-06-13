import { Download, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EXPENSE_CATEGORY_LABEL, type ExpenseCategory } from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  getFinancialDashboard,
  getFinancialYears,
} from "@/modules/finance/dashboard";
import { formatEuros } from "@/modules/finance/format";

import { PrintButton } from "./PrintButton";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

function Cell({ cents, tone }: { cents: number; tone?: "in" | "out" }) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-right font-bold tabular-nums",
        tone === "in" ? "text-forest" : tone === "out" ? "text-brick" : "text-earth",
      )}
    >
      {formatEuros(cents)}
    </td>
  );
}

export default async function BilanPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!can(user, "campaign.view")) redirect("/dashboard");

  const { year } = await searchParams;
  const now = new Date().getUTCFullYear();
  const selectedYear = year && /^\d{4}$/.test(year) ? Number(year) : now;

  const [current, previous, years] = await Promise.all([
    getFinancialDashboard(selectedYear),
    getFinancialDashboard(selectedYear - 1),
    getFinancialYears(),
  ]);
  if (!years.includes(selectedYear)) years.unshift(selectedYear);

  const delta = (a: number, b: number) => a - b;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
            <Wallet className="size-3.5" />
            Finances
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Bilan {selectedYear}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex gap-1 rounded-full bg-sand p-1">
            {years.map((y) => (
              <Link
                key={y}
                href={{ pathname: "/finances/bilan", query: { year: y } }}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-bold transition-colors",
                  y === selectedYear ? "bg-snow text-earth shadow-sm" : "text-trail",
                )}
              >
                {y}
              </Link>
            ))}
          </div>
          <PrintButton />
          <Link
            href={`/finances/bilan/export?year=${selectedYear}`}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-input px-3 text-sm font-bold text-earth hover:bg-sand"
          >
            <Download className="size-4" />
            CSV
          </Link>
        </div>
      </header>

      {/* Comparaison N vs N-1 */}
      <section className="overflow-hidden rounded-2xl bg-snow shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone/50 text-xs uppercase tracking-wider text-trail">
              <th className="px-3 py-2 text-left font-bold"> </th>
              <th className="px-3 py-2 text-right font-bold">{selectedYear}</th>
              <th className="px-3 py-2 text-right font-bold">{selectedYear - 1}</th>
              <th className="px-3 py-2 text-right font-bold">Δ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-stone/30">
              <td className="px-3 py-2 text-earth">Encaissé</td>
              <Cell cents={current.encaissedCents} tone="in" />
              <Cell cents={previous.encaissedCents} />
              <Cell cents={delta(current.encaissedCents, previous.encaissedCents)} />
            </tr>
            <tr className="border-b border-stone/30">
              <td className="px-3 py-2 text-earth">Décaissé</td>
              <Cell cents={current.disbursedCents} tone="out" />
              <Cell cents={previous.disbursedCents} />
              <Cell cents={delta(current.disbursedCents, previous.disbursedCents)} />
            </tr>
            <tr className="font-bold">
              <td className="px-3 py-2 text-earth">Net</td>
              <Cell cents={current.netCents} />
              <Cell cents={previous.netCents} />
              <Cell cents={delta(current.netCents, previous.netCents)} />
            </tr>
          </tbody>
        </table>
      </section>

      {/* Dépenses par catégorie */}
      <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">
          Dépenses par catégorie ({selectedYear})
        </h2>
        {current.byCategory.length === 0 ? (
          <p className="text-sm text-trail">Aucune dépense remboursée.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {current.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between">
                <span className="text-earth">
                  {EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category}
                </span>
                <span className="font-bold text-earth">{formatEuros(c.cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-trail">
        Bilan généré depuis Piloti — encaissé = cotisations ; décaissé = notes de
        frais remboursées. Le net n&apos;est pas un solde bancaire.
      </p>
    </div>
  );
}
