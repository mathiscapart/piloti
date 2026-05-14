import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone bg-snow/50 px-6 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-10 text-trail" />
      <div className="space-y-1">
        <p className="font-bold text-earth">{title}</p>
        {description ? <p className="text-sm text-trail">{description}</p> : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
