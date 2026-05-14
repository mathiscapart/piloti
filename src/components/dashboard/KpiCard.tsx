import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "forest" | "sky" | "fire" | "sun";
}

const TONE_STYLES: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  forest: "bg-forest-soft text-forest-ink",
  sky: "bg-sky-soft text-sky-ink",
  fire: "bg-fire-soft text-fire-ink",
  sun: "bg-sun-soft text-sun-ink",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "forest",
}: KpiCardProps) {
  return (
    <div className="rounded-2xl bg-snow p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wider text-trail">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black text-earth">{value}</p>
        </div>
        <div className={cn("rounded-xl p-3", TONE_STYLES[tone])}>
          <Icon className="size-6" />
        </div>
      </div>
    </div>
  );
}
