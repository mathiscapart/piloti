import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Lock,
  Pencil,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ROLE_LABEL, ROLES, UNIT_LABEL, UNITS, type Role } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import { cn } from "@/lib/utils";
import { listManageableUsers } from "@/modules/admin/queries";

import { UserFiltersForm } from "./user-filters-form";

// US-29 — parse le JSON des rôles additionnels de façon défensive.
function parseRoles(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

const PRIVILEGED_ROLES = new Set<string>(["ADMIN", "RESPONSABLE_GROUPE"]);

const SORT_LABEL: Record<string, string> = {
  status: "Statut, puis A→Z",
  name: "Nom A→Z",
  name_desc: "Nom Z→A",
  unit: "Unité",
  recent: "Inscription la plus récente",
  oldest: "Inscription la plus ancienne",
};

// En-tête de colonne cliquable. `direction` = null quand la colonne n'est pas
// celle qui trie actuellement.
function SortLink({
  href,
  label,
  direction,
}: {
  href: string;
  label: string;
  direction: "asc" | "desc" | null;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-earth"
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
    >
      {label}
      {direction === "asc" ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : direction === "desc" ? (
        <ArrowDown className="size-3" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" aria-hidden />
      )}
    </Link>
  );
}

function roleLabels(roles: string[]): string {
  if (roles.length === 0) return "Aucun rôle";
  return roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ");
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    role?: string;
    unit?: string;
    status?: string;
    sort?: string;
  }>;
}

export default async function AdminUtilisateursPage({ searchParams }: PageProps) {
  // US-32 — gestion des comptes & rôles : ADMIN + SECRÉTAIRE.
  const currentUser = await requireCan("user.manage");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const sort = params.sort ?? "status";
  const users = await listManageableUsers({
    search: q,
    role: params.role || undefined,
    unit: params.unit || undefined,
    status: params.status || undefined,
    sort,
  });
  const isFiltered = Boolean(q || params.role || params.unit || params.status);

  // Lien conservant les filtres et ne changeant que le tri (en-têtes cliquables).
  const sortHref = (next: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (params.role) sp.set("role", params.role);
    if (params.unit) sp.set("unit", params.unit);
    if (params.status) sp.set("status", params.status);
    if (next !== "status") sp.set("sort", next);
    const qs = sp.toString();
    return qs ? `/admin/utilisateurs?${qs}` : "/admin/utilisateurs";
  };

  // Les champs du formulaire ne sont pas contrôlés : en navigation douce React
  // réutilise les mêmes noeuds et ne les resynchronise pas sur `defaultValue`.
  // Cette clé les remonte quand l'URL change — sans quoi « Reset » viderait
  // l'URL en laissant les filtres affichés à l'écran.
  const filtersKey = `${q}|${params.role ?? ""}|${params.unit ?? ""}|${params.status ?? ""}|${sort}`;

  // Colonne triable : un clic trie en ascendant, un second bascule en descendant.
  const sortColumn = (key: "name" | "unit" | "status") => {
    const desc = `${key}_desc`;
    const direction: "asc" | "desc" | null =
      sort === key ? "asc" : sort === desc ? "desc" : null;
    return { href: sortHref(direction === "asc" ? desc : key), direction };
  };
  // Les opérations destructrices (suspendre / réactiver / supprimer / mot de
  // passe) restent réservées à l'ADMIN ; la SECRÉTAIRE n'attribue que les rôles
  // (sauf ADMIN/RG, cf. canAssignRole).
  const isAdmin = can(currentUser, "admin.access");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-trail">
            Administration
          </p>
          <h1 className="text-3xl font-black text-earth md:text-4xl">
            Utilisateurs
          </h1>
          <p className="text-trail">
            {users.length} compte{users.length > 1 ? "s" : ""}
            {isFiltered ? " correspondant aux filtres" : " actif ou suspendu"}
          </p>
        </div>
        {can(currentUser, "user.approve") ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/utilisateurs/nouveau-jeune">
              <UserPlus className="size-4" />
              Nouveau compte enfant
            </Link>
          </Button>
        ) : null}
      </header>

      {/* Recherche + filtres : formulaire GET, l'état vit dans l'URL (partageable,
          rechargeable) et la page reste un Server Component. */}
      <UserFiltersForm
        key={filtersKey}
        className="grid gap-3 rounded-2xl bg-snow p-4 shadow-card md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto]"
      >
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Recherche
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-trail" />
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nom, prénom, e-mail…"
              className="pl-9"
            />
          </div>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Rôle
          </span>
          <select
            name="role"
            defaultValue={params.role ?? ""}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            <option value="">Tous</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Unité
          </span>
          <select
            name="unit"
            defaultValue={params.unit ?? ""}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            <option value="">Toutes</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Statut
          </span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            <option value="">Actifs et suspendus</option>
            <option value="ACTIVE">Actifs</option>
            <option value="SUSPENDED">Suspendus</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          {/* Les listes déroulantes filtrent au changement ; ce bouton reste
              l'affordance du champ de recherche (équivalent d'Entrée). */}
          <Button type="submit" className="flex-1">
            Rechercher
          </Button>
          {isFiltered || sort !== "status" ? (
            <Button asChild variant="outline">
              <Link href="/admin/utilisateurs">Reset</Link>
            </Button>
          ) : null}
        </div>
        {/* Sur desktop le tri se pilote par les en-têtes du tableau ; ce select
            reste masqué mais soumis, ce qui conserve le tri courant au filtrage
            (un champ caché en plus enverrait « sort » deux fois). */}
        <label className="space-y-1.5 md:hidden">
          <span className="text-xs font-bold uppercase tracking-wider text-trail">
            Trier par
          </span>
          <select
            name="sort"
            defaultValue={sort}
            className="h-10 w-full rounded-md border border-input bg-snow px-3 text-sm"
          >
            {Object.entries(SORT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </UserFiltersForm>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description={
            isFiltered
              ? "Aucun compte ne correspond à cette recherche."
              : "Aucun compte ACTIVE ni SUSPENDED."
          }
        />
      ) : (
        <>
          {/* Mobile : cartes */}
          <ul className="space-y-3 md:hidden">
            {users.map((u) => {
              const isSelf = u.id === currentUser.id;
              const suspended = u.status === "SUSPENDED";
              const roles = parseRoles(u.roles);
              // La SECRÉTAIRE ne peut pas gérer un compte ADMIN/RG (l'ADMIN, si).
              const canManage =
                isAdmin || !roles.some((r) => PRIVILEGED_ROLES.has(r));
              return (
                <li
                  key={u.id}
                  className={cn(
                    "rounded-2xl bg-snow p-4 shadow-card space-y-3",
                    suspended && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-earth">
                        {u.firstName} {u.lastName}
                        {isSelf ? (
                          <span className="ml-1 rounded-full bg-sand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-trail">
                            toi
                          </span>
                        ) : null}
                      </p>
                      {u.canLogin === false ? (
                        <span className="inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-trail">
                          Compte sans connexion (parent)
                        </span>
                      ) : (
                        <p className="text-xs text-trail">{u.email}</p>
                      )}
                      {u.unit ? <p className="text-xs text-trail">{u.unit}</p> : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                        suspended ? "bg-brick-soft text-brick-ink" : "bg-forest-soft text-forest-ink",
                      )}
                    >
                      {suspended ? "Suspendu" : "Actif"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-trail">{roleLabels(roles)}</p>
                    {canManage ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/utilisateurs/${u.id}/modifier`}>
                          <Pencil className="size-4" />
                          Modifier
                        </Link>
                      </Button>
                    ) : (
                      <p className="inline-flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-[11px] font-bold text-trail">
                        <Lock className="size-3" />
                        Compte protégé — réservé à l&apos;administrateur
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop : tableau */}
          <div className="hidden overflow-hidden rounded-2xl bg-snow shadow-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-stone bg-sand text-left text-xs font-bold uppercase tracking-wider text-trail">
                <tr>
                  <th className="px-4 py-3">
                    <SortLink label="Membre" {...sortColumn("name")} />
                  </th>
                  <th className="px-4 py-3">
                    <SortLink label="Unité" {...sortColumn("unit")} />
                  </th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">
                    <SortLink label="Statut" {...sortColumn("status")} />
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const suspended = u.status === "SUSPENDED";
                  const roles = parseRoles(u.roles);
                  const canManage =
                    isAdmin || !roles.some((r) => PRIVILEGED_ROLES.has(r));
                  return (
                    <tr
                      key={u.id}
                      className={cn("border-t border-stone/60", suspended && "opacity-60")}
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-earth">
                          {u.firstName} {u.lastName}
                          {isSelf ? (
                            <span className="ml-1 rounded-full bg-sand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-trail">
                              toi
                            </span>
                          ) : null}
                        </p>
                        {u.canLogin === false ? (
                          <span className="inline-flex items-center rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-trail">
                            Compte sans connexion (parent)
                          </span>
                        ) : (
                          <p className="text-xs text-trail">{u.email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-trail">{u.unit ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-trail">{roleLabels(roles)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                            suspended ? "bg-brick-soft text-brick-ink" : "bg-forest-soft text-forest-ink",
                          )}
                        >
                          {suspended ? "Suspendu" : "Actif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!canManage ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-trail">
                              <Lock className="size-3" />
                              Protégé
                            </span>
                          ) : (
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/admin/utilisateurs/${u.id}/modifier`}>
                                <Pencil className="size-4" />
                                Modifier
                              </Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
