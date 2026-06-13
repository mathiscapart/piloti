"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { setUserBracket } from "@/modules/finance/bracket-actions";

export function BracketSelect({
  userId,
  currentBracketId,
  brackets,
}: {
  userId: string;
  currentBracketId: string | null;
  brackets: { id: string; name: string; coefficientPermille: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onChange(value: string) {
    start(async () => {
      const res = await setUserBracket(userId, value);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tranche mise à jour.");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-2 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Tranche de quotient familial</h2>
      <p className="text-xs text-trail">
        Détermine le tarif appliqué à ce jeune sur les événements et les
        cotisations.
      </p>
      <select
        value={currentBracketId ?? ""}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-earth disabled:opacity-50"
      >
        <option value="">Tarif plein (aucune tranche)</option>
        {brackets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({(b.coefficientPermille / 10).toLocaleString("fr-FR")} %)
          </option>
        ))}
      </select>
    </section>
  );
}
