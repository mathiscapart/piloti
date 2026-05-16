import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

export function IncidentBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-brick-soft px-2.5 py-0.5 text-xs font-bold text-brick-ink",
        className,
      )}
    >
      <AlertTriangle className="size-3" />
      {count} {count === 1 ? "incident" : "incidents"}
    </span>
  );
}
