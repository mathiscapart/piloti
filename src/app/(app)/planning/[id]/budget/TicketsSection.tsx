"use client";

import { Camera, Plus, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { addEventTicket } from "@/modules/finance/budget-actions";
import { formatEuros } from "@/modules/finance/format";

export interface TicketVM {
  id: string;
  amountCents: number;
  category: string;
  date: Date;
  receiptUrl: string | null;
  status: string;
  note: string | null;
  declarant: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Validé",
  REIMBURSED: "Remboursé",
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TicketsSection({
  eventId,
  tickets,
  totalCents,
  canAdd,
}: {
  eventId: string;
  tickets: TicketVM[];
  totalCents: number;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    start(async () => {
      const res = await addEventTicket(eventId, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Ticket enregistré.");
      formRef.current?.reset();
      setPhotoName(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-1.5 text-lg font-bold text-earth">
          <Receipt className="size-4" />
          Tickets de caisse
        </h2>
        <span className="text-sm font-bold text-earth">
          {formatEuros(totalCents)}
        </span>
      </div>

      {canAdd ? (
        open ? (
          <form
            ref={formRef}
            action={submit}
            className="space-y-3 rounded-2xl bg-snow p-4 shadow-card"
          >
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone/60 bg-sand/40 py-4 text-sm font-bold text-trail">
              <Camera className="size-5" />
              {photoName ? "Photo ajoutée ✓" : "Photographier le ticket"}
              <input
                type="file"
                name="receipt"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="amount">Montant (€)</Label>
                <Input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  className="h-10"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="category">Catégorie</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue="NOURRITURE"
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-earth"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABEL[c as ExpenseCategory]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Input name="note" placeholder="Libellé (facultatif)" className="h-10" />

            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">
                {pending ? "Enregistrement…" : "Enregistrer le ticket"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
            <p className="text-xs text-trail">
              Le ticket remonte automatiquement à la trésorerie et s&apos;ajoute au
              réel du budget.
            </p>
          </form>
        ) : (
          <Button type="button" onClick={() => setOpen(true)} className="w-full">
            <Plus className="size-4" />
            Ajouter un ticket de caisse
          </Button>
        )
      ) : null}

      {tickets.length === 0 ? (
        <p className="text-sm text-trail">Aucun ticket enregistré.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-2xl bg-snow p-3 shadow-card"
            >
              {t.receiptUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={t.receiptUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={t.receiptUrl}
                    alt="Ticket"
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                </a>
              ) : (
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-sand">
                  <Receipt className="size-5 text-stone" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-earth">
                  {formatEuros(t.amountCents)}
                  <span className="ml-2 text-xs font-medium text-trail">
                    {EXPENSE_CATEGORY_LABEL[t.category as ExpenseCategory] ?? t.category}
                  </span>
                </p>
                <p className="truncate text-xs text-trail">
                  {t.note ? `${t.note} · ` : ""}
                  {t.declarant} · {DATE_FMT.format(t.date)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                  t.status === "REIMBURSED"
                    ? "bg-forest-soft text-forest-ink"
                    : t.status === "APPROVED"
                      ? "bg-sky-soft text-sky-ink"
                      : "bg-sun-soft text-sun-ink",
                )}
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
