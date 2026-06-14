import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

// Affichage d'une note 0–5 en étoiles (demi-étoile arrondie à l'entier le plus
// proche pour le rendu). `value` null = pas encore noté.
export function Stars({
  value,
  className,
  size = "size-4",
}: {
  value: number | null;
  className?: string;
  size?: string;
}) {
  const filled = value === null ? 0 : Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            size,
            i <= filled ? "fill-sun text-sun" : "fill-stone/40 text-stone",
          )}
        />
      ))}
    </span>
  );
}
