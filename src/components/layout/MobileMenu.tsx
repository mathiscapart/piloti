"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";

import { NAV_SECTIONS } from "./nav-items";

export function MobileMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Sections filtrées par rôle (US-29) ; on masque les sections vides.
  const sections = NAV_SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter((i) => !i.requires || can(user, i.requires)),
  })).filter((s) => s.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex w-full flex-col items-center gap-1 px-0.5 py-2.5 font-bold text-trail"
        >
          <Menu className="size-5 shrink-0" />
          <span className="w-full truncate text-center text-[10px] leading-tight">
            Menu
          </span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 pb-[env(safe-area-inset-bottom)] pt-2">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-1 text-xs font-bold uppercase tracking-wider text-trail">
                {section.title}
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = [item.href, ...(item.aliases ?? [])].some(
                    (h) => pathname === h || pathname.startsWith(`${h}/`),
                  );
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 text-sm font-bold transition-colors",
                          active
                            ? "border-forest bg-forest-soft text-forest-ink"
                            : "border-stone/60 bg-snow text-earth hover:bg-sand",
                        )}
                      >
                        <Icon className="size-5 shrink-0 text-trail" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
