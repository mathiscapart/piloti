import { Users } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/get-current-user";
import { cn } from "@/lib/utils";
import { listManageableUsers } from "@/modules/admin/queries";

import {
  ReactivateButton,
  RoleSelect,
  SuspendButton,
} from "./user-actions";

export default async function AdminUtilisateursPage() {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    listManageableUsers(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-trail">
          Administration
        </p>
        <h1 className="text-3xl font-black text-earth md:text-4xl">
          Utilisateurs
        </h1>
        <p className="text-trail">
          {users.length} compte{users.length > 1 ? "s" : ""} actif ou suspendu
        </p>
      </header>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Aucun compte ACTIVE ni SUSPENDED."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-snow shadow-card">
          <table className="w-full text-sm">
            <thead className="border-b border-stone bg-sand text-left text-xs font-bold uppercase tracking-wider text-trail">
              <tr>
                <th className="px-4 py-3">Membre</th>
                <th className="hidden px-4 py-3 md:table-cell">Unité</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const suspended = u.status === "SUSPENDED";
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-t border-stone/60",
                      suspended && "opacity-60",
                    )}
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
                      <p className="text-xs text-trail">{u.email}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-trail md:table-cell">
                      {u.unit ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        userId={u.id}
                        role={u.role}
                        disabled={isSelf}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                          suspended
                            ? "bg-brick-soft text-brick-ink"
                            : "bg-forest-soft text-forest-ink",
                        )}
                      >
                        {suspended ? "Suspendu" : "Actif"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-trail">—</span>
                      ) : suspended ? (
                        <ReactivateButton
                          userId={u.id}
                          fullName={`${u.firstName} ${u.lastName}`}
                        />
                      ) : (
                        <SuspendButton
                          userId={u.id}
                          fullName={`${u.firstName} ${u.lastName}`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
