"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/lib/get-current-user";
import type { NotificationSnapshot } from "@/modules/notifications/queries";

import { NAV_SECTIONS, type NavItem } from "./nav-items";
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

export function Sidebar({
  user,
  notifications,
}: {
  user: CurrentUser;
  notifications: NotificationSnapshot;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-stone/60 bg-snow md:flex">
      <div className="flex h-16 items-center justify-between border-b border-stone/60 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/piloti-lockup-clean.svg"
          alt="Piloti"
          width={120}
          height={32}
        />
        <NotificationBell initial={notifications} align="left" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <NavLink
          item={{ href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard }}
          active={isActive("/dashboard")}
        />

        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(
            (i) => !i.requires || can(user, i.requires),
          );
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              <p className="mt-6 px-3 pb-2 text-xs font-bold uppercase tracking-wider text-trail">
                {section.title}
              </p>
              {items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-stone/60 p-4">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
