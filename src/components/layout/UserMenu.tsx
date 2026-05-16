"use client";

import { FolderOpen, History, LogOut, ShieldCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import type { CurrentUser } from "@/lib/get-current-user";

const ADMIN_LINKS = [
  { href: "/admin/inscriptions", label: "Inscriptions", icon: UserPlus },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/categories", label: "Catégories", icon: FolderOpen },
  { href: "/admin/audit", label: "Journal d'audit", icon: History },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  CHEF: "Chef",
  PARENT: "Parent",
  SCOUT: "Scout",
};

export function UserMenu({ user, compact }: { user: CurrentUser; compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={compact ? "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}>
        <Avatar className="size-9">
          <AvatarFallback className="bg-forest text-snow font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!compact && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-earth">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-trail">
            {ROLE_LABEL[user.role] ?? user.role}
            {user.unit ? ` · ${user.unit}` : ""}
          </p>
        </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>

        {compact && user.role === "ADMIN" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
              <ShieldCheck className="size-3.5" />
              Administration
            </DropdownMenuLabel>
            {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} className="flex items-center gap-2">
                  <Icon className="size-4 text-trail" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={pending}
          className="text-brick focus:bg-brick-soft focus:text-brick-ink"
        >
          <LogOut className="mr-2 size-4" />
          {pending ? "Déconnexion…" : "Se déconnecter"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
