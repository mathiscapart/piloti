"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { formatEuros } from "@/modules/finance/format";
import {
  recordPayment,
  toggleExemption,
} from "@/modules/finance/campaign-actions";

const STATUS_TONE: Record<PaymentStatus, string> = {
  PAID: "bg-forest-soft text-forest-ink",
  PARTIAL: "bg-sky-soft text-sky-ink",
  PENDING: "bg-sun-soft text-sun-ink",
  LATE: "bg-brick-soft text-brick-ink",
};

export interface PaymentRowVM {
  campaignId: string;
  userId: string;
  firstName: string;
  lastName: string;
  image: string | null;
  paidCents: number;
  expectedCents: number;
  status: PaymentStatus;
  exempt: boolean;
  reminded: boolean;
  canManage: boolean;
}

export function RecordPaymentRow(props: PaymentRowVM) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    String(Math.max(0, props.expectedCents - props.paidCents) / 100),
  );
  const [method, setMethod] = useState<PaymentMethod>("CHEQUE");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await recordPayment(
        props.campaignId,
        props.userId,
        amount,
        method,
        date,
      );
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Paiement enregistré.");
        setOpen(false);
        router.refresh();
      }
    });
  }

  function toggleExempt() {
    start(async () => {
      const res = await toggleExemption(props.campaignId, props.userId);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(
          props.exempt ? "Relances réactivées." : "Relances suspendues.",
        );
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
            {formatEuros(props.paidCents)} / {formatEuros(props.expectedCents)}
          </p>
        </div>
        {props.exempt ? (
          <span className="shrink-0 rounded-full bg-stone px-2 py-0.5 text-xs font-bold text-earth">
            Échelonnement
          </span>
        ) : props.reminded && props.status !== "PAID" ? (
          <span className="shrink-0 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-bold text-sun-ink">
            Relancé
          </span>
        ) : null}
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
            STATUS_TONE[props.status],
          )}
        >
          {PAYMENT_STATUS_LABEL[props.status]}
        </span>
        {props.canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
          >
            <Plus className="size-4" />
            Paiement
          </Button>
        ) : null}
      </div>

      {props.canManage && props.status !== "PAID" ? (
        <button
          type="button"
          onClick={toggleExempt}
          disabled={pending}
          className="text-xs font-bold text-trail underline-offset-2 hover:text-earth hover:underline disabled:opacity-50"
        >
          {props.exempt
            ? "Réactiver les relances"
            : "Échelonnement convenu (suspendre les relances)"}
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
          <div className="space-y-1">
            <label className="text-xs text-trail">Mode</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-earth"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m as PaymentMethod]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-trail">Date</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-40 appearance-none"
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
