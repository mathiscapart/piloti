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

const ICON: Record<string, LucideIcon> = {
  TENTE: Tent,
  MALLE: Box,
  CUISINE: UtensilsCrossed,
  BIVOUAC: Backpack,
  JEU: Gamepad2,
  AUTRE: Package,
};

export function CategoryChip({
  category,
  label,
  className,
}: {
  category: string;
  label?: string;
  className?: string;
}) {
  const Icon = ICON[category] ?? Package;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs font-bold text-earth",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {label ?? category}
    </span>
  );
}

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const Icon = ICON[category] ?? Package;
  return <Icon className={className} />;
}
