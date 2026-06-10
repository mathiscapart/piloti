import { Phone, Search, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  ROLE_LABEL,
  ROLES,
  UNIT_LABEL,
  UNITS,
  type Role,
  type Unit,
} from "@/lib/enums";
import { getCurrentUser } from "@/lib/get-current-user";
import { can, effectiveRoles } from "@/lib/permissions";
import { listMembers } from "@/modules/inventory/queries";

interface PageProps {
  searchParams: Promise<{ q?: string; unit?: string; role?: string }>;
}

export default async function MembersPage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser();
  // US-14 — roster réservé aux profils member.view (chefs, RG, secrétaire, trésorier).
  if (!can(currentUser, "member.view")) redirect("/dashboard");

  const { q, unit, role } = await searchParams;
  const search = (q ?? "").trim();
  const unitFilter = unit && (UNITS as readonly string[]).includes(unit) ? unit : "";
  const roleFilter = role && (ROLES as readonly string[]).includes(role) ? role : "";

  const members = await listMembers({
    search,
    unit: unitFilter || undefined,
    role: roleFilter || undefined,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-trail">
          <Users className="size-3.5" />
          Annuaire du groupe
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Membres ({members.length})
        </h1>
        <p className="text-trail">
          Tous les membres actifs du groupe. Cliquez sur une fiche pour le
          contact et le matériel détenu.
        </p>
      </header>

      {/* Filtres : recherche + unité + rôle (GET, entièrement côté serveur). */}
      <form
        method="GET"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Chercher par nom…"
            className="pl-9"
          />
        </div>
        <select
          name="unit"
          defaultValue={unitFilter}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-earth"
        >
          <option value="">Toutes les branches</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u as Unit]}
            </option>
          ))}
        </select>
        <select
          name="role"
          defaultValue={roleFilter}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-earth"
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r as Role]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-forest px-5 text-sm font-bold text-snow transition-colors hover:bg-forest/90"
        >
          Filtrer
        </button>
      </form>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun membre"
          description="Aucun membre ne correspond à ces critères."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => {
            const roleLabels = effectiveRoles(m)
              .map((r) => ROLE_LABEL[r as Role] ?? r)
              .join(", ");
            return (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-2xl bg-snow p-4 shadow-card"
              >
                <Link href={`/membres/${m.id}`} className="shrink-0">
                  <UserAvatar
                    image={m.image}
                    firstName={m.firstName}
                    lastName={m.lastName}
                    className="size-12"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/membres/${m.id}`}
                    className="block truncate font-bold text-earth hover:text-forest"
                  >
                    {m.firstName} {m.lastName}
                  </Link>
                  <p className="truncate text-xs text-trail">
                    {roleLabels || "—"}
                    {m.unit ? ` · ${UNIT_LABEL[m.unit as Unit] ?? m.unit}` : ""}
                  </p>
                </div>
                {m.phone ? (
                  <a
                    href={`tel:${m.phone.replace(/\s/g, "")}`}
                    aria-label={`Appeler ${m.firstName}`}
                    className="shrink-0 rounded-full p-2 text-trail transition-colors hover:bg-sand hover:text-earth"
                  >
                    <Phone className="size-4" />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
