"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { BOTTOM_NAV } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone/60 bg-snow pb-[env(safe-area-inset-bottom)] md:hidden">
      {/* Colonnes = nombre d'items (style inline car Tailwind ne génère pas les
          classes dynamiques). Tient quel que soit le nombre d'entrées. */}
      <ul
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${BOTTOM_NAV.length}, minmax(0, 1fr))`,
        }}
      >
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-0.5 py-2.5 font-bold transition-colors",
                  active ? "text-forest" : "text-trail",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="w-full truncate text-center text-[10px] leading-tight">
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
