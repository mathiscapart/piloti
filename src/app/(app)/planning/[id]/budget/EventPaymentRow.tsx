"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import {
  correctEventPayment,
  recordEventPayment,
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
  bracketName: string | null;
  provisional: boolean;
  canManage: boolean;
}

export function EventPaymentRow(props: PaymentRowVM) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(props.dueCents / 100));
  // #121 — trop-perçu signalé par le serveur, en attente de confirmation.
  const [overpayment, setOverpayment] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [corrected, setCorrected] = useState(String(props.paidCents / 100));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const paid = props.dueCents === 0 && props.priceCents > 0;
  const partial = props.paidCents > 0 && props.dueCents > 0;
  const overpaidCents = Math.max(0, props.paidCents - props.priceCents);

  function submit(confirm = false) {
    start(async () => {
      const res = await recordEventPayment(props.eventId, props.userId, amount, confirm);
      if (res.overpaymentCents) setOverpayment(res.overpaymentCents);
      else if (res.error) toast.error(res.error);
      else {
        toast.success("Encaissement enregistré.");
        setOpen(false);
        setOverpayment(null);
        router.refresh();
      }
    });
  }

  function correct() {
    start(async () => {
      const res = await correctEventPayment(
        props.eventId,
        props.userId,
        corrected,
        reason,
      );
      if (res.error) toast.error(res.error);
      else {
        toast.success("Encaissement corrigé.");
        setCorrecting(false);
        setReason("");
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
        {/* QF masqué — décision groupe, cf. DECISIONS.md : badge de tranche
            de quotient familial retiré du rendu (prop conservée). */}
        {props.provisional ? (
          <span className="shrink-0 rounded-full bg-stone px-2 py-0.5 text-xs font-bold text-earth">
            Provisoire
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
            disabled={pending}
            onClick={() => {
              setOpen((v) => !v);
              setAmount(String(props.dueCents / 100));
              setOverpayment(null);
            }}
          >
            <Plus className="size-4" />
            Encaisser
          </Button>
        ) : null}
        {props.canManage && props.paidCents > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Corriger l'encaissé"
            title="Corriger l'encaissé"
            onClick={() => {
              setCorrecting((v) => !v);
              setCorrected(String(props.paidCents / 100));
            }}
          >
            <Pencil className="size-4" />
          </Button>
        ) : null}
      </div>

      {correcting && props.canManage ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-sand/60 p-2">
          <div className="space-y-1">
            <label className="text-xs text-trail">Total encaissé (€)</label>
            <Input
              value={corrected}
              onChange={(e) => setCorrected(e.target.value)}
              inputMode="decimal"
              className="h-9 w-24"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-trail">Motif</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex. erreur de saisie"
              className="h-9 w-52"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || reason.trim().length === 0}
            onClick={correct}
          >
            {pending ? "…" : "Corriger"}
          </Button>
        </div>
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
