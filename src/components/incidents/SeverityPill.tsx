"use client";

import { INCIDENT_SEVERITIES } from "@/lib/enums";
import { cn } from "@/lib/utils";
import {
  SEVERITY_DESCRIPTION,
  SEVERITY_LABEL,
} from "@/modules/inventory/types";

const TONE: Record<(typeof INCIDENT_SEVERITIES)[number], { active: string; inactive: string }> = {
  BLOQUANT: {
    active: "bg-brick text-snow border-brick",
    inactive: "border-stone bg-snow text-earth hover:bg-sand",
  },
  GENANT: {
    active: "bg-fire text-snow border-fire",
    inactive: "border-stone bg-snow text-earth hover:bg-sand",
  },
  MINEUR: {
    active: "bg-sun text-earth border-sun",
    inactive: "border-stone bg-snow text-earth hover:bg-sand",
  },
};

export function SeverityPills({
  value,
  onChange,
}: {
  value: (typeof INCIDENT_SEVERITIES)[number];
  onChange: (v: (typeof INCIDENT_SEVERITIES)[number]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {INCIDENT_SEVERITIES.map((s) => {
        const active = value === s;
        return (
          <label
            key={s}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition-colors",
              active ? TONE[s].active : TONE[s].inactive,
            )}
          >
            <input
              type="radio"
              name="severity"
              value={s}
              checked={active}
              onChange={() => onChange(s)}
              className="sr-only"
            />
            <span>{SEVERITY_LABEL[s]}</span>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wider",
                active ? "opacity-90" : "text-trail",
              )}
            >
              {SEVERITY_DESCRIPTION[s]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
