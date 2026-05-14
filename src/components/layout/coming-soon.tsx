import { Hammer } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

export function ComingSoon({ section, phase }: { section: string; phase: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-6 space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          {phase}
        </p>
        <h1 className="text-3xl font-black text-earth">{section}</h1>
      </header>
      <EmptyState
        icon={Hammer}
        title="En construction"
        description="Cette section est planifiée dans une phase à venir. Pour l'instant, profite du dashboard."
      />
    </div>
  );
}
