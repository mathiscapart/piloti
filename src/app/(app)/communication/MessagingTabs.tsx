import Link from "next/link";

import { cn } from "@/lib/utils";

// Bascule entre les deux espaces de la messagerie : salons de groupe et messages
// privés 1-to-1. Composant simple (Link + cn) utilisable côté serveur et client.
export function MessagingTabs({ active }: { active: "salons" | "prives" }) {
  const tabs = [
    { key: "salons", label: "Salons", href: "/communication" },
    { key: "prives", label: "Privé", href: "/messages" },
  ] as const;

  return (
    <nav aria-label="Messagerie" className="inline-flex gap-1 rounded-full bg-sand p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
            active === t.key
              ? "bg-forest text-snow shadow-card"
              : "text-trail hover:text-earth",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
