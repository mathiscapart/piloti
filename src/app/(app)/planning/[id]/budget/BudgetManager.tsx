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
import { setBudgetLine, setEventPrice } from "@/modules/finance/budget-actions";
import { formatEuros } from "@/modules/finance/format";

interface BudgetRow {
  category: string;
  plannedCents: number;
  actualCents: number;
}

export function BudgetManager({
  eventId,
  price,
  rows,
  totalPlanned,
  totalActual,
  attendeeCount,
  costPerYouthCents,
  marginCents,
  canManage,
}: {
  eventId: string;
  price: number;
  rows: BudgetRow[];
  totalPlanned: number;
  totalActual: number;
  attendeeCount: number;
  costPerYouthCents: number;
  marginCents: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function savePrice(value: string) {
    start(async () => {
      const res = await setEventPrice(eventId, value);
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

  return (
    <div className="space-y-4">
      {/* Tarif */}
      <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Tarif par jeune</h2>
        {canManage ? (
          <form
            className="flex items-end gap-2"
            action={(fd) => savePrice(String(fd.get("price") ?? ""))}
          >
            <div className="space-y-1">
              <Input
                name="price"
                inputMode="decimal"
                defaultValue={price > 0 ? String(price / 100) : ""}
                placeholder="0 = gratuit"
                className="h-9 w-32"
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
            {formatEuros(marginCents)}
          </p>
          <p className="text-xs text-trail">
            Marge (tarif × inscrits − budget)
          </p>
        </div>
      </section>
    </div>
  );
}
