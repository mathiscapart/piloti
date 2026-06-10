"use client";

import { FolderOpen, Gift, History, LogOut, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { UserAvatar } from "@/components/ui/user-avatar";
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
import { can, type Action } from "@/lib/permissions";

// US-32 — chaque raccourci porte sa permission propre : la zone admin est
// granulaire (SECRÉTAIRE, RESPONSABLE_MATERIEL…), plus seulement l'ADMIN.
const ADMIN_LINKS: { href: string; label: string; icon: typeof UserPlus; requires: Action }[] = [
  { href: "/admin/dons", label: "Dons", icon: Gift, requires: "donation.view" },
  { href: "/admin/inscriptions", label: "Inscriptions", icon: UserPlus, requires: "user.approve" },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, requires: "user.manage" },
  { href: "/admin/categories", label: "Catégories", icon: FolderOpen, requires: "category.manage" },
  { href: "/admin/audit", label: "Journal d'audit", icon: History, requires: "audit.view" },
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

  const adminLinks = ADMIN_LINKS.filter((l) => can(user, l.requires));

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
        <UserAvatar
          image={user.image}
          firstName={user.firstName}
          lastName={user.lastName}
          className="size-9"
        />
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

        <DropdownMenuItem asChild>
          <Link href="/compte" className="flex items-center gap-2">
            <UserCog className="size-4 text-trail" />
            Mon compte
          </Link>
        </DropdownMenuItem>

        {compact && adminLinks.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
              <ShieldCheck className="size-3.5" />
              Administration
            </DropdownMenuLabel>
            {adminLinks.map(({ href, label, icon: Icon }) => (
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
