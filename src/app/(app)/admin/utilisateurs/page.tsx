import { Lock, Pencil, UserPlus, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABEL, type Role } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { requireCan } from "@/lib/require-can";
import { cn } from "@/lib/utils";
import { listManageableUsers } from "@/modules/admin/queries";

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

function roleLabels(roles: string[]): string {
  if (roles.length === 0) return "Aucun rôle";
  return roles.map((r) => ROLE_LABEL[r as Role] ?? r).join(", ");
}

export default async function AdminUtilisateursPage() {
  // US-32 — gestion des comptes & rôles : ADMIN + SECRÉTAIRE.
  const currentUser = await requireCan("user.manage");
  const users = await listManageableUsers();
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
            {users.length} compte{users.length > 1 ? "s" : ""} actif ou suspendu
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

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Aucun compte ACTIVE ni SUSPENDED."
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
                  <th className="px-4 py-3">Membre</th>
                  <th className="px-4 py-3">Unité</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Statut</th>
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
