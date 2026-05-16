import { cn } from "@/lib/utils";
import type { EquipmentCondition } from "@/lib/enums";
import { CONDITION_LABEL } from "@/modules/inventory/types";

const TONE: Record<EquipmentCondition, string> = {
  NEUF: "bg-forest-soft text-forest-ink",
  BON: "bg-forest-soft text-forest-ink",
  USE: "bg-sun-soft text-sun-ink",
  A_REPARER: "bg-fire-soft text-fire-ink",
  HORS_SERVICE: "bg-brick-soft text-brick-ink",
};

export function ConditionBadge({
  condition,
  className,
}: {
  condition: EquipmentCondition | string;
  className?: string;
}) {
  const tone = TONE[condition as EquipmentCondition] ?? "bg-stone text-earth";
  const label = CONDITION_LABEL[condition as EquipmentCondition] ?? condition;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
