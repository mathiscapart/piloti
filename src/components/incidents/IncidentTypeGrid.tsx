"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EquipmentCategory } from "@/lib/enums";
import { INCIDENT_TYPES_BY_CATEGORY } from "@/lib/incident-categories";

interface Props {
  category: EquipmentCategory | undefined;
  selected: Set<string>;
  onToggle: (value: string) => void;
}

export function IncidentTypeGrid({ category, selected, onToggle }: Props) {
  const options = category ? INCIDENT_TYPES_BY_CATEGORY[category] : [];

  if (options.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-stone bg-sand p-3 text-sm text-trail">
        Sélectionne d&apos;abord un article pour voir les types de problème
        adaptés.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {options.map((opt) => {
        const id = `type-${opt.value}`;
        const isChecked = selected.has(opt.value);
        return (
          <Label
            key={opt.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone bg-snow p-3 text-sm font-medium text-earth transition-colors hover:bg-sand has-[input:checked]:border-forest has-[input:checked]:bg-forest-soft"
          >
            <Checkbox
              id={id}
              checked={isChecked}
              onCheckedChange={() => onToggle(opt.value)}
            />
            {/* Hidden input pour le formData (le composant Checkbox shadcn ne
                soumet pas un input natif) */}
            {isChecked ? (
              <input type="hidden" name="type" value={opt.value} />
            ) : null}
            <span>{opt.label}</span>
          </Label>
        );
      })}
    </div>
  );
}
