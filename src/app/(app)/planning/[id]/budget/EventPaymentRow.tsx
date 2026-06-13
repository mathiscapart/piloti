"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import {
  recordEventPayment,
  toggleEventSocial,
} from "@/modules/finance/budget-actions";
import { formatEuros } from "@/modules/finance/format";

export interface PaymentRowVM {
  eventId: string;
  userId: string;
  firstName: string;
  lastName: string;
  image: string | null;
  paidCents: number;
  dueCents: number;
  priceCents: number;
  social: boolean;
  provisional: boolean;
  canManage: boolean;
}

export function EventPaymentRow(props: PaymentRowVM) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(props.dueCents / 100));
  const [pending, start] = useTransition();

  const paid = props.dueCents === 0 && props.priceCents > 0;
  const partial = props.paidCents > 0 && props.dueCents > 0;

  function submit() {
    start(async () => {
      const res = await recordEventPayment(props.eventId, props.userId, amount);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Encaissement enregistré.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  function toggleSocial() {
    start(async () => {
      const res = await toggleEventSocial(props.eventId, props.userId);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(props.social ? "Cas social retiré." : "Tarif cas social appliqué.");
        router.refresh();
      }
    });
  }

  return (
    <li className="space-y-2 rounded-2xl bg-snow p-3 shadow-card">
      <div className="flex items-center gap-3">
        <UserAvatar
          image={props.image}
          firstName={props.firstName}
          lastName={props.lastName}
          className="size-9"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-earth">
            {props.firstName} {props.lastName}
          </p>
          <p className="text-xs text-trail">
            {formatEuros(props.paidCents)} / {formatEuros(props.priceCents)}
          </p>
        </div>
        {props.social ? (
          <span className="shrink-0 rounded-full bg-forest-soft px-2 py-0.5 text-xs font-bold text-forest-ink">
            Cas social
          </span>
        ) : null}
        {props.provisional ? (
          <span className="shrink-0 rounded-full bg-stone px-2 py-0.5 text-xs font-bold text-earth">
            Provisoire
          </span>
        ) : null}
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
            paid
              ? "bg-forest-soft text-forest-ink"
              : partial
                ? "bg-sky-soft text-sky-ink"
                : "bg-sun-soft text-sun-ink",
          )}
        >
          {paid ? "Payé" : partial ? "Partiel" : "Dû"}
        </span>
        {props.canManage && !paid ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
          >
            <Plus className="size-4" />
            Encaisser
          </Button>
        ) : null}
      </div>

      {props.canManage ? (
        <button
          type="button"
          onClick={toggleSocial}
          disabled={pending}
          className="text-xs font-bold text-trail underline-offset-2 hover:text-earth hover:underline disabled:opacity-50"
        >
          {props.social ? "Retirer le tarif cas social" : "Appliquer le tarif cas social"}
        </button>
      ) : null}

      {open && props.canManage ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sand/60 p-2">
          <div className="space-y-1">
            <label className="text-xs text-trail">Montant (€)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="h-9 w-24"
            />
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={submit}>
            {pending ? "…" : "Enregistrer"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
