"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import type { BadgeVM } from "@/modules/pedagogy/referential";
import {
  archiveBadge,
  createBadge,
  updateBadge,
} from "@/modules/pedagogy/referential-actions";

export function BadgesManager({ badges }: { badges: BadgeVM[] }) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-earth">Catalogue de badges</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" />
          Badge
        </Button>
      </div>

      {adding ? (
        <BadgeForm
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {badges.length === 0 && !adding ? (
        <p className="text-sm text-trail">Aucun badge au catalogue.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {badges.map((b) =>
            editId === b.id ? (
              <li key={b.id} className="sm:col-span-2">
                <BadgeForm
                  badge={b}
                  onDone={() => {
                    setEditId(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditId(null)}
                />
              </li>
            ) : (
              <li
                key={b.id}
                className="flex items-start gap-3 rounded-2xl bg-snow p-3 shadow-card"
              >
                <span className="text-2xl">{b.icon ?? "🏅"}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-earth">{b.name}</p>
                  {b.criteria ? (
                    <p className="text-xs text-trail">{b.criteria}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-trail">
                    {b.units.length === 0
                      ? "Toutes branches"
                      : b.units.map((u) => UNIT_LABEL[u as Unit] ?? u).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setEditId(b.id)}
                    className="p-1 text-trail hover:text-earth"
                    aria-label="Modifier"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <ArchiveBadge id={b.id} name={b.name} />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function BadgeForm({
  badge,
  onDone,
  onCancel,
}: {
  badge?: BadgeVM;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(badge?.name ?? "");
  const [icon, setIcon] = useState(badge?.icon ?? "");
  const [criteria, setCriteria] = useState(badge?.criteria ?? "");
  const [units, setUnits] = useState<Set<string>>(new Set(badge?.units ?? []));
  const [pending, start] = useTransition();

  function toggle(u: string, on: boolean) {
    setUnits((prev) => {
      const next = new Set(prev);
      if (on) next.add(u);
      else next.delete(u);
      return next;
    });
  }

  function submit() {
    start(async () => {
      const res = badge
        ? await updateBadge(badge.id, name, icon, criteria, [...units])
        : await createBadge(name, icon, criteria, [...units]);
      if (res.error) toast.error(res.error);
      else {
        toast.success(badge ? "Badge modifié." : "Badge créé.");
        onDone();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-snow p-4 shadow-card">
      <div className="flex gap-2">
        <Input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🏅"
          className="h-9 w-14 text-center"
          maxLength={2}
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du badge"
          className="h-9 flex-1"
        />
      </div>
      <Input
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder="Critères d'obtention (facultatif)"
        className="h-9"
      />
      <div>
        <p className="mb-1 text-xs text-trail">
          Branches concernées (aucune cochée = toutes) :
        </p>
        <div className="flex flex-wrap gap-1.5">
          {UNITS.map((u) => {
            const on = units.has(u);
            return (
              <label
                key={u}
                className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold ${
                  on ? "bg-forest text-snow" : "bg-sand text-earth"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(u, e.target.checked)}
                  className="sr-only"
                />
                {UNIT_LABEL[u as Unit]}
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={submit}>
          {badge ? "Enregistrer" : "Créer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ArchiveBadge({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function submit() {
    if (!window.confirm(`Archiver le badge « ${name} » ?`)) return;
    start(async () => {
      const res = await archiveBadge(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Badge archivé.");
        router.refresh();
      }
    });
  }
  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className="p-1 text-brick hover:opacity-80"
      aria-label="Archiver"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
