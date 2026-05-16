import { Skeleton } from "@/components/ui/skeleton";

export default function StockDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-32 pt-6 md:px-8 md:pt-10 md:pb-10">
      <Skeleton className="h-5 w-32" />
      <div className="overflow-hidden rounded-2xl bg-snow shadow-card">
        <Skeleton className="aspect-video rounded-none" />
        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
