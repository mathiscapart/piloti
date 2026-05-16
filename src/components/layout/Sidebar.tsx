"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/lib/get-current-user";

import { ADMIN_NAV, MAIN_NAV, type NavItem } from "./nav-items";
import { UserMenu } from "./UserMenu";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
        active
          ? "bg-forest-soft text-forest-ink"
          : "text-trail hover:bg-sand hover:text-earth",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone/60 bg-snow md:flex">
      <div className="flex h-16 items-center border-b border-stone/60 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/piloti-lockup-clean.svg"
          alt="Piloti"
          width={120}
          height={32}
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {user.role === "ADMIN" && (
          <>
            <p className="mt-6 px-3 pb-2 text-xs font-bold uppercase tracking-wider text-trail">
              Administration
            </p>
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-stone/60 p-4">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
