"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMovement } from "@/modules/finance/cashbox-actions";

export function AddMovementForm({ cashBoxId }: { cashBoxId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function submit() {
    start(async () => {
      const res = await addMovement(cashBoxId, kind, amount, label, date);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Mouvement enregistré.");
        setAmount("");
        setLabel("");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Nouveau mouvement</h2>
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "DEPOSIT" | "WITHDRAWAL")}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-earth"
        >
          <option value="DEPOSIT">Entrée</option>
          <option value="WITHDRAWAL">Sortie</option>
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
          placeholder="Libellé"
          className="h-9 w-44"
        />
        <Button type="button" size="sm" disabled={pending} onClick={submit}>
          Enregistrer
        </Button>
      </div>
    </section>
  );
}
