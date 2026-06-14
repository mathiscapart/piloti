"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  CAMP_EQUIPMENT,
  CAMP_EQUIPMENT_LABEL,
  type CampEquipment,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

export function PlaceFilters({ regions }: { regions: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const region = params.get("region") ?? "";
  const minCapacity = params.get("minCapacity") ?? "";
  const sort = params.get("sort") ?? "name";
  const equip = new Set((params.get("equip") ?? "").split(",").filter(Boolean));

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  function toggleEquip(key: string) {
    const next = new Set(equip);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update({ equip: [...next].join(",") || null });
  }

  const selectCls =
    "h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-earth";

  return (
    <div className="space-y-3 rounded-2xl bg-snow p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={region}
          onChange={(e) => update({ region: e.target.value || null })}
          className={selectCls}
          aria-label="Région"
        >
          <option value="">Toutes régions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={minCapacity}
          onChange={(e) => update({ minCapacity: e.target.value || null })}
          className={selectCls}
          aria-label="Capacité minimum"
        >
          <option value="">Toute capacité</option>
          <option value="20">≥ 20 pers.</option>
          <option value="40">≥ 40 pers.</option>
          <option value="60">≥ 60 pers.</option>
          <option value="100">≥ 100 pers.</option>
        </select>

        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className={selectCls}
          aria-label="Tri"
        >
          <option value="name">Nom (A→Z)</option>
          <option value="rating">Mieux notés</option>
          <option value="capacity">Plus grande capacité</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CAMP_EQUIPMENT.map((key) => {
          const on = equip.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleEquip(key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                on
                  ? "bg-forest text-snow"
                  : "bg-sand text-earth hover:bg-stone/40",
              )}
            >
              {CAMP_EQUIPMENT_LABEL[key as CampEquipment]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
