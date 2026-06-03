"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";

import { MobileMenu } from "./MobileMenu";
import { PRIMARY_NAV } from "./nav-items";

export function BottomNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Raccourcis visibles selon le rôle (US-29) + 1 colonne pour « Menu ».
  const items = PRIMARY_NAV.filter((i) => !i.requires || can(user, i.requires));
  const columns = items.length + 1;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone/60 bg-snow pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
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
        <li className="min-w-0">
          <MobileMenu user={user} />
        </li>
      </ul>
    </nav>
  );
}
