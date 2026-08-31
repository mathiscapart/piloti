import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import type { ActionItem } from "@/modules/dashboard/queries";

// « Ce qui attend une action de moi » — la seule question qu'un tableau de bord
// doit trancher. Les éléments arrivent déjà filtrés par permission : ce
// composant n'affiche que ce qu'on lui donne, il ne décide de rien.

const TONS: Record<ActionItem["tone"], string> = {
  urgent: "border-brick/40 bg-brick-soft/40 text-brick-ink",
  attention: "border-fire/40 bg-fire-soft/40 text-fire-ink",
  info: "border-sky/30 bg-sky-soft/40 text-sky-ink",
};

export function ActionCenter({ items }: { items: ActionItem[] }) {
  // Rien à faire est une information, pas un vide. Sans ce cas, l'écran d'un
  // groupe à jour ressemblerait à un écran cassé.
  if (items.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-forest-soft/50 p-5">
        <CheckCircle2 className="size-5 shrink-0 text-forest" />
        <p className="text-sm font-medium text-earth">
          Rien n&apos;attend d&apos;action de ta part. Tout est à jour.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-black uppercase tracking-widest text-trail">
        Ce qui attend une action de ta part
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-card transition-transform hover:-translate-y-0.5 ${TONS[item.tone]}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-black leading-none">{item.count}</span>
                <span className="text-sm font-medium text-earth">
                  {item.label.replace(/^\d+\s/, "")}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
