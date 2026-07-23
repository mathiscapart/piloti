"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import {
  setBudgetLine,
  setEventPaymentRequired,
  setEventPricing,
} from "@/modules/finance/budget-actions";
import { formatEuros } from "@/modules/finance/format";

interface BudgetRow {
  category: string;
  plannedCents: number;
  actualCents: number;
}

export function BudgetManager({
  eventId,
  price,
  requirePayment,
  rows,
  totalPlanned,
  totalActual,
  attendeeCount,
  costPerYouthCents,
  marginCents,
  expectedRevenueCents,
  canManage,
}: {
  eventId: string;
  price: number;
  requirePayment: boolean;
  rows: BudgetRow[];
  totalPlanned: number;
  totalActual: number;
  attendeeCount: number;
  costPerYouthCents: number;
  marginCents: number;
  expectedRevenueCents: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function savePricing(priceVal: string) {
    start(async () => {
      const res = await setEventPricing(eventId, priceVal);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tarif enregistré.");
        router.refresh();
      }
    });
  }

  function saveLine(category: string, value: string) {
    start(async () => {
      const res = await setBudgetLine(eventId, category, value);
      if (res?.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function toggleRequire(required: boolean) {
    start(async () => {
      const res = await setEventPaymentRequired(eventId, required);
      if (res?.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Tarif */}
      <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Tarif de base par jeune</h2>
        {canManage ? (
          <form
            className="flex flex-wrap items-end gap-3"
            action={(fd) => savePricing(String(fd.get("price") ?? ""))}
          >
            <div className="space-y-1">
              <label className="text-xs text-trail">Tarif plein (€)</label>
              <Input
                name="price"
                inputMode="decimal"
                defaultValue={price > 0 ? String(price / 100) : ""}
                placeholder="0 = gratuit"
                className="h-9 w-28"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              Enregistrer
            </Button>
          </form>
        ) : (
          <p className="text-sm text-earth">
            {price > 0 ? formatEuros(price) : "Gratuit"}
          </p>
        )}
        {/* QF masqué — décision groupe, cf. DECISIONS.md (l'explication du
            tarif pondéré par tranche de quotient familial est retirée de
            l'UI ; la pondération reste appliquée en coulisse si une tranche
            existe déjà pour le jeune). */}

        {price > 0 ? (
          <label className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              defaultChecked={requirePayment}
              disabled={!canManage || pending}
              onChange={(e) => toggleRequire(e.target.checked)}
              className="mt-0.5 size-4 accent-forest"
            />
            <span className="text-sm text-earth">
              Inscription définitive seulement si payée
              <span className="block text-xs text-trail">
                Les inscriptions non réglées restent « provisoires ».
              </span>
            </span>
          </label>
        ) : null}
      </section>

      {/* Budget prévisionnel vs réel */}
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Budget prévisionnel</h2>
        <ul className="space-y-2">
          {rows.map((r) => {
            const over = r.actualCents > r.plannedCents && r.plannedCents > 0;
            return (
              <li
                key={r.category}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="w-28 shrink-0 text-earth">
                  {EXPENSE_CATEGORY_LABEL[r.category as ExpenseCategory]}
                </span>
                {canManage ? (
                  <Input
                    defaultValue={r.plannedCents > 0 ? String(r.plannedCents / 100) : ""}
                    inputMode="decimal"
                    placeholder="prévu"
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      const cur = r.plannedCents > 0 ? String(r.plannedCents / 100) : "";
                      if (v !== cur) saveLine(r.category, v);
                    }}
                    className="h-8 w-24"
                  />
                ) : (
                  <span className="w-24 text-earth">
                    {formatEuros(r.plannedCents)}
                  </span>
                )}
                <span
                  className={cn(
                    "text-xs",
                    over ? "font-bold text-brick" : "text-trail",
                  )}
                >
                  réel {formatEuros(r.actualCents)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between border-t border-stone/50 pt-2 text-sm font-bold text-earth">
          <span>Total</span>
          <span>
            {formatEuros(totalPlanned)} prévu ·{" "}
            <span className={totalActual > totalPlanned ? "text-brick" : ""}>
              {formatEuros(totalActual)} réel
            </span>
          </span>
        </div>
      </section>

      {/* Indicateurs */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <p className="text-lg font-black text-earth">
            {formatEuros(costPerYouthCents)}
          </p>
          <p className="text-xs text-trail">
            Coût / jeune ({attendeeCount} inscrit{attendeeCount > 1 ? "s" : ""})
          </p>
        </div>
        <div className="rounded-2xl bg-snow p-4 shadow-card">
          <p
            className={cn(
              "text-lg font-black",
              marginCents >= 0 ? "text-forest" : "text-brick",
            )}
          >
            {marginCents >= 0 ? "+" : ""}
            {formatEuros(marginCents)}
          </p>
          <p className="text-xs text-trail">
            Solde (contributions − budget)
          </p>
        </div>
      </section>

      {/* Équilibre : objectif « 0 à la fin » */}
      {price > 0 ? (
        <div
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-3 text-sm shadow-card",
            marginCents >= 0
              ? "bg-forest-soft text-forest-ink"
              : "bg-sun-soft text-sun-ink",
          )}
        >
          <span className="font-bold">
            {marginCents >= 0
              ? marginCents === 0
                ? "Budget équilibré ✓"
                : "Budget couvert ✓"
              : "Budget non couvert"}
          </span>
          <span>
            {formatEuros(expectedRevenueCents)} attendus /{" "}
            {formatEuros(totalPlanned)} prévus
          </span>
        </div>
      ) : null}
    </div>
  );
}
