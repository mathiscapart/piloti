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
  cancelPayment,
  recordPayment,
  toggleExemption,
} from "@/modules/finance/campaign-actions";

const STATUS_TONE: Record<PaymentStatus, string> = {
  PAID: "bg-forest-soft text-forest-ink",
  PARTIAL: "bg-sky-soft text-sky-ink",
  PENDING: "bg-sun-soft text-sun-ink",
  LATE: "bg-brick-soft text-brick-ink",
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export interface PaymentHistoryVM {
  id: string;
  amountCents: number;
  method: string;
  paidAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface PaymentRowVM {
  campaignId: string;
  userId: string;
  firstName: string;
  lastName: string;
  image: string | null;
  paidCents: number;
  expectedCents: number;
  status: PaymentStatus;
  tier: "FIRST" | "SECOND" | "SOCIAL";
  exempt: boolean;
  reminded: boolean;
  payments: PaymentHistoryVM[];
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
  // #121 — trop-perçu signalé par le serveur, en attente de confirmation.
  const [overpayment, setOverpayment] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const overpaidCents = Math.max(0, props.paidCents - props.expectedCents);

  function submit(confirm = false) {
    start(async () => {
      const res = await recordPayment(
        props.campaignId,
        props.userId,
        amount,
        method,
        date,
        confirm,
      );
      if (res.overpaymentCents) setOverpayment(res.overpaymentCents);
      else if (res.error) toast.error(res.error);
      else {
        toast.success("Paiement enregistré.");
        setOpen(false);
        setOverpayment(null);
        router.refresh();
      }
    });
  }

  function cancel(paymentId: string) {
    start(async () => {
      const res = await cancelPayment(paymentId, reason);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Paiement annulé.");
        setCancelling(null);
        setReason("");
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
        {/* Tarifs différenciés (2e enfant / cas social) masqués — décision
            groupe, cf. DECISIONS.md D-022. La prop `tier` reste dans
            l'interface, simplement non rendue. */}
        {props.exempt ? (
          <span className="shrink-0 rounded-full bg-stone px-2 py-0.5 text-xs font-bold text-earth">
            Échelonnement
          </span>
        ) : props.reminded && props.status !== "PAID" ? (
          <span className="shrink-0 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-bold text-sun-ink">
            Relancé
          </span>
        ) : null}
        {overpaidCents > 0 ? (
          <span className="shrink-0 rounded-full bg-brick-soft px-2 py-0.5 text-xs font-bold text-brick-ink">
            Trop-perçu {formatEuros(overpaidCents)}
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
        {props.canManage && props.status !== "PAID" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen((v) => !v);
              setAmount(String(Math.max(0, props.expectedCents - props.paidCents) / 100));
              setOverpayment(null);
            }}
          >
            <Plus className="size-4" />
            Paiement
          </Button>
        ) : null}
      </div>

      {props.canManage && (props.status !== "PAID" || props.payments.length > 0) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {props.status !== "PAID" ? (
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
          {props.payments.length > 0 ? (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="text-xs font-bold text-trail underline-offset-2 hover:text-earth hover:underline"
            >
              Historique ({props.payments.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {historyOpen && props.canManage ? (
        <ul className="space-y-1 rounded-xl bg-sand/60 p-2 text-xs">
          {props.payments.map((p) => (
            <li key={p.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span
                  className={cn(
                    "font-bold text-earth",
                    p.cancelledAt && "text-trail line-through",
                  )}
                >
                  {formatEuros(p.amountCents)}
                </span>
                <span className="text-trail">
                  {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method} ·{" "}
                  {DATE_FMT.format(p.paidAt)}
                </span>
                {p.cancelledAt ? (
                  <span className="text-trail">
                    Annulé : {p.cancelReason}
                  </span>
                ) : cancelling !== p.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelling(p.id);
                      setReason("");
                    }}
                    className="font-bold text-brick underline-offset-2 hover:underline"
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
              {cancelling === p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motif (ex. erreur de saisie)"
                    aria-label="Motif d'annulation"
                    className="h-8 w-56"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending || reason.trim().length === 0}
                    onClick={() => cancel(p.id)}
                  >
                    Confirmer l&apos;annulation
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCancelling(null)}
                  >
                    Retour
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {open && props.canManage ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sand/60 p-2">
          <div className="space-y-1">
            <label className="text-xs text-trail">Montant (€)</label>
            <Input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setOverpayment(null);
              }}
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
          {overpayment ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => submit(true)}
            >
              {pending ? "…" : `Confirmer le trop-perçu de ${formatEuros(overpayment)}`}
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={pending} onClick={() => submit()}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}
