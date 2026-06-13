"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";
import {
  createCashBox,
  transferCash,
} from "@/modules/finance/cashbox-actions";

const emptyState: ActionResult = { error: null };

export function CashBoxAdmin({
  boxes,
}: {
  boxes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createCashBox,
    emptyState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state !== emptyState) {
      toast.success("Caisse créée.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
        <h2 className="font-bold text-earth">Nouvelle caisse</h2>
        <form action={formAction} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Compte principal, Caisse de camp…"
              className="w-full"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Créer
          </Button>
        </form>
      </section>

      {boxes.length >= 2 ? <TransferForm boxes={boxes} /> : null}
    </div>
  );
}

function TransferForm({ boxes }: { boxes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(boxes[0]?.id ?? "");
  const [to, setTo] = useState(boxes[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  function submit() {
    start(async () => {
      const res = await transferCash(from, to, amount, label, date);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Transfert enregistré.");
        setAmount("");
        setLabel("");
        router.refresh();
      }
    });
  }

  const selectCls =
    "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-earth";

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Transfert entre caisses</h2>
      <div className="flex flex-wrap items-end gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls}>
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span className="pb-2 text-trail">→</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} className={selectCls}>
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Montant €"
          className="h-9 w-24"
        />
        <Input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          type="date"
          className="h-9 w-40 appearance-none"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Motif (optionnel)"
          className="h-9 w-40"
        />
        <Button type="button" size="sm" disabled={pending} onClick={submit}>
          Transférer
        </Button>
      </div>
    </section>
  );
}
