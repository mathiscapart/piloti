"use client";

import { Check, Pencil, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BracketVM } from "@/modules/finance/brackets";
import {
  archiveBracket,
  createBracket,
  updateBracket,
} from "@/modules/finance/bracket-actions";

function formatPercent(permille: number): string {
  // 600 → « 60 % », 1000 → « 100 % », 1250 → « 125 % ».
  return `${(permille / 10).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} %`;
}

export function BracketsAdmin({
  brackets,
  canManage,
}: {
  brackets: BracketVM[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {brackets.length > 0 ? (
        <ul className="space-y-2">
          {brackets.map((b) =>
            editId === b.id ? (
              <BracketEditRow
                key={b.id}
                bracket={b}
                onDone={() => {
                  setEditId(null);
                  router.refresh();
                }}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-2xl bg-snow p-4 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-earth">{b.name}</p>
                  <p className="flex items-center gap-1 text-xs text-trail">
                    <Users className="size-3" />
                    {b.memberCount} membre{b.memberCount > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-forest-soft px-2.5 py-1 text-sm font-black text-forest-ink tabular-nums">
                  {formatPercent(b.coefficientPermille)}
                </span>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditId(b.id)}
                      aria-label="Modifier"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ArchiveButton id={b.id} name={b.name} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : null}

      {canManage ? <CreateBracketForm /> : null}
    </div>
  );
}

function CreateBracketForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await createBracket(name, percent);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tranche créée.");
        setName("");
        setPercent("");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl bg-snow p-5 shadow-card">
      <h2 className="font-bold text-earth">Nouvelle tranche</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="name">Nom</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="T1, Tarif réduit…"
            className="w-full"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="percent">Coefficient (%)</Label>
          <Input
            id="percent"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            inputMode="decimal"
            placeholder="100"
            className="w-24"
          />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={submit}>
          Créer
        </Button>
      </div>
      <p className="text-xs text-trail">
        100 % = tarif plein. Sous 100 % la famille paie moins ; au-dessus, plus
        (pour équilibrer le budget).
      </p>
    </section>
  );
}

function BracketEditRow({
  bracket,
  onDone,
  onCancel,
}: {
  bracket: BracketVM;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(bracket.name);
  const [percent, setPercent] = useState(String(bracket.coefficientPermille / 10));
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await updateBracket(bracket.id, name, percent);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tranche modifiée.");
        onDone();
      }
    });
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-2xl bg-snow p-4 shadow-card">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label>Nom</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
      </div>
      <div className="space-y-1.5">
        <Label>Coefficient (%)</Label>
        <Input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          inputMode="decimal"
          className="w-24"
        />
      </div>
      <Button type="button" size="icon" disabled={pending} onClick={submit} aria-label="Enregistrer">
        <Check className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label="Annuler">
        <X className="size-4" />
      </Button>
    </li>
  );
}

function ArchiveButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit() {
    if (
      !window.confirm(
        `Archiver la tranche « ${name} » ? Les membres concernés repasseront au tarif plein.`,
      )
    )
      return;
    start(async () => {
      const res = await archiveBracket(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Tranche archivée.");
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={pending}
      onClick={submit}
      aria-label="Archiver"
    >
      <Trash2 className="size-4 text-brick" />
    </Button>
  );
}
