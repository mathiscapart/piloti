import { Hash } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ChannelTree } from "@/modules/communication/queries";

export function ChannelSidebar({
  tree,
  activeSlug,
}: {
  tree: ChannelTree;
  activeSlug?: string;
}) {
  return (
    <nav className="space-y-4" aria-label="Salons">
      {tree.map((cat) => (
        <div key={cat.id}>
          <p className="px-2 text-xs font-bold uppercase tracking-wider text-trail">
            {cat.name}
          </p>
          <ul className="mt-1 space-y-0.5">
            {cat.channels.map((c) => {
              const active = c.slug === activeSlug;
              return (
                <li key={c.id}>
                  <Link
                    href={`/communication/${c.slug}`}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
                      active
                        ? "bg-forest text-snow"
                        : "text-earth hover:bg-sand",
                      c.unread && !active && "font-bold",
                    )}
                  >
                    <Hash className="size-4 shrink-0 opacity-70" />
                    <span className="truncate">{c.name}</span>
                    {c.unread && !active ? (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-fire" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
