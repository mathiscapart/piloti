import {
  type LucideIcon,
  Package,
  Tent,
  UtensilsCrossed,
  Backpack,
  Gamepad2,
  Box,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { EquipmentCategory } from "@/lib/enums";
import { CATEGORY_LABEL } from "@/modules/inventory/types";

const ICON: Record<EquipmentCategory, LucideIcon> = {
  TENTE: Tent,
  MALLE: Box,
  CUISINE: UtensilsCrossed,
  BIVOUAC: Backpack,
  JEU: Gamepad2,
  AUTRE: Package,
};

export function CategoryChip({
  category,
  className,
}: {
  category: EquipmentCategory | string;
  className?: string;
}) {
  const Icon = ICON[category as EquipmentCategory] ?? Package;
  const label = CATEGORY_LABEL[category as EquipmentCategory] ?? category;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs font-bold text-earth",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export function CategoryIcon({
  category,
  className,
}: {
  category: EquipmentCategory | string;
  className?: string;
}) {
  const Icon = ICON[category as EquipmentCategory] ?? Package;
  return <Icon className={className} />;
}
