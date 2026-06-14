"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UNITS, UNIT_LABEL, type Unit } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { awardBadge } from "@/modules/pedagogy/progression-actions";

interface Jeune {
  id: string;
  firstName: string;
  lastName: string;
  image: string | null;
  unit: string | null;
}

export function AwardForm({
  badges,
  jeunes,
}: {
  badges: { id: string; name: string; icon: string | null }[];
  jeunes: Jeune[];
}) {
  const router = useRouter();
  const [badgeId, setBadgeId] = useState("");
  const [unit, setUnit] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const filtered = useMemo(
    () => (unit ? jeunes.filter((j) => j.unit === unit) : jeunes),
    [jeunes, unit],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!badgeId) {
      toast.error("Choisis un badge.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Sélectionne au moins un jeune.");
      return;
    }
    start(async () => {
      const res = await awardBadge(badgeId, [...selected]);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Badge attribué à ${selected.size} jeune(s).`);
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  const selectCls =
    "h-10 rounded-md border border-input bg-background px-2 text-sm text-earth";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={badgeId}
          onChange={(e) => setBadgeId(e.target.value)}
          className={cn(selectCls, "min-w-0 flex-1")}
        >
          <option value="">Choisir un badge…</option>
          {badges.map((b) => (
            <option key={b.id} value={b.id}>
              {b.icon ?? "🏅"} {b.name}
            </option>
          ))}
        </select>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={selectCls}>
          <option value="">Toutes branches</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u as Unit]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-trail">Aucun jeune pour ce filtre.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((j) => {
            const on = selected.has(j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => toggle(j.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-2xl p-2 text-left shadow-card transition-colors",
                    on ? "bg-forest-soft ring-2 ring-forest" : "bg-snow hover:bg-sand/40",
                  )}
                >
                  <UserAvatar
                    image={j.image}
                    firstName={j.firstName}
                    lastName={j.lastName}
                    className="size-8"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-earth">
                    {j.firstName} {j.lastName}
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                      on ? "border-forest bg-forest text-snow" : "border-stone",
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-4 flex items-center justify-between rounded-2xl bg-snow p-3 shadow-card">
        <span className="text-sm font-bold text-earth">
          {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
        </span>
        <Button type="button" disabled={pending} onClick={submit}>
          Attribuer le badge
        </Button>
      </div>
    </div>
  );
}
