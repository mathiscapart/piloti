import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-4 w-72" />
      </header>
      <Skeleton className="h-24 rounded-2xl" />
      <ol className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <div className="space-y-2 rounded-2xl bg-snow p-4 shadow-card">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
