import { cn } from "@/lib/utils";

const CFG: Record<string, { label: string; cls: string }> = {
  ACTIF: { label: "En cours", cls: "bg-forest-soft text-forest-ink" },
  RETARD: { label: "En retard", cls: "bg-brick-soft text-brick-ink" },
  RETOURNE: { label: "Rendu", cls: "bg-stone text-earth" },
  SECHAGE: { label: "En séchage", cls: "bg-sky-soft text-sky-ink" },
};

export function LoanStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const c = CFG[status] ?? { label: status, cls: "bg-stone text-earth" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        c.cls,
        className,
      )}
    >
      {c.label}
    </span>
  );
}
